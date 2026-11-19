import { extent } from './extent';
import { type PreparedLine, computeFeatures, FEATURE_NAMES } from './features';
import { predict, type TreeModel } from './model';
import { inferSeverity } from './severity';
import { estimateIncidentStart } from './startDetect';
import { assignTemplates } from './templates';
import type { CauseEvidence, RankedCause, RankResult, RcaLine } from './types';

const MAX_NOVEL_SHOWN = 3;

/** The lines span too little time to estimate an incident start (at least 4 minutes are needed). */
export class WindowTooShortError extends Error {
  constructor() {
    super('The logs span less than 4 minutes, which is too short to estimate when the incident started.');
  }
}

/** Softmax of the scores: relative weights that sum to 1 (not calibrated probabilities). */
function softmax(scores: number[]): number[] {
  const top = extent(scores).max;
  const exps = scores.map((s) => Math.exp(s - top));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

/** Reorder a feature row to the model's own feature order, failing loudly if a name is unknown. */
function columnOrder(model: TreeModel): number[] {
  return model.feature_names.map((name) => {
    const at = FEATURE_NAMES.indexOf(name);
    if (at < 0) throw new Error(`Model uses unknown feature "${name}"`);
    return at;
  });
}

/**
 * Rank the services in `lines` by how likely each is to be the root cause of an incident that
 * started at `incidentStart` (Unix seconds). Lines before it are the baseline. If `incidentStart`
 * is undefined it is estimated from the logs (see startDetect.ts), which throws WindowTooShortError
 * for windows under 4 minutes. Pure: same input, same output.
 */
export function rankRootCauses(
  lines: readonly RcaLine[],
  incidentStart: number | undefined,
  model: TreeModel,
): RankResult {
  const ordered = lines
    .map((line, position) => ({ line, position }))
    .sort((a, b) => a.line.timestamp - b.line.timestamp || a.position - b.position)
    .map((entry) => entry.line);
  const table = assignTemplates(ordered.map((l) => l.message));
  const prepared: PreparedLine[] = ordered.map((l, i) => ({
    timestamp: l.timestamp,
    service: l.service,
    severity: l.severity ?? inferSeverity(l.message),
    templateId: table.ids[i] as number,
  }));
  const start = incidentStart ?? estimateIncidentStart(prepared);
  if (start === null) throw new WindowTooShortError();
  const result = computeFeatures(prepared, table.texts, start);
  const order = columnOrder(model);
  const scores = result.rows.map((row) => predict(model, order.map((at) => row[at] as number)));
  const weights = scores.length > 0 ? softmax(scores) : [];

  const causes: RankedCause[] = result.services.map((service, i) => {
    const details = result.details[i] as (typeof result.details)[number];
    const evidence: CauseEvidence = {
      firstErrorAfter: details.firstError === null ? null : details.firstError - start,
      firstNovelAfter: details.novel[0] ? details.novel[0].firstSeen - start : null,
      novelTemplates: details.novel.slice(0, MAX_NOVEL_SHOWN).map((t) => ({
        template: table.texts.get(t.templateId) ?? '',
        firstSeen: t.firstSeen,
        count: t.count,
        exampleId: ordered[t.firstIndex]?.id,
      })),
      mentions: details.mentions,
      errorLines: details.errorLines,
    };
    const features = Object.fromEntries(FEATURE_NAMES.map((name, j) => [name, (result.rows[i] as number[])[j] as number]));
    return { service, score: scores[i] as number, weight: weights[i] as number, rank: 0, features, evidence };
  });
  causes.sort((a, b) => b.score - a.score || (a.service < b.service ? -1 : 1));
  causes.forEach((cause, i) => {
    cause.rank = i + 1;
  });
  return {
    incidentStart: start,
    startSource: incidentStart === undefined ? 'estimated' : 'given',
    candidates: causes,
    baselineLines: ordered.filter((l) => l.timestamp < start).length,
    incidentLines: ordered.filter((l) => l.timestamp >= start).length,
    modelId: model.id,
  };
}
