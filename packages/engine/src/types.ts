/** Minimal logger the engine writes to. The edges (API, browser) decide where it goes. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
}

export const noopLogger: Logger = { debug: () => undefined };

/** A log line as the engine sees it. Extra fields pass through untouched. */
export interface LogInput {
  id: string;
  message: string;
  severity: string;
  source: string;
  timestamp: string;
  [extra: string]: unknown;
}

/** What the anomaly detector reads from a log. Only rhythm matters, so no message. */
export interface AnomalyInput {
  id?: string;
  severity: string;
  source: string;
  timestamp: string;
  [extra: string]: unknown;
}

export interface CausalMeta {
  causal_parent_id: string | null;
  causal_root_id: string | null;
  causal_chain_depth: number;
  blast_radius_score: number;
}

/** A log after causal analysis, as stored in the ring buffer. */
export type CausalLog = LogInput & CausalMeta;

export interface ChainPreviewItem {
  id: string;
  severity: string;
  message: string;
  source: string;
}

export interface ChainDetectedEvent {
  type: 'causal-chain-detected';
  root_id: string;
  triggering_log_id: string;
  chain_depth: number;
  total_affected: number;
  blast_radius_score: number;
  chain_preview: ChainPreviewItem[];
}

export interface ActiveChain {
  root_log_id: string;
  root_message: string;
  root_severity: string;
  root_source: string;
  root_timestamp: string;
  chain_depth: number;
  total_affected_logs: number;
  blast_radius_score: number;
  affected_preview: { id: string; message: string; severity: string; source: string; depth: number }[];
}

export interface GraphNode {
  id: string;
  label: string;
  severity: string;
  source: string;
  depth: number;
  isRoot: boolean;
  blastRadius: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: { from: string; to: string }[];
}

export interface AnomalyResult {
  isAnomaly: boolean;
  anomalyScore: number;
  fingerprintHash: string;
}

export interface Fingerprint {
  hash: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
  severity: string;
  source: string;
  avgScore: number;
  lastSeverity?: string;
}
