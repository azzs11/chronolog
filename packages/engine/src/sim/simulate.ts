/**
 * Generate the logs of a small microservice system in which one service has a fault. Everything is
 * seeded, so the same options always give the same incident. The truth (which service, which
 * fault) is returned next to the lines so a guess can be scored.
 */
import type { RcaLine } from '../rootrank/types';
import { CRASH_OUTAGE_S, FAULT_KINDS, type FaultKind, TIMEOUT_MS } from './faults';
import { Rng } from './rng';
import {
  BACKGROUND_EVERY_S,
  BASE_LATENCY_MS,
  FLOWS,
  SERVICES,
  type SimService,
  backgroundMessage,
  handledMessage,
} from './system';

export interface SimOptions {
  seed: number;
  service: SimService;
  fault: FaultKind;
  /** Seconds of normal traffic before the fault. */
  baselineSeconds?: number;
  /** Seconds of traffic after the fault starts. */
  incidentSeconds?: number;
  /** Unix seconds of the first line. */
  startEpoch?: number;
}

export interface SimIncident {
  lines: RcaLine[];
  /** Unix seconds when the fault started. */
  incidentStart: number;
  truth: { service: SimService; fault: FaultKind };
  /** Services whose logs show the fault (the broken one and the callers that noticed). */
  affected: SimService[];
  services: readonly SimService[];
}

export const DEFAULT_BASELINE_S = 240;
export const DEFAULT_INCIDENT_S = 240;
export const DEFAULT_START_EPOCH = 1_700_000_000;
const REQUESTS_PER_SECOND = [5, 8] as const;
const NETWORK_DELAY_MS = 1500;
const CPU_SLOWDOWN = 6;
/** Queueing delay (ms) a CPU-starved service adds on top of its slowdown. */
const CPU_QUEUE_MS = [300, 3300] as const;
const LOSS_PROBABILITY = 0.2;

/**
 * A fault the logs can show. Nothing in the gateway's logs reveals a slow or lossy network to it,
 * because its callers are outside the system, so those two combinations are not offered.
 */
export function isObservable(service: SimService, fault: FaultKind): boolean {
  return !(service === 'gateway' && (fault === 'delay' || fault === 'loss'));
}

export function randomFault(rng: Rng): { service: SimService; fault: FaultKind } {
  for (;;) {
    const service = rng.pick(SERVICES);
    const fault = rng.pick(FAULT_KINDS);
    if (isObservable(service, fault)) return { service, fault };
  }
}

class Simulation {
  readonly lines: RcaLine[] = [];
  readonly affected = new Set<SimService>();
  private readonly rng: Rng;
  private readonly epoch: number;
  private readonly onset: number;
  private nextId = 0;

  constructor(private readonly options: Required<SimOptions>) {
    this.rng = new Rng(options.seed);
    this.epoch = options.startEpoch;
    this.onset = options.baselineSeconds;
  }

  private emit(t: number, service: SimService, severity: string, message: string, isFault = false): void {
    this.lines.push({ id: `sim-${this.nextId++}`, timestamp: this.epoch + t, service, severity, message });
    if (isFault) this.affected.add(service);
  }

  private slowedByCpu(ms: number): number {
    return ms * CPU_SLOWDOWN + this.rng.int(CPU_QUEUE_MS[0], CPU_QUEUE_MS[1]);
  }

  private isBroken(service: SimService, t: number): boolean {
    return service === this.options.service && t >= this.onset;
  }

  private isDown(service: SimService, t: number): boolean {
    return this.options.fault === 'crash' && this.isBroken(service, t) && t < this.onset + CRASH_OUTAGE_S;
  }

  /** One call from `caller` to `callee`. Returns false if the request fails here. */
  private call(t: number, caller: string, callee: SimService, op: string): boolean {
    const { fault } = this.options;
    const broken = this.isBroken(callee, t);
    const caller_ = caller as SimService;
    const log = (sev: string, message: string) => {
      if (caller !== 'client') this.emit(t, caller_, sev, message, true);
    };
    let ms = this.rng.latency(BASE_LATENCY_MS[callee]);
    if (broken && this.isDown(callee, t)) {
      log('error', `connection refused to ${callee}:${8000 + SERVICES.indexOf(callee)}`);
      return false;
    }
    if (broken && fault === 'cpu') ms = this.slowedByCpu(ms);
    if (broken && fault === 'loss' && this.rng.chance(LOSS_PROBABILITY)) {
      log('warning', `retrying request to ${callee} (attempt 2)`);
      if (this.rng.chance(0.25)) {
        log('error', `request to ${callee} failed after 3 attempts`);
        return false;
      }
    }
    this.emit(t, callee, 'info', handledMessage(callee, op, ms, this.rng));
    if (broken && fault === 'disk' && this.rng.chance(0.5)) {
      this.emit(t, callee, 'error', `no space left on device while writing /var/lib/${callee}/wal-${this.rng.int(1, 9)}.log`, true);
      log('warning', `${callee} returned 500`);
      return false;
    }
    if (broken && fault === 'cpu' && ms > TIMEOUT_MS) {
      log('warning', `timeout calling ${callee} after ${TIMEOUT_MS}ms`);
      return false;
    }
    if (broken && fault === 'delay' && this.rng.chance(0.4)) {
      log('warning', `slow response from ${callee} (${ms + NETWORK_DELAY_MS + this.rng.int(0, 400)}ms)`);
      return ms + NETWORK_DELAY_MS < TIMEOUT_MS * 2;
    }
    return true;
  }

  private request(t: number): void {
    const flow = this.rng.pick(FLOWS);
    const [, entry, entryOp] = flow.hops[0] as (typeof flow.hops)[number];
    if (this.isDown(entry, t)) return; // the gateway is down: nothing is handled, nothing is logged
    let ok = true;
    for (const [caller, callee, op] of flow.hops.slice(1)) {
      if (!this.call(t, caller, callee, op)) {
        ok = false;
        break;
      }
    }
    const base = this.rng.latency(BASE_LATENCY_MS[entry]);
    const ms = this.isBroken(entry, t) && this.options.fault === 'cpu' ? this.slowedByCpu(base) : base;
    if (ok) {
      this.emit(t, entry, 'info', handledMessage(entry, entryOp, ms, this.rng));
      if (this.isBroken(entry, t) && this.options.fault === 'disk' && this.rng.chance(0.5)) {
        this.emit(t, entry, 'error', `no space left on device while writing /var/lib/${entry}/wal-${this.rng.int(1, 9)}.log`, true);
      }
    } else {
      this.emit(t, entry, 'error', `GET /api/${entryOp}/${this.rng.int(1, 5000)} 503 ${ms}ms upstream failure`, true);
    }
  }

  private background(t: number): void {
    SERVICES.forEach((service, i) => {
      if (this.isDown(service, t)) return;
      if (t % BACKGROUND_EVERY_S === i % BACKGROUND_EVERY_S) this.emit(t, service, 'info', backgroundMessage(service, this.rng));
    });
  }

  private onsetEffects(t: number): void {
    const { service, fault } = this.options;
    if (fault === 'crash' && t === this.onset) this.emit(t, service, 'info', 'received SIGTERM, shutting down', true);
    if (fault === 'crash' && t === this.onset + CRASH_OUTAGE_S) {
      this.emit(t, service, 'info', `${service} v2.3.1 starting`, true);
      this.emit(t, service, 'info', 'listening on port 8080', true);
      this.emit(t, service, 'info', 'connection pool initialized (size=10)', true);
    }
    if (fault === 'memory' && t >= this.onset && t % 10 === 3) {
      this.emit(t, service, 'warning', `GC pause of ${this.rng.int(300, 900)}ms exceeded threshold`, true);
    }
  }

  run(): void {
    const total = this.options.baselineSeconds + this.options.incidentSeconds;
    for (let t = 0; t < total; t++) {
      this.onsetEffects(t);
      this.background(t);
      const requests = this.rng.int(REQUESTS_PER_SECOND[0], REQUESTS_PER_SECOND[1]);
      for (let r = 0; r < requests; r++) this.request(t);
    }
    this.affected.add(this.options.service);
  }
}

export function simulateIncident(options: SimOptions): SimIncident {
  const full: Required<SimOptions> = {
    baselineSeconds: DEFAULT_BASELINE_S,
    incidentSeconds: DEFAULT_INCIDENT_S,
    startEpoch: DEFAULT_START_EPOCH,
    ...options,
  };
  const sim = new Simulation(full);
  sim.run();
  return {
    lines: sim.lines,
    incidentStart: full.startEpoch + full.baselineSeconds,
    truth: { service: full.service, fault: full.fault },
    affected: SERVICES.filter((s) => sim.affected.has(s)),
    services: SERVICES,
  };
}
