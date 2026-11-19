/**
 * Engineers' answers to "was this the root cause?". Each answer keeps the candidates and their
 * feature vectors as they were when it was given, so RootRank can be retrained on real labels later
 * without needing the original logs (which may have been pruned by then).
 */
import { isPgAvailable, requirePool } from './client';

export interface FeedbackCandidate {
  service: string;
  score: number;
  weight: number;
  rank: number;
  features: Record<string, number>;
}

export interface Feedback {
  incidentId: string;
  /** Unix seconds. */
  windowStart: number;
  windowEnd: number;
  modelId: string;
  predictedService: string | null;
  correctService: string;
  verdict: 'confirm' | 'reject';
  /** Where the model had put the correct service (1 = first), or null if it was not a candidate. */
  rankOfCorrect: number | null;
  candidates: FeedbackCandidate[];
  note: string | null;
  createdAt: string;
}

export interface FeedbackSummary {
  reviewed: number;
  confirmed: number;
  rejected: number;
  top1: number;
  top3: number;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS rca_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    model_id TEXT NOT NULL,
    predicted_service TEXT,
    correct_service TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('confirm','reject')),
    rank_of_correct INTEGER,
    candidates JSONB NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

let memory: Feedback[] = [];
let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured || !isPgAvailable()) return;
  await requirePool().query(CREATE_TABLE);
  ensured = true;
}

interface Row {
  incident_id: string;
  window_start: Date;
  window_end: Date;
  model_id: string;
  predicted_service: string | null;
  correct_service: string;
  verdict: 'confirm' | 'reject';
  rank_of_correct: number | null;
  candidates: FeedbackCandidate[];
  note: string | null;
  created_at: Date;
}

const fromRow = (r: Row): Feedback => ({
  incidentId: r.incident_id,
  windowStart: r.window_start.getTime() / 1000,
  windowEnd: r.window_end.getTime() / 1000,
  modelId: r.model_id,
  predictedService: r.predicted_service,
  correctService: r.correct_service,
  verdict: r.verdict,
  rankOfCorrect: r.rank_of_correct,
  candidates: r.candidates,
  note: r.note,
  createdAt: r.created_at.toISOString(),
});

export async function saveFeedback(feedback: Omit<Feedback, 'createdAt'>): Promise<Feedback> {
  if (!isPgAvailable()) {
    const saved = { ...feedback, createdAt: new Date().toISOString() };
    memory.push(saved);
    return saved;
  }
  await ensureTable();
  const { rows } = await requirePool().query<Row>(
    `INSERT INTO rca_feedback (incident_id, window_start, window_end, model_id, predicted_service, correct_service, verdict, rank_of_correct, candidates, note)
     VALUES ($1, to_timestamp($2), to_timestamp($3), $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      feedback.incidentId,
      feedback.windowStart,
      feedback.windowEnd,
      feedback.modelId,
      feedback.predictedService,
      feedback.correctService,
      feedback.verdict,
      feedback.rankOfCorrect,
      JSON.stringify(feedback.candidates),
      feedback.note,
    ],
  );
  return fromRow(rows[0] as Row);
}

/** The latest answer for each incident id asked about (an engineer may change their mind). */
export async function latestFeedback(incidentIds?: string[]): Promise<Map<string, Feedback>> {
  const out = new Map<string, Feedback>();
  if (!isPgAvailable()) {
    for (const f of memory) if (!incidentIds || incidentIds.includes(f.incidentId)) out.set(f.incidentId, f);
    return out;
  }
  await ensureTable();
  const { rows } = await requirePool().query<Row>(
    `SELECT DISTINCT ON (incident_id) * FROM rca_feedback
     WHERE ($1::text[] IS NULL OR incident_id = ANY($1)) ORDER BY incident_id, created_at DESC`,
    [incidentIds ?? null],
  );
  for (const row of rows) out.set(row.incident_id, fromRow(row));
  return out;
}

/** How RootRank has done on the incidents engineers reviewed, from the latest answer of each. */
export async function feedbackSummary(): Promise<FeedbackSummary> {
  const latest = [...(await latestFeedback()).values()];
  return {
    reviewed: latest.length,
    confirmed: latest.filter((f) => f.verdict === 'confirm').length,
    rejected: latest.filter((f) => f.verdict === 'reject').length,
    top1: latest.filter((f) => f.rankOfCorrect === 1).length,
    top3: latest.filter((f) => f.rankOfCorrect !== null && f.rankOfCorrect <= 3).length,
  };
}

/** Test helper: forget everything held in memory. */
export function resetFeedbackMemory(): void {
  memory = [];
}
