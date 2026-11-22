/**
 * The simulated system behind the static demo. The engine's simulator writes the logs of a small
 * six-service shop; this class lays them out on the real clock so the app's views (inbox, case file,
 * town, live stream) have something to show without a backend. Everything is seeded, so every
 * visitor sees the same story: one incident earlier on, one in progress when the page opens.
 */
import {
  type FaultKind,
  type RcaLine,
  Rng,
  type SimService,
  isObservable,
  randomFault,
  simulateIncident,
} from '@chronolog/engine';

/** A simulated line; the simulator always sets a level, like the API's stored logs. */
export type DemoLine = RcaLine & { severity: string };

export interface DemoFault {
  service: SimService;
  fault: FaultKind;
}

/** One stretch of simulated traffic, `offset` seconds from the moment the page opened. */
export interface Segment {
  offset: number;
  seconds: number;
  seed: number;
  /** Absent: normal traffic. */
  fault?: DemoFault;
}

/** A fault the world contains, with its known cause (the demo can say whether ChronoLog got it right). */
export interface KnownIncident extends DemoFault {
  /** Unix seconds the fault started. */
  start: number;
}

/**
 * What a visitor finds when the page opens: 40 minutes of history with a disk fault 25 minutes ago,
 * and a packet-loss fault that began 4 minutes ago and clears 2 minutes after opening. The two faults
 * were picked because they look different (one breaks a service loudly, one makes its callers
 * complain), not because ChronoLog ranks them well; the inbox shows how it does.
 */
export const OPENING_SCHEDULE: readonly Segment[] = [
  { offset: -2400, seconds: 900, seed: 11 },
  { offset: -1500, seconds: 240, seed: 12, fault: { service: 'catalog', fault: 'disk' } },
  { offset: -1260, seconds: 1020, seed: 13 },
  { offset: -240, seconds: 360, seed: 14, fault: { service: 'cart', fault: 'loss' } },
];

/** Normal traffic is generated ahead of the clock in chunks of this many seconds. */
export const CHUNK_S = 300;
/** Lines older than this are dropped (the inbox looks back 60 minutes). */
export const KEEP_S = 65 * 60;
/** An injected incident replaces this much recent history: 4 minutes normal, then 4 minutes of fault. */
export const INJECT_BASELINE_S = 240;
export const INJECT_FAULT_S = 240;

export class DemoWorld {
  private lines: DemoLine[] = [];
  private generatedUntil: number;
  private nextId = 0;
  private nextSeed = 1000;
  readonly known: KnownIncident[] = [];

  /** @param openedAt Unix seconds the page opened; the schedule is placed around it. */
  constructor(
    readonly openedAt: number,
    schedule: readonly Segment[] = OPENING_SCHEDULE,
  ) {
    this.generatedUntil = Math.floor(openedAt) + (schedule[0]?.offset ?? 0);
    for (const segment of schedule) this.append(segment);
  }

  /** Simulate one segment and add its lines, renumbered so ids stay unique across segments. */
  private append(segment: Segment): void {
    const start = Math.floor(this.openedAt) + segment.offset;
    const fault = segment.fault ?? { service: 'db', fault: 'cpu' }; // ignored: no fault seconds
    const sim = simulateIncident({
      seed: segment.seed,
      service: fault.service,
      fault: fault.fault,
      baselineSeconds: segment.fault ? 0 : segment.seconds,
      incidentSeconds: segment.fault ? segment.seconds : 0,
      startEpoch: start,
    });
    for (const line of sim.lines) this.lines.push({ ...line, id: lineId(this.nextId++), severity: line.severity ?? 'info' });
    if (segment.fault) this.known.push({ ...segment.fault, start });
    this.generatedUntil = Math.max(this.generatedUntil, start + segment.seconds);
  }

  /** Keep normal traffic generated a chunk ahead of `now`, and forget lines too old to matter. */
  private advance(now: number): void {
    while (this.generatedUntil < now + CHUNK_S) {
      this.append({ offset: this.generatedUntil - Math.floor(this.openedAt), seconds: CHUNK_S, seed: this.nextSeed++ });
    }
    const oldest = now - KEEP_S;
    if ((this.lines[0]?.timestamp ?? oldest) < oldest) this.lines = this.lines.slice(firstAtOrAfter(this.lines, oldest));
  }

  /** Lines with `from <= timestamp <= now`, oldest first. Lines "in the future" have not happened yet. */
  linesBetween(from: number, to: number, now: number): DemoLine[] {
    this.advance(now);
    const end = Math.min(to, now);
    return this.lines.slice(firstAtOrAfter(this.lines, from), firstAtOrAfter(this.lines, end + 1));
  }

  /** The last `count` lines up to `now`. */
  latest(count: number, now: number): DemoLine[] {
    this.advance(now);
    const end = firstAtOrAfter(this.lines, now + 1);
    return this.lines.slice(Math.max(0, end - count), end);
  }

  /**
   * Replace the last 8 minutes with a fault whose cause is known, the way the real API's test-incident
   * button backfills one. Picks a random observable fault unless one is given.
   */
  inject(now: number, choice?: DemoFault, seed: number = Math.floor(Math.random() * 2_147_483_647)): KnownIncident {
    this.advance(now);
    const { service, fault } = choice ?? randomFault(new Rng(seed));
    if (!isObservable(service, fault)) throw new Error(`A ${fault} fault on ${service} leaves no logs to find.`);
    const from = Math.floor(now) - INJECT_BASELINE_S - INJECT_FAULT_S;
    // Drop everything from `from` on, including lines generated ahead of the clock: a fault still
    // running (the opening one) must not carry on underneath the injected one.
    this.lines = this.lines.slice(0, firstAtOrAfter(this.lines, from));
    this.known.splice(0, this.known.length, ...this.known.filter((k) => k.start < from));
    this.generatedUntil = from;
    const base = Math.floor(this.openedAt);
    this.append({ offset: from - base, seconds: INJECT_BASELINE_S, seed });
    this.append({ offset: from + INJECT_BASELINE_S - base, seconds: INJECT_FAULT_S, seed: seed + 1, fault: { service, fault } });
    const injected = this.known[this.known.length - 1] as KnownIncident;
    this.advance(now); // normal traffic again after the injected fault
    return injected;
  }
}

/**
 * A UUID-looking id: a reversible 32-bit mix of the counter, so ids are unique and the short form the
 * evidence chips show (the first characters) differs from line to line, as real UUIDs do.
 */
function lineId(n: number): string {
  let x = Math.imul(n + 1, 0x9e3779b1) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  return `${x.toString(16).padStart(8, '0')}-${n.toString(16)}`;
}

/** Index of the first line at or after `t` (lines are sorted by time). */
function firstAtOrAfter(lines: readonly RcaLine[], t: number): number {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((lines[mid] as RcaLine).timestamp < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
