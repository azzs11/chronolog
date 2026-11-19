/**
 * Estimate when an incident started, from the logs alone. A port of bench/startdetect.py.
 *
 * Scans every candidate start time and keeps the one where log behaviour changes most: the sum,
 * over every (service, template) series, of a Poisson likelihood-ratio statistic comparing the
 * counts before and after the split, in either direction. It locates a change; it cannot tell a
 * calm window from an incident window, so callers should only use it when something went wrong.
 */
import type { PreparedLine } from './features';

export const START_BUCKET_S = 10; // width of a time bucket
/** Each side of the split must span at least this many buckets (120 s). */
export const MIN_SEGMENT_BUCKETS = 12;

/** x * ln(x / t), with 0 ln 0 = 0. */
const xlogx = (x: number, t: number): number => (x > 0 ? x * Math.log(x / t) : 0);

/** Per-bucket counts for every (service, template) series, as running totals. */
function cumulativeSeries(lines: readonly PreparedLine[], t0: number, buckets: number): Float64Array[] {
  const series = new Map<string, Float64Array>();
  for (const line of lines) {
    const key = `${line.service}|${line.templateId}`;
    let counts = series.get(key);
    if (counts === undefined) {
      counts = new Float64Array(buckets);
      series.set(key, counts);
    }
    const bucket = Math.floor((line.timestamp - t0) / START_BUCKET_S);
    counts[bucket] = (counts[bucket] as number) + 1;
  }
  return [...series.values()].map((counts) => {
    for (let i = 1; i < counts.length; i++) counts[i] = (counts[i] as number) + (counts[i - 1] as number);
    return counts;
  });
}

/** Estimated start in Unix seconds, or null if the lines span less than 2 x 120 s. */
export function estimateIncidentStart(lines: readonly PreparedLine[]): number | null {
  if (lines.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    if (line.timestamp < min) min = line.timestamp;
    if (line.timestamp > max) max = line.timestamp;
  }
  const t0 = Math.floor(min);
  const buckets = Math.floor((Math.floor(max) - t0) / START_BUCKET_S) + 1;
  if (buckets < 2 * MIN_SEGMENT_BUCKETS) return null;

  const cumulative = cumulativeSeries(lines, t0, buckets);
  let bestSplit = MIN_SEGMENT_BUCKETS;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let split = MIN_SEGMENT_BUCKETS; split <= buckets - MIN_SEGMENT_BUCKETS; split++) {
    let score = 0;
    for (const cum of cumulative) {
      const total = cum[buckets - 1] as number;
      const before = cum[split - 1] as number;
      score += xlogx(before, split) + xlogx(total - before, buckets - split) - xlogx(total, buckets);
    }
    if (score > bestScore) {
      bestScore = score;
      bestSplit = split;
    }
  }
  return t0 + bestSplit * START_BUCKET_S;
}
