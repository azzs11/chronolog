import type { RankedCause } from '../rootrank/api';

/** One bundled real incident: the engine ran offline on the full logs; this is its result. */
export interface Replay {
  caseId: string;
  system: 'ob' | 'ss' | 'tt';
  fault: string;
  truth: string;
  services: number;
  rankGiven: number | null;
  rankEstimated: number | null;
  given: ReplayResult;
  estimated: ReplayResult;
  timeline: {
    bucketSeconds: number;
    /** Seconds from the true incident start to the first bucket (negative: the window starts before it). */
    startOffset: number;
    services: Array<{ name: string; lines: number[]; errors: number[] }>;
  };
}

export interface ReplayResult {
  incidentStart: number;
  startSource: 'given' | 'estimated';
  candidates: RankedCause[];
  baselineLines: number;
  incidentLines: number;
}

export interface ReplayBundle {
  source: string;
  modelNote: string;
  cases: Replay[];
}

export const SYSTEM_NAMES: Record<Replay['system'], string> = {
  ob: 'Online Boutique',
  ss: 'Sock Shop',
  tt: 'Train Ticket',
};

/** Loaded on demand, so the simulator page does not wait for the real-incident data. */
export async function loadReplays(): Promise<ReplayBundle> {
  const module = await import('./replays.json');
  return module.default as unknown as ReplayBundle;
}

/** Total log lines the engine read for a replay. */
export const totalLines = (replay: Replay): number =>
  replay.timeline.services.reduce((sum, s) => sum + s.lines.reduce((a, b) => a + b, 0), 0);
