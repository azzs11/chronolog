import type { RewindTimeline } from '@chronolog/engine';
import type { GraphData } from '../town/roads';

/** What the clues show about one service, from RootRank's evidence over the incident. */
export interface ClueRow {
  service: string;
  errorLines: number;
  mentions: number;
  newMessages: number;
  /** A few of the messages it never logged before. */
  examples: string[];
}

/** Everything one puzzle needs, whatever it came from (simulator, a real benchmark incident, your own incident). */
export interface PuzzleData {
  services: string[];
  answer: string;
  /** Tock's first choice (RootRank), or null if it had none. */
  tockGuess: string | null;
  /** Fault kind for the field notes (simulator or RCAEval names), or null if unknown. */
  fault: string | null;
  timeline: RewindTimeline;
  graph: GraphData;
  clues: ClueRow[];
}

/** Clue rows from RootRank candidates (the engine's or the API's shape). */
export function cluesFromCandidates(
  candidates: ReadonlyArray<{ service: string; evidence: { errorLines: number; mentions: number; novelTemplates: ReadonlyArray<{ template: string }> } }>,
): ClueRow[] {
  return candidates
    .map((c) => ({
      service: c.service,
      errorLines: c.evidence.errorLines,
      mentions: c.evidence.mentions,
      newMessages: c.evidence.novelTemplates.length,
      examples: c.evidence.novelTemplates.slice(0, 2).map((t) => t.template),
    }))
    .sort((a, b) => a.service.localeCompare(b.service));
}
