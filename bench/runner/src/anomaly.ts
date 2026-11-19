import { AnomalyDetector } from '@chronolog/engine';

export interface AnomalyLine {
  /** Unix seconds. */
  t: number;
  source: string;
  severity: string;
}

/**
 * Stream lines through the ChronoLog-H anomaly detector, in order, and return the
 * 0-based indices of the lines it flagged. The detector's own rules decide; nothing
 * here is tuned. Time comes from each line, so the result does not depend on the wall clock.
 */
export function flagLines(lines: Iterable<AnomalyLine>): number[] {
  const detector = new AnomalyDetector({ clock: () => new Date(0) });
  const flagged: number[] = [];
  let index = 0;
  for (const line of lines) {
    const result = detector.analyze({
      id: String(index),
      severity: line.severity,
      source: line.source,
      timestamp: new Date(line.t * 1000).toISOString(),
    });
    if (result.isAnomaly) flagged.push(index);
    index++;
  }
  return flagged;
}
