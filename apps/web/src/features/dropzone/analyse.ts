import {
  type LearnedGraph,
  learnServiceGraph,
  parseLog,
  type RankResult,
  type RcaLine,
  rankRootCauses,
  ROOTRANK_V1,
  type RewindTimeline,
  serviceFromPath,
  simulateIncident,
  timelineOf,
  WindowTooShortError,
} from '@chronolog/engine';

/** Bigger files would freeze the page while they are read in the browser; the CLI has no such limit. */
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const BUCKET_S = 30;

export interface LogFile {
  name: string;
  text: string;
}

export interface Analysis {
  ranking: RankResult;
  timeline: RewindTimeline;
  graph: LearnedGraph;
  lines: number;
  skipped: number;
  services: string[];
}

export type AnalysisResult = { ok: true; analysis: Analysis } | { ok: false; message: string };

/**
 * Parse the files (plain text: one file per service; JSON lines may name their own service) and rank
 * the services. Runs entirely in the browser.
 */
export function analyseFiles(files: readonly LogFile[], start?: number): AnalysisResult {
  const bytes = files.reduce((n, f) => n + f.text.length, 0);
  if (bytes > MAX_TOTAL_BYTES) return { ok: false, message: `These files are ${Math.round(bytes / 1e6)} MB; the browser handles up to ${MAX_TOTAL_BYTES / 1024 / 1024} MB. Use the CLI for bigger logs.` };
  const lines: RcaLine[] = [];
  let skipped = 0;
  for (const f of files) {
    const parsed = parseLog(f.text, serviceFromPath(f.name), f.name);
    lines.push(...parsed.lines);
    skipped += parsed.skipped;
  }
  if (lines.length === 0) return { ok: false, message: 'No log lines found. Each line needs a time at the start (ISO 8601 or Unix), or be JSON with a time and a message.' };
  const services = [...new Set(lines.map((l) => l.service))].sort();
  if (services.length < 2) {
    return { ok: false, message: `Only one service found (${services[0]}). Root causes are ranked across services: drop one file per service, or JSON lines with a "service" field.` };
  }
  try {
    const ranking = rankRootCauses(lines, start, ROOTRANK_V1);
    const timeline = timelineOf(lines, ranking.incidentStart, BUCKET_S, true);
    return { ok: true, analysis: { ranking, timeline, graph: learnServiceGraph(lines), lines: lines.length, skipped, services } };
  } catch (err) {
    if (err instanceof WindowTooShortError) return { ok: false, message: 'The logs cover less than 4 minutes, too short to tell normal from the incident. Include a few minutes from before it started.' };
    throw err;
  }
}

/** A simulated shop incident as one plain-text file per service, so the drop zone can be tried at once. */
export function sampleFiles(seed = 11): LogFile[] {
  const incident = simulateIncident({ seed, service: 'catalog', fault: 'disk' });
  const byService = new Map<string, string[]>();
  for (const l of incident.lines) {
    const rows = byService.get(l.service) ?? [];
    byService.set(l.service, rows);
    rows.push(`${new Date(l.timestamp * 1000).toISOString()} ${(l.severity ?? 'info').toUpperCase()} ${l.message}`);
  }
  return [...byService].map(([service, rows]) => ({ name: `${service}.log`, text: rows.join('\n') }));
}
