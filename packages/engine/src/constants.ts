/**
 * Every weight, threshold and window used by the ChronoLog-H rules.
 *
 * Provenance: all values were hand-picked in ChronoLog v1 and have NOT been
 * tuned or validated on real data. Phase 2 (ChronoBench) measures them.
 */

export const SEVERITY_WEIGHTS: Readonly<Record<string, number>> = {
  critical: 5,
  error: 4,
  warning: 3,
  info: 2,
  debug: 1,
};

// ── Causal engine ────────────────────────────────────────────────────────────
export const CAUSAL_WINDOW_MS = 30_000;
export const CAUSAL_MAX_CHAIN_DEPTH = 10;
export const BLAST_RADIUS_DECAY = 0.8;
/** Ring buffer size: the engine only ever looks back over the last N logs. */
export const RING_SIZE = 200;
/** Minimum causal score for a log to be linked to a parent. */
export const CAUSALITY_THRESHOLD = 0.3;
/** Chain depth at which a chain-detected event is emitted. */
export const CHAIN_ALERT_DEPTH = 3;

export const WEIGHT_TIME = 0.4;
export const WEIGHT_SEVERITY = 0.3;
export const WEIGHT_ENTITY = 0.3;
export const SEVERITY_SAME_LEVEL_SCORE = 0.15;
export const BONUS_SAME_SOURCE = 0.2;
export const BONUS_WARNING_TO_ERROR = 0.2;
/** Minimum service-relation score for the warning-to-error bonus. */
export const RELATED_SOURCE_MIN_SCORE = 0.5;

// ── Anomaly detector ─────────────────────────────────────────────────────────
export const ANOMALY_WINDOW_SIZE = 100;
export const ANOMALY_THRESHOLD = 0.55;
export const BIGRAM_RARE_THRESHOLD = 0.02;
export const BURST_FRACTION = 0.3;
export const SEVERITY_FREQ_SPIKE_FACTOR = 2.0;
/** Baseline is recomputed every N logs, once the window holds MIN_BASELINE_LOGS. */
export const BASELINE_UPDATE_EVERY = 10;
export const MIN_BASELINE_LOGS = 20;
/** Fallback mean gap between logs (ms) when the window has no valid intervals. */
export const DEFAULT_INTERARRIVAL_MS = 2000;
export const RECENT_RATE_WINDOW = 20;
export const BURST_WINDOW = 5;
export const SCORE_FREQ = 0.4;
export const SCORE_BIGRAM = 0.3;
export const SCORE_BURST = 0.3;
