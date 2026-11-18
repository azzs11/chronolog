import {
  BLAST_RADIUS_DECAY,
  BONUS_SAME_SOURCE,
  BONUS_WARNING_TO_ERROR,
  CAUSAL_WINDOW_MS,
  RELATED_SOURCE_MIN_SCORE,
  SEVERITY_SAME_LEVEL_SCORE,
  SEVERITY_WEIGHTS,
  WEIGHT_ENTITY,
  WEIGHT_SEVERITY,
  WEIGHT_TIME,
} from './constants';
import { computeEntityOverlap, extractEntities } from './entities';
import { sourceRelationScore } from './serviceGraph';
import type { CausalLog, LogInput } from './types';

/**
 * Non-linear temporal proximity: <=5s 1.0, <=10s 0.8, <=20s 0.5, <=30s 0.2,
 * interpolated linearly inside each band.
 */
export function temporalProximityScore(ageSec: number): number {
  if (ageSec <= 0) return 0;
  if (ageSec <= 5) return 1.0;
  if (ageSec <= 10) return 0.8 + ((1.0 - 0.8) * (10 - ageSec)) / 5;
  if (ageSec <= 20) return 0.5 + ((0.8 - 0.5) * (20 - ageSec)) / 10;
  if (ageSec <= 30) return 0.2 + ((0.5 - 0.2) * (30 - ageSec)) / 10;
  return 0;
}

/** Score (0-1) for "parent caused child". 0 when the parent is not earlier or too old. */
export function computeCausalScore(parent: LogInput, child: LogInput): number {
  const parentTime = new Date(parent.timestamp).getTime();
  const childTime = new Date(child.timestamp).getTime();
  if (parentTime >= childTime) return 0;

  const ageSec = (childTime - parentTime) / 1000;
  if (ageSec > CAUSAL_WINDOW_MS / 1000) return 0;

  let score = temporalProximityScore(ageSec) * WEIGHT_TIME;

  const parentWeight = SEVERITY_WEIGHTS[parent.severity] ?? 0;
  const childWeight = SEVERITY_WEIGHTS[child.severity] ?? 0;
  if (childWeight > parentWeight) score += WEIGHT_SEVERITY;
  else if (childWeight === parentWeight) score += SEVERITY_SAME_LEVEL_SCORE;

  score +=
    computeEntityOverlap(extractEntities(parent.message), extractEntities(child.message)) * WEIGHT_ENTITY;

  if (parent.source === child.source) score += BONUS_SAME_SOURCE;

  const errorWeight = SEVERITY_WEIGHTS.error as number;
  const warningWeight = SEVERITY_WEIGHTS.warning as number;
  if (childWeight >= errorWeight && parentWeight === warningWeight) {
    if (sourceRelationScore(parent.source, child.source) >= RELATED_SOURCE_MIN_SCORE) {
      score += BONUS_WARNING_TO_ERROR;
    }
  }
  return Math.min(score, 1.0);
}

/** BR(node) = severity weight + decay * BR(parent). Roots carry their weight only. */
export function computeBlastRadius(log: LogInput, parent: CausalLog | null): number {
  const weight = SEVERITY_WEIGHTS[log.severity] ?? 1;
  if (!parent) return weight;
  return parseFloat((weight + BLAST_RADIUS_DECAY * (parent.blast_radius_score ?? 0)).toFixed(3));
}
