/**
 * Rewind: how each service looked at every step of an incident, from per-service line and error counts
 * in fixed buckets (the timeline the incident API returns). Each bucket is compared with the same
 * service's buckets before the incident start, its own normal. Counts carry no message text, so the
 * moods here are limited to fine, stressed, sick and quiet (no new-phrase or restarted).
 *
 * The thresholds reuse the burst and mood constants; the first sign looks back LEAD_BUCKETS before the
 * burst start because a cause can show up just before the errors pile up.
 */
import { HOT_FACTOR, MIN_ERRORS_PER_BUCKET } from './bursts';
import type { Mood } from './mood';
import { QUIET_FRACTION, STRESS_FACTOR } from './mood';

/** How far before the burst start the first sign may be (2 x 30 s buckets). */
export const LEAD_BUCKETS = 2;
/** A service must usually log at least this many lines per bucket before going quiet means anything. */
export const MIN_LINES_FOR_QUIET = 3;

export interface RewindTimeline {
  bucketSeconds: number;
  /** Seconds from the incident start to the first bucket (negative: the window starts before it). */
  startOffset: number;
  services: ReadonlyArray<{ name: string; lines: readonly number[]; errors: readonly number[] }>;
}

export type RewindMood = Extract<Mood, 'fine' | 'stressed' | 'sick' | 'quiet'>;

export interface Rewind {
  /** One entry per bucket: each service's mood then. */
  frames: Array<Record<string, RewindMood>>;
  /** Seconds from the incident start at the beginning of each bucket. */
  seconds: number[];
  /**
   * The first service to look unwell near the start, or null. `alsoUnwell` lists the others that
   * turned unwell in the same bucket: counts cannot order events within one bucket, so they tie.
   */
  firstSign: { service: string; bucket: number; seconds: number; alsoUnwell: string[] } | null;
  /** How many buckets before the start served as each service's normal. */
  baselineBuckets: number;
}

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

function moodOf(lines: number, errors: number, baseLines: number, baseErrors: number): RewindMood {
  if (errors >= Math.max(MIN_ERRORS_PER_BUCKET, HOT_FACTOR * baseErrors)) return 'sick';
  if (errors >= 1 && errors > STRESS_FACTOR * baseErrors) return 'stressed';
  if (baseLines >= MIN_LINES_FOR_QUIET && lines <= QUIET_FRACTION * baseLines) return 'quiet';
  return 'fine';
}

export function rewindMoods(timeline: RewindTimeline): Rewind {
  const buckets = Math.max(0, ...timeline.services.map((s) => s.lines.length));
  const seconds = Array.from({ length: buckets }, (_, i) => timeline.startOffset + i * timeline.bucketSeconds);
  const baselineBuckets = seconds.filter((t) => t < 0).length;
  const frames: Array<Record<string, RewindMood>> = seconds.map(() => ({}));
  for (const service of timeline.services) {
    const baseLines = mean(service.lines.slice(0, baselineBuckets));
    const baseErrors = mean(service.errors.slice(0, baselineBuckets));
    for (let i = 0; i < buckets; i++) {
      (frames[i] as Record<string, RewindMood>)[service.name] = moodOf(service.lines[i] ?? 0, service.errors[i] ?? 0, baseLines, baseErrors);
    }
  }
  return { frames, seconds, firstSign: findFirstSign(timeline, frames, baselineBuckets, seconds), baselineBuckets };
}

/** Earliest bucket from LEAD_BUCKETS before the start with an unwell service; ties go to the most errors. */
function findFirstSign(timeline: RewindTimeline, frames: Array<Record<string, RewindMood>>, baselineBuckets: number, seconds: number[]): Rewind['firstSign'] {
  for (let i = Math.max(0, baselineBuckets - LEAD_BUCKETS); i < frames.length; i++) {
    const unwell = timeline.services
      .filter((s) => (frames[i] as Record<string, RewindMood>)[s.name] !== 'fine')
      .sort((a, b) => (b.errors[i] ?? 0) - (a.errors[i] ?? 0) || a.name.localeCompare(b.name));
    const [first, ...rest] = unwell;
    if (first) return { service: first.name, bucket: i, seconds: seconds[i] as number, alsoUnwell: rest.map((s) => s.name) };
  }
  return null;
}

const ERROR_LEVELS: ReadonlySet<string> = new Set(['error', 'critical']);
const PROBLEM_LEVELS: ReadonlySet<string> = new Set(['error', 'critical', 'warning']);

/**
 * Per-service line and error counts in fixed buckets around a start time, ready for rewindMoods.
 * With `withWarnings`, warning lines count as problems too (some faults, like a slow network, only
 * ever produce warnings); say so wherever the result is shown.
 */
export function timelineOf(
  lines: ReadonlyArray<{ timestamp: number; service: string; severity?: string }>,
  incidentStart: number,
  bucketSeconds: number,
  withWarnings = false,
): RewindTimeline {
  const isProblem = (severity: string | undefined): boolean => severity !== undefined && (withWarnings ? PROBLEM_LEVELS : ERROR_LEVELS).has(severity);
  if (lines.length === 0) return { bucketSeconds, startOffset: 0, services: [] };
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const l of lines) {
    first = Math.min(first, l.timestamp);
    last = Math.max(last, l.timestamp);
  }
  const firstBucket = Math.floor((first - incidentStart) / bucketSeconds);
  const buckets = Math.floor((last - incidentStart) / bucketSeconds) - firstBucket + 1;
  const byService = new Map<string, { lines: number[]; errors: number[] }>();
  for (const l of lines) {
    const row = byService.get(l.service) ?? { lines: new Array<number>(buckets).fill(0), errors: new Array<number>(buckets).fill(0) };
    byService.set(l.service, row);
    const i = Math.floor((l.timestamp - incidentStart) / bucketSeconds) - firstBucket;
    row.lines[i] = (row.lines[i] as number) + 1;
    if (isProblem(l.severity)) row.errors[i] = (row.errors[i] as number) + 1;
  }
  const services = [...byService].sort(([a], [b]) => a.localeCompare(b)).map(([name, row]) => ({ name, ...row }));
  return { bucketSeconds, startOffset: firstBucket * bucketSeconds, services };
}
