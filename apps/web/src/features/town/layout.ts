/**
 * Where each service sits in the town. When the logs show who calls whom ("A names B" roads), the
 * town is laid out in columns, left to right: callers first, then what they call, so trouble reads as
 * flowing across the map. Without such roads there is no direction to show, and services sit on a
 * ring in name order. Pure and deterministic: the same services and roads always give the same town.
 */
import type { Place, Road } from './roads';

export interface TownLayout {
  places: Place[];
  width: number;
  height: number;
  kind: 'columns' | 'ring';
}

const MIN = { width: 560, height: 380 } as const;
const RING_MARGIN = 72;
const COL_GAP = 170;
const ROW_GAP = 110;
/** Column layouts are kept at least this much wider than tall, so the map fills its frame. */
const MIN_ASPECT = 1.3;
const EDGE = { x: 84, y: 50 } as const;

function ring(services: readonly string[]): TownLayout {
  const names = [...services].sort();
  const { width, height } = MIN;
  const rx = width / 2 - RING_MARGIN;
  const ry = height / 2 - RING_MARGIN;
  if (names.length <= 1) return { places: names.map((name) => ({ name, x: width / 2, y: height / 2 })), width, height, kind: 'ring' };
  const places = names.map((name, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / names.length;
    return { name, x: width / 2 + rx * Math.cos(angle), y: height / 2 + ry * Math.sin(angle) };
  });
  return { places, width, height, kind: 'ring' };
}

/** Column of each service: the longest chain of callers above it. Cycles are cut where they close. */
function columns(services: readonly string[], edges: ReadonlyArray<[string, string]>): Map<string, number> {
  const callers = new Map<string, string[]>(services.map((s) => [s, []]));
  for (const [from, to] of edges) callers.get(to)?.push(from);
  const column = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (s: string): number => {
    const known = column.get(s);
    if (known !== undefined) return known;
    if (visiting.has(s)) return 0; // a cycle: stop here
    visiting.add(s);
    const d = Math.max(-1, ...(callers.get(s) ?? []).map(depth)) + 1;
    visiting.delete(s);
    column.set(s, d);
    return d;
  };
  for (const s of [...services].sort()) depth(s);
  return column;
}

export function layoutTown(services: readonly string[], roads: readonly Road[] = []): TownLayout {
  const present = new Set(services);
  const edges = roads.filter((r) => r.kind === 'mention' && r.a !== r.b && present.has(r.a) && present.has(r.b)).map((r) => [r.a, r.b] as [string, string]);
  if (edges.length === 0) return ring(services);

  const column = columns(services, edges);
  const count = Math.max(...column.values()) + 1;
  const byColumn: string[][] = Array.from({ length: count }, () => []);
  for (const s of [...services].sort()) byColumn[column.get(s) as number]?.push(s);
  // Order each column by the average row of its callers, so roads cross as little as possible.
  const row = new Map<string, number>();
  for (const names of byColumn) {
    const score = (s: string): number => {
      const rows = edges.filter(([, to]) => to === s).map(([from]) => row.get(from)).filter((r): r is number => r !== undefined);
      return rows.length > 0 ? rows.reduce((a, b) => a + b, 0) / rows.length : Number.POSITIVE_INFINITY;
    };
    names.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
    for (const [i, s] of names.entries()) row.set(s, i);
  }

  const tallest = Math.max(...byColumn.map((c) => c.length));
  const height = Math.max(MIN.height, 2 * EDGE.y + tallest * ROW_GAP);
  const width = Math.max(MIN.width, 2 * EDGE.x + (count - 1) * COL_GAP, Math.round(height * MIN_ASPECT));
  const places = byColumn.flatMap((names, c) =>
    names.map((name, i) => ({
      name,
      x: count === 1 ? width / 2 : EDGE.x + (c * (width - 2 * EDGE.x)) / (count - 1),
      y: EDGE.y + ((height - 2 * EDGE.y) * (i + 0.5)) / names.length,
    })),
  );
  return { places, width, height, kind: 'columns' };
}

/** Which way trouble moved along the roads: from the end that turned unwell first to the later one. */
export interface Spread {
  from: string;
  to: string;
  /** The Rewind frame at which the later end turned unwell. */
  frame: number;
}

/** Spreads along the given roads, from each service's first unwell frame. Same-frame pairs are ties and are left out. */
export function spreadsAlong(roads: readonly Road[], firstUnwell: ReadonlyMap<string, number>): Spread[] {
  const seen = new Set<string>();
  const out: Spread[] = [];
  for (const r of roads) {
    const fa = firstUnwell.get(r.a);
    const fb = firstUnwell.get(r.b);
    if (fa === undefined || fb === undefined || fa === fb) continue;
    const [from, to, frame] = fa < fb ? [r.a, r.b, fb] : [r.b, r.a, fa];
    const key = `${from}>${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to, frame });
  }
  return out.sort((x, y) => x.frame - y.frame || x.to.localeCompare(y.to));
}
