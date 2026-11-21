import type { ServiceMood } from '@chronolog/engine';

/**
 * Every service silent at once (no lines at all in the recent window) is almost never every service
 * failing together: far more often the logs simply stopped arriving (the shipper, the network, or
 * nothing is sending). Views say so instead of naming one silent service "the most worrying".
 */
export function isEverythingSilent(moods: readonly ServiceMood[]): boolean {
  return moods.length > 1 && moods.every((m) => m.mood === 'quiet' && m.recentLines === 0);
}

export const SILENCE_LINE = 'Every service went silent at once. That usually means logs stopped arriving (the log shipper, the network, or nothing is sending), not that everything broke. Check the pipeline first.';
