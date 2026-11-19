/**
 * RootRank for the live app: rank which service most likely caused an incident.
 *
 * Wraps the pure engine function with what it cannot know: where the logs come from (the log
 * store, or logs sent in the request). The caller says something went wrong in the window and may
 * say when it began. If they do not, the engine estimates the start from the biggest change in log
 * behaviour. That keeps most of the accuracy (see bench/results/RESULTS-autostart.md), but it
 * locates a change; it does not decide whether an incident happened, so this never answers "no incident".
 */
import {
  learnServiceGraph,
  type LearnedGraph,
  ROOTRANK_V1,
  rankRootCauses,
  WindowTooShortError,
  type RankResult,
  type RcaLine,
} from '@chronolog/engine';
import * as logRepository from '../db/logRepository';

export const DEFAULT_LOOKBACK_MINUTES = 15;
export const MAX_LOOKBACK_MINUTES = 120;
export const MAX_RCA_LINES = 50_000;

export interface RcaInput {
  logs?: RcaLine[];
  /** Unix seconds. If missing, the engine estimates it. */
  incidentStart?: number;
  lookbackMinutes?: number;
}

export interface RcaOutput extends RankResult {
  model: { id: string; trainedOn?: string };
  warnings: string[];
}

export class RcaError extends Error {
  constructor(
    readonly code: 'no_logs' | 'window_too_short',
    message: string,
  ) {
    super(message);
  }
}

async function storedLines(lookbackMinutes: number): Promise<RcaLine[]> {
  const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();
  const stored = await logRepository.getLogsSince(since, MAX_RCA_LINES);
  return stored.map((log) => ({
    id: log.id,
    timestamp: new Date(log.timestamp).getTime() / 1000,
    service: log.source,
    message: log.message,
    severity: log.severity,
  }));
}

function warningsFor(result: RankResult): string[] {
  const warnings: string[] = [];
  if (result.startSource === 'estimated') {
    warnings.push('The incident start was estimated from the logs. Pass incident_start if you know it: accuracy is higher.');
  }
  if (result.baselineLines === 0) {
    warnings.push('No log lines before the incident start, so nothing shows what normal looked like.');
  }
  if (result.candidates.length < 2) warnings.push('Only one service logged, so there is nothing to rank.');
  return warnings;
}

export async function rankIncident(input: RcaInput): Promise<RcaOutput> {
  const lines = input.logs ?? (await storedLines(input.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES));
  if (lines.length === 0) throw new RcaError('no_logs', 'No logs in the requested window.');
  try {
    const result = rankRootCauses(lines, input.incidentStart, ROOTRANK_V1);
    return {
      ...result,
      model: { id: ROOTRANK_V1.id, trainedOn: ROOTRANK_V1.trained_on },
      warnings: warningsFor(result),
    };
  } catch (err) {
    if (err instanceof WindowTooShortError) throw new RcaError('window_too_short', err.message);
    throw err;
  }
}

/** The service graph learned from the stored logs of the lookback window. */
export async function learnGraph(lookbackMinutes: number): Promise<LearnedGraph & { lines: number }> {
  const lines = await storedLines(lookbackMinutes);
  if (lines.length === 0) throw new RcaError('no_logs', 'No logs in the requested window.');
  return { ...learnServiceGraph(lines), lines: lines.length };
}
