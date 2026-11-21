import { SERVICE_DEPS } from '@chronolog/engine';

/** The learned graph as the incident and graph APIs return it. */
export interface GraphData {
  services: string[];
  mentions: ReadonlyArray<{ from: string; to: string; count: number }>;
  correlations: ReadonlyArray<{ a: string; b: string; corr: number }>;
}

export type RoadKind = 'mention' | 'correlation' | 'prior';

export interface Road {
  a: string;
  b: string;
  kind: RoadKind;
  /** 0-1: how sure the road is (log share for mentions, correlation for volume, 1 for the hand map). */
  strength: number;
  label: string;
}

export interface Place {
  name: string;
  x: number;
  y: number;
}

/** Drawing box of the town, in SVG units. */
export const TOWN = { width: 560, height: 360, margin: 62 } as const;

/**
 * Services on an ellipse, in name order, so the same services always sit in the same places and a
 * town looks the same on every visit.
 */
export function layoutTown(services: readonly string[]): Place[] {
  const names = [...services].sort();
  const rx = TOWN.width / 2 - TOWN.margin;
  const ry = TOWN.height / 2 - TOWN.margin;
  if (names.length === 1) return [{ name: names[0] as string, x: TOWN.width / 2, y: TOWN.height / 2 }];
  return names.map((name, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / names.length;
    return { name, x: TOWN.width / 2 + rx * Math.cos(angle), y: TOWN.height / 2 + ry * Math.sin(angle) };
  });
}

export interface RoadOptions {
  /** Volume-correlation roads: many and weak, so shown only on request when mention roads exist. */
  withCorrelations: boolean;
  /** The hand-made SERVICE_DEPS map, as dotted roads. */
  withPrior: boolean;
}

/** By default, show volume roads only when the logs name no other services (then they are all there is). */
export const defaultRoadOptions = (graph: GraphData): RoadOptions => ({ withCorrelations: graph.mentions.length === 0, withPrior: false });

/** Roads from the learned graph, plus the optional kinds the options ask for. */
export function townRoads(graph: GraphData, options: RoadOptions): Road[] {
  const maxCount = Math.max(1, ...graph.mentions.map((m) => m.count));
  const roads: Road[] = [
    ...graph.mentions.map((m) => ({ a: m.from, b: m.to, kind: 'mention' as const, strength: m.count / maxCount, label: `${m.from} names ${m.to} in ${m.count} lines` })),
    ...(options.withCorrelations ? graph.correlations : []).map((c) => ({ a: c.a, b: c.b, kind: 'correlation' as const, strength: Math.abs(c.corr), label: `${c.a} and ${c.b} move together (${c.corr.toFixed(2)})` })),
  ];
  return options.withPrior ? [...roads, ...priorRoads(graph.services)] : roads;
}

/** Edges of the hand-made SERVICE_DEPS map whose both ends are among these services. */
export function priorRoads(services: readonly string[]): Road[] {
  const present = new Set(services);
  return Object.entries(SERVICE_DEPS).flatMap(([from, deps]) =>
    present.has(from) ? deps.filter((to) => present.has(to)).map((to) => ({ a: from, b: to, kind: 'prior' as const, strength: 1, label: `hand-made map: ${from} depends on ${to}` })) : [],
  );
}
