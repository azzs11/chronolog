import type { TemplateGroup } from '@chronolog/engine';

/** A log as the live view holds it. `time` is Unix milliseconds. */
export interface LiveLog {
  id: string;
  message: string;
  severity: string;
  source: string;
  time: number;
}

export interface LiveStats {
  lines: number;
  perSecond: number;
  errors: number;
  warnings: number;
  templates: number;
  newTemplates: number;
}

export const RATE_WINDOW_S = 10;
export const NEW_TEMPLATE_WINDOW_S = 300;

/**
 * The numbers in the stats strip. `baseline` is the set of templates already present when the page
 * opened: only templates that appeared after that count as new, so everything is not "new" at start.
 */
export function computeStats(logs: LiveLog[], groups: TemplateGroup[], baseline: ReadonlySet<number>, nowMs: number): LiveStats {
  const recent = nowMs - RATE_WINDOW_S * 1000;
  let recentCount = 0;
  let errors = 0;
  let warnings = 0;
  for (const log of logs) {
    if (log.time >= recent) recentCount++;
    if (log.severity === 'critical' || log.severity === 'error') errors++;
    else if (log.severity === 'warning') warnings++;
  }
  const newSince = nowMs / 1000 - NEW_TEMPLATE_WINDOW_S;
  return {
    lines: logs.length,
    perSecond: recentCount / RATE_WINDOW_S,
    errors,
    warnings,
    templates: groups.length,
    newTemplates: groups.filter((g) => !baseline.has(g.id) && g.firstSeen >= newSince).length,
  };
}

/** "5 s ago", "3 min ago", "2 h ago". */
export function formatAgo(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}
