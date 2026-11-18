import type { CausalMeta } from '@chronolog/engine';

export interface MlInfo {
  predicted_severity: string;
  confidence: number;
  probabilities: Record<string, number>;
  severity_match: boolean;
}

/** A log after normalisation and enrichment, as handed to the repository. */
export type ProcessedLog = {
  id: string;
  message: string;
  severity: string;
  source: string;
  timestamp: string;
  ml: MlInfo | null;
  causal: CausalMeta | null;
  is_anomaly: boolean;
  anomaly_score: number;
  fingerprint_hash: string | null;
};

/** A log as stored: in-memory entries may also carry flattened causal fields. */
export type StoredLog = ProcessedLog & Partial<CausalMeta>;

/** Raw input to the log processor. Everything is optional; it gets normalised. */
export interface RawLogInput {
  id?: string;
  message?: string;
  severity?: string;
  source?: string;
  timestamp?: string;
}

export interface SeverityCounts {
  critical: number;
  error: number;
  warning: number;
  info: number;
  debug: number;
}

export interface LogStats {
  total: number;
  bySeverity: SeverityCounts;
  anomalyCount: number;
  causalChainCount: number;
}

export interface MlResult {
  predicted_severity: string;
  confidence: number;
  probabilities: Record<string, number>;
}
