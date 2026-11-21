/**
 * Service moods for the app's creatures, computed over the stored logs. Done on the server because
 * a mood compares the last few minutes with the quarter hour before, which is more history than the
 * live page holds when it opens.
 */
import { BASELINE_S, RECENT_S, type ServiceMood, serviceMoods } from '@chronolog/engine';
import * as logRepository from '../db/logRepository';
import { MAX_RCA_LINES } from './rootRank';

export interface MoodsResult {
  /** The moment the moods describe (ISO). */
  at: string;
  recentSeconds: number;
  baselineSeconds: number;
  /** Lines read; if this equals the cap, the oldest part of the baseline was cut off. */
  lines: number;
  isTruncated: boolean;
  moods: ServiceMood[];
}

export async function currentMoods(nowMs: number = Date.now()): Promise<MoodsResult> {
  const since = new Date(nowMs - (RECENT_S + BASELINE_S) * 1000).toISOString();
  const stored = await logRepository.getLogsSince(since, MAX_RCA_LINES);
  const lines = stored.map((log) => ({
    id: log.id,
    timestamp: new Date(log.timestamp).getTime() / 1000,
    service: log.source,
    severity: log.severity,
    message: log.message,
  }));
  return {
    at: new Date(nowMs).toISOString(),
    recentSeconds: RECENT_S,
    baselineSeconds: BASELINE_S,
    lines: lines.length,
    isTruncated: lines.length >= MAX_RCA_LINES,
    moods: serviceMoods(lines, nowMs / 1000),
  };
}
