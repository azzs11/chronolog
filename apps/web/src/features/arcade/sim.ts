import { type FaultKind, learnServiceGraph, rankRootCauses, ROOTRANK_V1, SERVICES, type SimService, simulateIncident, timelineOf } from '@chronolog/engine';
import { cluesFromCandidates, type PuzzleData } from '../puzzle/types';

const BUCKET_S = 30;

/**
 * A simulated incident as a puzzle. Tock is RootRank with an estimated start, as the app runs it
 * when nobody gives a start; warnings count as trouble on the tape (some faults only warn).
 */
export function simPuzzle(service: SimService, fault: FaultKind, seed: number): PuzzleData {
  const incident = simulateIncident({ seed, service, fault });
  const ranking = rankRootCauses(incident.lines, undefined, ROOTRANK_V1);
  return {
    services: [...SERVICES],
    answer: service,
    tockGuess: ranking.candidates[0]?.service ?? null,
    fault,
    timeline: timelineOf(incident.lines, incident.incidentStart, BUCKET_S, true),
    graph: learnServiceGraph(incident.lines),
    clues: cluesFromCandidates(ranking.candidates),
  };
}
