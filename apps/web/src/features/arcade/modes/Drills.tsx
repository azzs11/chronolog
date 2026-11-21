import { useEffect, useState } from 'react';
import { type IncidentDetail, type IncidentSummary, fetchIncident, fetchIncidents } from '../../incidents/api';
import { cluesFromCandidates, type PuzzleData } from '../../puzzle/types';
import { EMPTY_PLAY, isOver, isSolved } from '../game';
import GameCase from '../GameCase';
import { usePlays } from '../store';
import { ModeBar } from './common';

export const DRILLS_KEY = 'chronolog.drills.v1';
/** Drills come from the last day of stored incidents. */
const LOOKBACK_MINUTES = 24 * 60;

/** A reviewed incident from your own system as a puzzle; the answer is the cause your team confirmed. */
export function drillPuzzle(detail: IncidentDetail): PuzzleData | null {
  const answer = detail.incident.correctService;
  if (!answer) return null;
  const services = [...new Set([...detail.ranking.candidates.map((c) => c.service), ...detail.graph.services])].sort();
  return {
    services,
    answer,
    tockGuess: detail.ranking.candidates[0]?.service ?? null,
    fault: null,
    timeline: detail.timeline,
    graph: detail.graph,
    clues: cluesFromCandidates(detail.ranking.candidates),
  };
}

/**
 * Team drills: incidents from YOUR system that someone already closed in Incidents, replayed as
 * practice for the rest of the team. Every case you close becomes one. Self-hosted app only.
 */
export default function Drills({ onHome }: { onHome: () => void }) {
  const [reviewed, setReviewed] = useState<IncidentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ summary: IncidentSummary; data: PuzzleData } | null>(null);
  const [plays, save] = usePlays(DRILLS_KEY);
  useEffect(() => {
    fetchIncidents(LOOKBACK_MINUTES).then(
      (list) => setReviewed(list.filter((i) => i.status !== 'unreviewed' && i.correctService)),
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not load incidents.'),
    );
  }, []);
  const start = (summary: IncidentSummary) => {
    fetchIncident(summary.id).then(
      (detail) => {
        const data = drillPuzzle(detail);
        if (data) setOpen({ summary, data });
      },
      (err: unknown) => setError(err instanceof Error ? err.message : 'Could not open that incident.'),
    );
  };

  if (error) return <p role="alert" className="card text-sm">{error}</p>;
  if (!reviewed) return <p className="font-pixel text-text-muted">LOADING YOUR TEAM’S CASES…</p>;
  if (open) {
    return (
      <div className="space-y-4">
        <ModeBar title="YOUR TEAM · DRILL" onHome={() => setOpen(null)} />
        <GameCase
          key={open.summary.id}
          data={open.data}
          caseLabel="DRILL"
          play={plays[open.summary.id] ?? EMPTY_PLAY}
          onPlay={(p) => save(open.summary.id, p)}
          intro="A real incident from your own system, already solved by someone on your team. Can you find what they found?"
          lesson={`Your team said the cause was ${open.data.answer}${open.summary.status === 'confirmed' ? ', agreeing with my first guess' : ', correcting my first guess'}. Drills like this are how new people learn your system before their first on-call shift.`}
          actions={
            <button type="button" className="px-btn bg-pastel-lilac" onClick={() => setOpen(null)}>
              ALL DRILLS
            </button>
          }
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ModeBar title="YOUR TEAM" onHome={onHome} />
      {reviewed.length === 0 ? (
        <div className="card max-w-2xl space-y-2 text-sm">
          <p className="font-pixel text-lg">NO DRILLS YET</p>
          <p>
            Drills are made from your own incidents. Open one in <b>Incidents</b>, and close the case (confirm or correct the cause). It then shows up here as practice for
            your team, with the answer your team gave.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Team drills">
          {reviewed.map((i) => {
            const p = plays[i.id] ?? EMPTY_PLAY;
            const answer = i.correctService ?? '';
            const mark = isSolved(p, answer) ? '✓ SOLVED' : isOver(p, answer) ? '✗ MISSED' : 'NEW';
            return (
              <li key={i.id}>
                <button type="button" className="px-btn w-full bg-[color:var(--arcade-text)] text-left" onClick={() => start(i)}>
                  <span className="block">{mark}</span>
                  <span className="block font-sans text-xs">
                    {new Date(i.start).toLocaleString()} · {i.services.length} services · {i.errorLines} error lines
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
