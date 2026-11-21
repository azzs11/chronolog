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
  /** The first service to look unwell near the start, or null. */
  firstSign: { service: string; bucket: number; seconds: number } | null;
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
    const first = unwell[0];
    if (first) return { service: first.name, bucket: i, seconds: seconds[i] as number };
  }
  return null;
}
