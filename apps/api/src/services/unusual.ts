/**
 * Unusual messages (anomaly v2, rare-template surprise) over the stored logs: the last
 * UNUSUAL_RECENT_S seconds against the hour before. Clues, not alerts: on Loghub BGL a plain
 * "flag error lines" rule scores higher (bench/results/RESULTS-anomaly-v2.md).
 */
import { UNUSUAL_BASELINE_S, UNUSUAL_RECENT_S, type UnusualResult, unusualTemplates } from '@chronolog/engine';
import * as logRepository from '../db/logRepository';
import { MAX_RCA_LINES } from './rootRank';

export interface UnusualResponse extends UnusualResult {
  at: string;
  recentSeconds: number;
  baselineSeconds: number;
  /** True if the line cap was hit, so the oldest part of the baseline is missing. */
  isTruncated: boolean;
}

export async function currentUnusual(nowMs: number = Date.now()): Promise<UnusualResponse> {
  const since = new Date(nowMs - (UNUSUAL_RECENT_S + UNUSUAL_BASELINE_S) * 1000).toISOString();
  const stored = await logRepository.getLogsSince(since, MAX_RCA_LINES);
  const lines = stored.map((log) => ({
    id: log.id,
    timestamp: new Date(log.timestamp).getTime() / 1000,
    service: log.source,
    message: log.message,
  }));
  return {
    at: new Date(nowMs).toISOString(),
    recentSeconds: UNUSUAL_RECENT_S,
    baselineSeconds: UNUSUAL_BASELINE_S,
    isTruncated: lines.length >= MAX_RCA_LINES,
    ...unusualTemplates(lines, nowMs / 1000),
  };
}
