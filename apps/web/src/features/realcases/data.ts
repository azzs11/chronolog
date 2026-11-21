import type { RewindTimeline } from '@chronolog/engine';
import type { ClueRow, PuzzleData } from '../puzzle/types';
import type { GraphData } from '../town/roads';

/** One real RCAEval incident, as `uv run bench export-puzzles` writes it (public/puzzles/real-cases.json). */
export interface RealCase {
  caseId: string;
  system: 'ob' | 'ss' | 'tt';
  fault: string;
  truth: string;
  services: string[];
  tockGuess: string | null;
  tockRankOfTruth: number | null;
  clues: ClueRow[];
  timeline: RewindTimeline;
  graph: GraphData;
}

export interface RealCaseBundle {
  source: string;
  modelNote: string;
  cases: RealCase[];
}

export const SYSTEM_NAMES: Record<RealCase['system'], string> = { ob: 'Online Boutique', ss: 'Sock Shop', tt: 'Train Ticket' };

/** Fetched, not bundled: real incidents are large and the demo has a JS budget. */
export async function loadRealCases(fetcher: typeof fetch = fetch): Promise<RealCaseBundle> {
  const res = await fetcher(`${import.meta.env.BASE_URL}puzzles/real-cases.json`);
  if (!res.ok) throw new Error(`Could not load the real cases (HTTP ${res.status}).`);
  const data = (await res.json()) as RealCaseBundle;
  if (!Array.isArray(data.cases)) throw new Error('The real cases file is not in the expected shape.');
  return data;
}

export const puzzleOf = (c: RealCase): PuzzleData => ({
  services: c.services,
  answer: c.truth,
  tockGuess: c.tockGuess,
  fault: c.fault,
  timeline: c.timeline,
  graph: c.graph,
  clues: c.clues,
});
