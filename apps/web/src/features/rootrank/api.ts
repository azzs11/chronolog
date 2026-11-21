import axios from 'axios';
import { API_URL } from '../../env';

export interface NovelTemplate {
  template: string;
  firstSeen: number;
  count: number;
  exampleId?: string;
}

export interface CauseEvidence {
  firstErrorAfter: number | null;
  firstNovelAfter: number | null;
  novelTemplates: NovelTemplate[];
  mentions: number;
  errorLines: number;
  /** Cited log ids (absent from older API versions). */
  firstErrorId?: string;
  mentionIds?: string[];
}

export interface RankedCause {
  service: string;
  score: number;
  /** Relative weight among the candidates (softmax of the scores), not a calibrated probability. */
  weight: number;
  rank: number;
  evidence: CauseEvidence;
}

export interface RankData {
  incidentStart: number;
  startSource: 'given' | 'estimated';
  candidates: RankedCause[];
  baselineLines: number;
  incidentLines: number;
  model: { id: string; trainedOn?: string };
  warnings: string[];
}

export interface RankParams {
  lookbackMinutes: number;
  /** Unix seconds; omit to let the server find the start. */
  incidentStart?: number;
}

/** Thrown with the server's own explanation, so the view can show it as is. */
export class RankError extends Error {}

export async function rankRootCauses(params: RankParams): Promise<RankData> {
  try {
    const response = await axios.post<{ data: RankData }>(`${API_URL}/api/rca/rank`, {
      lookback_minutes: params.lookbackMinutes,
      ...(params.incidentStart === undefined ? {} : { incident_start: params.incidentStart }),
    });
    return response.data.data;
  } catch (err) {
    const message = axios.isAxiosError(err)
      ? ((err.response?.data as { message?: string } | undefined)?.message ?? err.message)
      : String(err);
    throw new RankError(message);
  }
}

export interface InjectedIncident {
  truth: { service: string; fault: string };
  seed: number;
  lines: number;
  incidentStart: string;
}

/** Backfill a simulated incident with a known cause (demo helper; needs the admin API key). */
export async function injectIncident(adminKey: string): Promise<InjectedIncident> {
  try {
    const response = await axios.post<{ data: InjectedIncident }>(`${API_URL}/api/rca/incident`, {}, { headers: { 'X-API-Key': adminKey } });
    return response.data.data;
  } catch (err) {
    const message = axios.isAxiosError(err)
      ? ((err.response?.data as { message?: string } | undefined)?.message ?? err.message)
      : String(err);
    throw new RankError(message);
  }
}
