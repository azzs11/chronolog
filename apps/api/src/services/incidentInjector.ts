/**
 * Backfill a simulated incident into the log store, so the Root Cause view can be tried end to end
 * with a fault whose cause is known. The logs come from the engine's simulator and end "now".
 * This is a demo helper behind the admin key. Ids are UUIDs because the database column is one.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_BASELINE_S,
  DEFAULT_INCIDENT_S,
  Rng,
  isObservable,
  randomFault,
  simulateIncident,
  type FaultKind,
  type SimService,
} from '@chronolog/engine';
import * as logRepository from '../db/logRepository';
import type { ProcessedLog } from '../types';

const INSERT_CONCURRENCY = 100;

export interface InjectInput {
  service?: SimService;
  fault?: FaultKind;
  seed?: number;
}

export interface InjectResult {
  truth: { service: SimService; fault: FaultKind };
  seed: number;
  lines: number;
  /** ISO time the fault began. */
  incidentStart: string;
}

export class UnobservableFaultError extends Error {}

export async function injectIncident(input: InjectInput): Promise<InjectResult> {
  const seed = input.seed ?? Math.floor(Math.random() * 2_147_483_647);
  const picked = input.service && input.fault ? { service: input.service, fault: input.fault } : randomFault(new Rng(seed));
  const service = input.service ?? picked.service;
  const fault = input.fault ?? picked.fault;
  if (!isObservable(service, fault)) {
    throw new UnobservableFaultError(`A ${fault} fault on ${service} leaves no logs to find, so it is not offered.`);
  }
  const startEpoch = Math.floor(Date.now() / 1000) - (DEFAULT_BASELINE_S + DEFAULT_INCIDENT_S);
  const incident = simulateIncident({ seed, service, fault, startEpoch });
  const logs: ProcessedLog[] = incident.lines.map((line) => ({
    id: randomUUID(),
    message: line.message,
    severity: line.severity ?? 'info',
    source: line.service,
    timestamp: new Date(line.timestamp * 1000).toISOString(),
    ml: null,
    causal: null,
    is_anomaly: false,
    anomaly_score: 0,
    fingerprint_hash: null,
  }));
  for (let at = 0; at < logs.length; at += INSERT_CONCURRENCY) {
    await Promise.all(logs.slice(at, at + INSERT_CONCURRENCY).map((log) => logRepository.insertLog(log)));
  }
  return { truth: incident.truth, seed, lines: logs.length, incidentStart: new Date(incident.incidentStart * 1000).toISOString() };
}
