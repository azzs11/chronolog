/**
 * Incidents: bursts of error-level lines found in the stored logs, each with a RootRank ranking.
 *
 * An incident id is `inc-<unix seconds of the burst start>`. The burst is found again from the logs
 * whenever it is asked for, so nothing about an incident is stored except engineers' feedback. A
 * burst is a detected pattern, not a verified incident.
 */
import {
  type Burst,
  type LearnedGraph,
  type RankResult,
  type RcaLine,
  findErrorBursts,
  learnServiceGraph,
  rankRootCauses,
  ROOTRANK_V1,
} from '@chronolog/engine';
import * as feedbackRepository from '../db/feedbackRepository';
import * as logRepository from '../db/logRepository';
import type { StoredLog } from '../types';
import { MAX_RCA_LINES } from './rootRank';

export const DEFAULT_INCIDENT_LOOKBACK_MINUTES = 60;
export const MAX_INCIDENT_LOOKBACK_MINUTES = 24 * 60;
/** How much normal traffic before a burst is shown, so the ranking can compare against it. */
export const BASELINE_BEFORE_S = 600;
/** How long after a burst ends the window still reaches. */
export const MARGIN_AFTER_S = 120;
export const TIMELINE_BUCKET_S = 30;
const INCIDENT_ID = /^inc-(\d{9,11})$/;

export type ReviewStatus = 'unreviewed' | 'confirmed' | 'rejected';

export interface IncidentSummary {
  id: string;
  start: string;
  end: string;
  durationSeconds: number;
  errorLines: number;
  services: Array<{ service: string; errors: number }>;
  impact: number;
  status: ReviewStatus;
  /** The service an engineer named as the real cause, if reviewed. */
  correctService: string | null;
}

export interface IncidentTimeline {
  bucketSeconds: number;
  /** Seconds from the burst start to the first bucket (negative: the window begins before it). */
  startOffset: number;
  services: Array<{ name: string; lines: number[]; errors: number[] }>;
}

export interface IncidentDetail {
  incident: IncidentSummary;
  ranking: RankResult;
  timeline: IncidentTimeline;
  graph: LearnedGraph;
  windowLines: number;
}

export class IncidentNotFoundError extends Error {}
export class NoCandidatesError extends Error {}

const toLine = (log: StoredLog): RcaLine => ({
  id: log.id,
  timestamp: new Date(log.timestamp).getTime() / 1000,
  service: log.source,
  message: log.message,
  severity: log.severity,
});

const incidentId = (burst: Burst): string => `inc-${burst.start}`;

function summarise(burst: Burst, feedback: feedbackRepository.Feedback | undefined): IncidentSummary {
  return {
    id: incidentId(burst),
    start: new Date(burst.start * 1000).toISOString(),
    end: new Date(burst.end * 1000).toISOString(),
    durationSeconds: burst.end - burst.start,
    errorLines: burst.errorLines,
    services: burst.services,
    impact: burst.impact,
    status: feedback ? (feedback.verdict === 'confirm' ? 'confirmed' : 'rejected') : 'unreviewed',
    correctService: feedback?.correctService ?? null,
  };
}

async function bursts(lookbackMinutes: number): Promise<Burst[]> {
  const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();
  const logs = await logRepository.getLogsSince(since, MAX_RCA_LINES);
  return findErrorBursts(logs.map((l) => ({ timestamp: new Date(l.timestamp).getTime() / 1000, service: l.source, severity: l.severity })));
}

/** Bursts in the lookback window, biggest impact first, each marked with its review status. */
export async function listIncidents(lookbackMinutes: number = DEFAULT_INCIDENT_LOOKBACK_MINUTES): Promise<IncidentSummary[]> {
  const found = await bursts(lookbackMinutes);
  const feedback = await feedbackRepository.latestFeedback(found.map(incidentId));
  return found.map((burst) => summarise(burst, feedback.get(incidentId(burst))));
}

function timelineOf(lines: RcaLine[], windowStart: number, burstStart: number): IncidentTimeline {
  const services = [...new Set(lines.map((l) => l.service))].sort();
  const last = lines.reduce((latest, l) => Math.max(latest, l.timestamp), Number.NEGATIVE_INFINITY);
  const buckets = Math.floor((last - windowStart) / TIMELINE_BUCKET_S) + 1;
  const rows = new Map(services.map((s) => [s, { name: s, lines: new Array<number>(buckets).fill(0), errors: new Array<number>(buckets).fill(0) }]));
  for (const line of lines) {
    const row = rows.get(line.service);
    if (!row) continue;
    const bucket = Math.floor((line.timestamp - windowStart) / TIMELINE_BUCKET_S);
    row.lines[bucket] = (row.lines[bucket] as number) + 1;
    if (line.severity === 'error' || line.severity === 'critical') row.errors[bucket] = (row.errors[bucket] as number) + 1;
  }
  return { bucketSeconds: TIMELINE_BUCKET_S, startOffset: windowStart - burstStart, services: [...rows.values()] };
}

/** The incident with its ranking, timeline and learned service graph. */
export async function incidentDetail(id: string, lookbackMinutes: number = MAX_INCIDENT_LOOKBACK_MINUTES): Promise<IncidentDetail> {
  const match = INCIDENT_ID.exec(id);
  if (!match) throw new IncidentNotFoundError(`"${id}" is not an incident id`);
  const start = Number(match[1]);
  const burst = (await bursts(lookbackMinutes)).find((b) => b.start === start);
  if (!burst) throw new IncidentNotFoundError('That incident is no longer in the stored logs.');

  const windowStart = burst.start - BASELINE_BEFORE_S;
  const stored = await logRepository.getLogsBetween(new Date(windowStart * 1000).toISOString(), new Date((burst.end + MARGIN_AFTER_S) * 1000).toISOString(), MAX_RCA_LINES);
  const lines = stored.map(toLine);
  const ranking = rankRootCauses(lines, burst.start, ROOTRANK_V1);
  if (ranking.candidates.length === 0) throw new NoCandidatesError('No services logged in this window.');
  const feedback = (await feedbackRepository.latestFeedback([id])).get(id);
  return {
    incident: summarise(burst, feedback),
    ranking,
    timeline: timelineOf(lines, windowStart, burst.start),
    graph: learnServiceGraph(lines),
    windowLines: lines.length,
  };
}

export interface FeedbackInput {
  verdict: 'confirm' | 'reject';
  /** The real root cause. For "confirm" it defaults to ChronoLog's first candidate. */
  correctService?: string;
  note?: string;
}

/** Record an engineer's answer. The candidates and their features are taken from the server's own ranking, not from the client. */
export async function recordFeedback(id: string, input: FeedbackInput): Promise<feedbackRepository.Feedback> {
  const detail = await incidentDetail(id);
  const candidates = detail.ranking.candidates;
  const predicted = candidates[0]?.service ?? null;
  const correct = input.correctService ?? (input.verdict === 'confirm' ? predicted : null);
  if (!correct) throw new Error('Say which service was the real cause.');
  const at = candidates.findIndex((c) => c.service === correct);
  return feedbackRepository.saveFeedback({
    incidentId: id,
    windowStart: Date.parse(detail.incident.start) / 1000 - BASELINE_BEFORE_S,
    windowEnd: Date.parse(detail.incident.end) / 1000 + MARGIN_AFTER_S,
    modelId: detail.ranking.modelId,
    predictedService: predicted,
    correctService: correct,
    verdict: input.verdict,
    rankOfCorrect: at < 0 ? null : at + 1,
    candidates: candidates.map((c) => ({ service: c.service, score: c.score, weight: c.weight, rank: c.rank, features: c.features })),
    note: input.note ?? null,
  });
}
