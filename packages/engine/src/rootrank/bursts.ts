/**
 * Find bursts of error-level lines: the app's candidates for "incidents".
 *
 * Error and critical lines are counted per 30 s bucket. A bucket is hot when it holds well above the
 * window's typical count, taken as the lower quartile so that a burst covering half the window does
 * not inflate its own baseline (a median would); runs of hot buckets, bridged across short gaps, are bursts. A
 * burst is a detected pattern, not a verified incident: logs alone cannot tell a calm window from an
 * incident, so the app presents bursts as things worth looking at.
 *
 * The constants are plain starting values chosen for readability, not tuned on any benchmark.
 */
import { extent } from './extent';

export const BURST_BUCKET_S = 30;
/** A bucket needs at least this many error lines to be hot, however quiet the window is. */
export const MIN_ERRORS_PER_BUCKET = 3;
/** ...and this many times the window's typical (lower-quartile) bucket count. */
export const HOT_FACTOR = 3;
/** Which quantile of the bucket counts counts as "typical". */
export const TYPICAL_QUANTILE = 0.25;
/** Hot buckets separated by up to this many quiet ones belong to the same burst (2 minutes). */
export const MERGE_GAP_BUCKETS = 4;
/** A burst with fewer error lines than this is not worth an inbox row. */
export const MIN_BURST_ERRORS = 8;

export interface BurstLine {
  /** Unix seconds. */
  timestamp: number;
  service: string;
  severity: string;
}

export interface Burst {
  /** Unix seconds of the first hot bucket. */
  start: number;
  /** Unix seconds at the end of the last hot bucket. */
  end: number;
  errorLines: number;
  /** Error lines per service, most first. */
  services: Array<{ service: string; errors: number }>;
  /** The most error lines in one bucket. */
  peak: number;
  /** errorLines x number of services involved: bigger bursts that touch more services rank higher. */
  impact: number;
}

const isError = (severity: string): boolean => severity === 'error' || severity === 'critical';

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

/** Bursts in the lines given, biggest impact first. */
export function findErrorBursts(lines: readonly BurstLine[]): Burst[] {
  if (lines.length === 0) return [];
  const span = extent(lines.map((l) => l.timestamp));
  const first = Math.floor(span.min / BURST_BUCKET_S);
  const buckets = Math.floor(span.max / BURST_BUCKET_S) - first + 1;
  const counts = new Array<number>(buckets).fill(0);
  const byService: Array<Map<string, number>> = Array.from({ length: buckets }, () => new Map());
  for (const line of lines) {
    if (!isError(line.severity)) continue;
    const bucket = Math.floor(line.timestamp / BURST_BUCKET_S) - first;
    counts[bucket] = (counts[bucket] as number) + 1;
    const services = byService[bucket] as Map<string, number>;
    services.set(line.service, (services.get(line.service) ?? 0) + 1);
  }

  const threshold = Math.max(MIN_ERRORS_PER_BUCKET, HOT_FACTOR * quantile(counts, TYPICAL_QUANTILE));
  const runs: Array<[number, number]> = [];
  counts.forEach((count, i) => {
    if (count < threshold) return;
    const last = runs[runs.length - 1];
    if (last && i - last[1] - 1 <= MERGE_GAP_BUCKETS) last[1] = i;
    else runs.push([i, i]);
  });

  const bursts: Burst[] = [];
  for (const [from, to] of runs) {
    const totals = new Map<string, number>();
    let errorLines = 0;
    let peak = 0;
    for (let i = from; i <= to; i++) {
      errorLines += counts[i] as number;
      peak = Math.max(peak, counts[i] as number);
      for (const [service, n] of byService[i] as Map<string, number>) totals.set(service, (totals.get(service) ?? 0) + n);
    }
    if (errorLines < MIN_BURST_ERRORS) continue;
    const services = [...totals.entries()].map(([service, errors]) => ({ service, errors })).sort((a, b) => b.errors - a.errors || (a.service < b.service ? -1 : 1));
    bursts.push({
      start: (first + from) * BURST_BUCKET_S,
      end: (first + to + 1) * BURST_BUCKET_S,
      errorLines,
      services,
      peak,
      impact: errorLines * services.length,
    });
  }
  return bursts.sort((a, b) => b.impact - a.impact || b.start - a.start);
}
