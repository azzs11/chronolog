/**
 * Learn which services talk to each other from their logs. A port of bench/servicegraph.py.
 *
 * mention      service A's lines name service B: directed A -> B (A calls or depends on B).
 * correlation  A's and B's log volumes rise and fall together (Pearson, per 2 s bucket): undirected.
 * Uses the whole window of lines given; no incident start and no hand-made prior.
 */
import { extent } from './extent';
import { mentionTable } from './features';
import { assignTemplates } from './templates';
import type { RcaLine } from './types';

export const CORRELATION_BUCKET_S = 2;
/** An edge needs this many naming lines, so one stray mention is not an edge. */
export const MIN_MENTIONS = 3;
/** The usual "strong correlation" cut-off. */
export const MIN_CORRELATION = 0.5;

export interface MentionEdge {
  from: string;
  to: string;
  count: number;
}
export interface CorrelationEdge {
  a: string;
  b: string;
  corr: number;
}
export interface LearnedGraph {
  services: string[];
  mentions: MentionEdge[];
  correlations: CorrelationEdge[];
}

function pearson(x: Float64Array, y: Float64Array): number {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i] as number;
    my += y[i] as number;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denominator = Math.sqrt(sxx * syy);
  return denominator > 0 ? Math.max(-1, Math.min(1, sxy / denominator)) : 0; // no variance: 0
}

function correlations(lines: readonly RcaLine[], services: string[]): CorrelationEdge[] {
  if (services.length < 2) return [];
  const span = extent(lines.map((l) => l.timestamp));
  const t0 = Math.floor(span.min);
  const buckets = Math.floor((Math.floor(span.max) - t0) / CORRELATION_BUCKET_S) + 1;
  const index = new Map(services.map((s, i) => [s, i]));
  const volume = services.map(() => new Float64Array(buckets));
  for (const line of lines) {
    const row = volume[index.get(line.service) as number] as Float64Array;
    const bucket = Math.floor((line.timestamp - t0) / CORRELATION_BUCKET_S);
    row[bucket] = (row[bucket] as number) + 1;
  }
  const edges: CorrelationEdge[] = [];
  for (let i = 0; i < services.length; i++) {
    for (let j = i + 1; j < services.length; j++) {
      const corr = pearson(volume[i] as Float64Array, volume[j] as Float64Array);
      if (corr >= MIN_CORRELATION) edges.push({ a: services[i] as string, b: services[j] as string, corr });
    }
  }
  return edges;
}

export function learnServiceGraph(lines: readonly RcaLine[]): LearnedGraph {
  const services = [...new Set(lines.map((l) => l.service))].sort();
  if (lines.length === 0) return { services, mentions: [], correlations: [] };
  const table = assignTemplates(lines.map((l) => l.message));
  const targets = mentionTable(services, table.texts);
  const counts = new Map<string, MentionEdge>();
  lines.forEach((line, i) => {
    for (const to of targets.get(table.ids[i] as number) ?? []) {
      const target = services[to] as string;
      if (target === line.service) continue;
      const key = `${line.service}\u0000${target}`;
      const edge = counts.get(key) ?? { from: line.service, to: target, count: 0 };
      edge.count++;
      counts.set(key, edge);
    }
  });
  const mentions = [...counts.values()]
    .filter((e) => e.count >= MIN_MENTIONS)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return { services, mentions, correlations: correlations(lines, services) };
}
