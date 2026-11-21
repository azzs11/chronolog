import axios from 'axios';
import { API_URL } from '../../env';
import type { RankedCause } from '../rootrank/api';

/** Log volume per service over time, in fixed-width buckets. */
export interface TimelineData {
  bucketSeconds: number;
  /** Seconds from the incident start to the first bucket (negative: the window starts before it). */
  startOffset: number;
  services: Array<{ name: string; lines: number[]; errors: number[] }>;
}

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
  correctService: string | null;
}

export interface IncidentDetail {
  incident: IncidentSummary;
  ranking: {
    incidentStart: number;
    startSource: 'given' | 'estimated';
    candidates: RankedCause[];
    baselineLines: number;
    incidentLines: number;
    modelId: string;
  };
  timeline: TimelineData;
  graph: {
    services: string[];
    mentions: Array<{ from: string; to: string; count: number }>;
    correlations: Array<{ a: string; b: string; corr: number }>;
  };
  windowLines: number;
}

export interface FeedbackSummary {
  reviewed: number;
  confirmed: number;
  rejected: number;
  top1: number;
  top3: number;
}

export interface FeedbackInput {
  verdict: 'confirm' | 'reject';
  correct_service?: string;
  note?: string;
}

/** An error with the server's own explanation, so views can show it as is. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function call<T>(request: Promise<{ data: { data: T } }>): Promise<T> {
  try {
    return (await request).data.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const body = err.response?.data as { message?: string } | undefined;
      throw new ApiError(body?.message ?? err.message, err.response?.status);
    }
    throw new ApiError(String(err));
  }
}

export const fetchIncidents = (lookbackMinutes?: number): Promise<IncidentSummary[]> =>
  call(axios.get(`${API_URL}/api/incidents`, lookbackMinutes ? { params: { lookback_minutes: lookbackMinutes } } : undefined));
export const fetchIncident = (id: string): Promise<IncidentDetail> => call(axios.get(`${API_URL}/api/incidents/${encodeURIComponent(id)}`));
export const fetchFeedbackSummary = (): Promise<FeedbackSummary> => call(axios.get(`${API_URL}/api/incidents/feedback/summary`));
export const sendFeedback = (id: string, input: FeedbackInput): Promise<{ verdict: string; correctService: string; rankOfCorrect: number | null }> =>
  call(axios.post(`${API_URL}/api/incidents/${encodeURIComponent(id)}/feedback`, input));
