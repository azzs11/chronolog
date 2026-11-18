/**
 * Log Processor: central orchestrator for all log enrichment.
 *
 * Every incoming log (from REST, WebSocket, or the generator) flows through
 * processLog in order:
 *   1. Normalise fields
 *   2. ML classification  (optional, degrades gracefully)
 *   3. Causal analysis    (always on, in-memory)
 *   4. Anomaly detection  (always on, in-memory)
 *   5. Persist to DB      (in-memory fallback when Postgres is unavailable)
 *   6. Broadcast via WebSocket + update Prometheus counters
 */
import { randomUUID } from 'crypto';
import type { ChainDetectedEvent } from '@chronolog/engine';
import { VALID_SEVERITIES } from '../config/constants';
import * as mlService from './mlService';
import * as causalEngine from './causalEngine';
import * as anomalyDetector from './anomalyDetector';
import * as logRepository from '../db/logRepository';
import { logsProcessed, causalLinksDetected, anomaliesDetected } from '../middleware/metrics';
import logger from '../config/logger';
import type { LogStats, ProcessedLog, RawLogInput } from '../types';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_SOURCE_LENGTH = 100;
const CHAIN_ALERT_DEPTH = 3;
const CHAIN_PREVIEW_SIZE = 6;
const PREVIEW_MESSAGE_MAX = 60;

export interface NewCausalLinkEvent {
  type: 'new-causal-link';
  log_id: string;
  parent_id: string;
  root_id: string | null;
  depth: number;
  blast_radius: number;
}

export type CausalEvent = NewCausalLinkEvent | ChainDetectedEvent;

export interface Emitters {
  emitLog?: (log: ProcessedLog) => void;
  emitStats?: (stats: LogStats) => void;
  emitCausalEvent?: (event: CausalEvent) => void;
}

// Socket emitters are injected after startup to avoid circular imports.
let emitLog: (log: ProcessedLog) => void = () => undefined;
let emitStats: (stats: LogStats) => void = () => undefined;
let emitCausal: (event: CausalEvent) => void = () => undefined;

export function setEmitters(emitters: Emitters): void {
  emitLog = emitters.emitLog ?? emitLog;
  emitStats = emitters.emitStats ?? emitStats;
  emitCausal = emitters.emitCausalEvent ?? emitCausal;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export async function processLog(logData: RawLogInput): Promise<ProcessedLog> {
  // 1. Normalise
  const log: ProcessedLog = {
    id: logData.id || randomUUID(),
    message: (logData.message || 'No message').trim().slice(0, MAX_MESSAGE_LENGTH),
    severity: logData.severity && VALID_SEVERITIES.includes(logData.severity) ? logData.severity : 'info',
    source: (logData.source || 'unknown').slice(0, MAX_SOURCE_LENGTH),
    timestamp: logData.timestamp || new Date().toISOString(),
    ml: null,
    causal: null,
    is_anomaly: false,
    anomaly_score: 0,
    fingerprint_hash: null,
  };

  // 2. ML classification
  try {
    const mlResult = await mlService.classify(log.message);
    if (mlResult) {
      log.ml = {
        predicted_severity: mlResult.predicted_severity,
        confidence: mlResult.confidence,
        probabilities: mlResult.probabilities,
        severity_match: mlResult.predicted_severity === log.severity,
      };
    }
  } catch (err) {
    logger.debug('ML classification skipped', { error: errorMessage(err) });
  }

  // 3. Causal analysis
  const causalResult = causalEngine.analyzeLog(log);
  log.causal = causalResult;

  // 4. Anomaly detection
  const anomalyResult = anomalyDetector.analyze(log);
  log.is_anomaly = anomalyResult.isAnomaly;
  log.anomaly_score = anomalyResult.anomalyScore;
  log.fingerprint_hash = anomalyResult.fingerprintHash;

  // 5. Persist
  try {
    await logRepository.insertLog(log);
  } catch (err) {
    logger.error('Failed to persist log', { logId: log.id, error: errorMessage(err) });
  }

  // 6. Prometheus counters
  logsProcessed.inc({ severity: log.severity });
  if (causalResult.causal_parent_id) causalLinksDetected.inc();
  if (anomalyResult.isAnomaly) anomaliesDetected.inc();

  // 7. Broadcast
  emitLog(log);

  logRepository
    .getStats()
    .then((stats) => emitStats(stats))
    .catch(() => undefined);

  if (causalResult.causal_parent_id) {
    emitCausal({
      type: 'new-causal-link',
      log_id: log.id,
      parent_id: causalResult.causal_parent_id,
      root_id: causalResult.causal_root_id,
      depth: causalResult.causal_chain_depth,
      blast_radius: causalResult.blast_radius_score,
    });

    // Deep chain alert: the frontend can surface the full root-cause narrative.
    if (causalResult.causal_chain_depth >= CHAIN_ALERT_DEPTH && causalResult.causal_root_id) {
      const chain = causalEngine.getChainById(causalResult.causal_root_id);
      emitCausal({
        type: 'causal-chain-detected',
        root_id: causalResult.causal_root_id,
        triggering_log_id: log.id,
        chain_depth: causalResult.causal_chain_depth,
        total_affected: chain.length,
        blast_radius_score: parseFloat(chain.reduce((s, l) => s + (l.blast_radius_score ?? 0), 0).toFixed(3)),
        chain_preview: chain.slice(0, CHAIN_PREVIEW_SIZE).map((l) => ({
          id: l.id,
          severity: l.severity,
          message: l.message.slice(0, PREVIEW_MESSAGE_MAX),
          source: l.source,
        })),
      });
    }
  }

  return log;
}
