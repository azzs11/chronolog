/**
 * Anomaly v2, the part that ships in the app: rare-template surprise.
 *
 * A line is "unusual" if its Drain template made up less than RARE_SHARE of the lines in an earlier
 * baseline period, or never appeared there. This is the same rule as the benchmark's
 * `bench/src/chronobench/anomaly_v2.py` `rare_lines` (a parity test checks it on real BGL lines).
 * Measured on Loghub (RESULTS-anomaly-v2.md): it beats the old rules on HDFS and BGL but NOT a plain
 * "flag error lines" rule on BGL, so the UI lists unusual messages as clues, never as alerts.
 * The benchmark's Isolation Forest is not shipped: it did not beat the trivial bars either.
 */
import { assignTemplates } from '../rootrank/templates';

/** Fixed before the benchmark's first run (a round number), not tuned on Loghub. */
export const RARE_SHARE = 1e-4;
/** The app compares the last 5 minutes with the hour before them. */
export const UNUSUAL_RECENT_S = 300;
export const UNUSUAL_BASELINE_S = 3600;
export const MAX_UNUSUAL = 10;
export const MAX_UNUSUAL_IDS = 5;

export interface UnusualInputLine {
  id?: string;
  timestamp: number; // unix seconds
  service: string;
  message: string;
}

export interface UnusualTemplate {
  template: string;
  /** Recent lines with this template. */
  count: number;
  /** Lines with this template in the baseline (0 = never seen before). */
  baselineCount: number;
  services: string[];
  firstSeen: number;
  lastSeen: number;
  /** Up to MAX_UNUSUAL_IDS ids of recent lines, oldest first. */
  lineIds: string[];
}

export interface UnusualResult {
  baselineLines: number;
  recentLines: number;
  /** Below 1 / RARE_SHARE baseline lines, any seen template is common: only new ones can show. */
  isOnlyNewTemplates: boolean;
  templates: UnusualTemplate[];
}

/** Boolean per line: its template's share of baseline lines (timestamp < cutoff) is below share. */
export function rareTemplateLines(
  templateIds: readonly number[],
  timestamps: readonly number[],
  cutoff: number,
  share: number = RARE_SHARE,
): boolean[] {
  const counts = new Map<number, number>();
  let total = 0;
  templateIds.forEach((id, i) => {
    if ((timestamps[i] as number) < cutoff) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      total += 1;
    }
  });
  return templateIds.map((id) => total === 0 || (counts.get(id) ?? 0) / total < share);
}

/** Unusual messages in [now - UNUSUAL_RECENT_S, now], against the baseline hour before. */
export function unusualTemplates(lines: readonly UnusualInputLine[], now: number): UnusualResult {
  const cutoff = now - UNUSUAL_RECENT_S;
  const kept = lines
    .filter((l) => l.timestamp >= cutoff - UNUSUAL_BASELINE_S && l.timestamp <= now)
    .sort((a, b) => a.timestamp - b.timestamp);
  const table = assignTemplates(kept.map((l) => l.message));
  const stamps = kept.map((l) => l.timestamp);
  const rare = rareTemplateLines(table.ids, stamps, cutoff);
  const baseline = new Map<number, number>();
  const groups = new Map<number, UnusualTemplate>();
  kept.forEach((line, i) => {
    const id = table.ids[i] as number;
    if (line.timestamp < cutoff) {
      baseline.set(id, (baseline.get(id) ?? 0) + 1);
      return;
    }
    if (!rare[i]) return;
    const group = groups.get(id) ?? newGroup(table.texts.get(id) ?? '', line.timestamp);
    group.count += 1;
    group.lastSeen = line.timestamp;
    if (!group.services.includes(line.service)) group.services.push(line.service);
    if (line.id !== undefined && group.lineIds.length < MAX_UNUSUAL_IDS) group.lineIds.push(line.id);
    groups.set(id, group);
  });
  const baselineLines = stamps.filter((t) => t < cutoff).length;
  const templates = [...groups.entries()]
    .map(([id, g]) => ({ ...g, baselineCount: baseline.get(id) ?? 0, services: g.services.sort() }))
    .sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen)
    .slice(0, MAX_UNUSUAL);
  return {
    baselineLines,
    recentLines: kept.length - baselineLines,
    isOnlyNewTemplates: baselineLines < 1 / RARE_SHARE,
    templates,
  };
}

function newGroup(template: string, at: number): UnusualTemplate {
  return { template, count: 0, baselineCount: 0, services: [], firstSeen: at, lastSeen: at, lineIds: [] };
}
