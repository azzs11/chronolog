import {
  FAULT_KINDS,
  FAULTS,
  type FaultKind,
  type RankResult,
  randomFault,
  rankRootCauses,
  ROOTRANK_V1,
  Rng,
  SERVICES,
  type SimIncident,
  type SimService,
  simulateIncident,
  isObservable,
} from '@chronolog/engine';
import { useState } from 'react';
import CandidateCard from '../rootrank/CandidateCard';
import { EMPTY_TALLY, loadTally, percent, randomBaseline, recordRound, saveTally, type Tally } from './tally';

const SHOWN_AT_FIRST = 3;
const PEEK_LINES = 8;
const newSeed = (): number => Math.floor(Math.random() * 2_147_483_647);

type Phase =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'ranked'; incident: SimIncident; result: RankResult; seed: number }
  | { kind: 'revealed'; incident: SimIncident; result: RankResult; seed: number; rank: number };

/** A few lines that show the fault: the first warnings and errors after it began, or the service's own first lines. */
export function peekLines(incident: SimIncident): string[] {
  const after = incident.lines.filter((l) => l.timestamp >= incident.incidentStart);
  const loud = after.filter((l) => l.severity === 'error' || l.severity === 'warning');
  const chosen = (loud.length > 0 ? loud : after.filter((l) => l.service === incident.truth.service)).slice(0, PEEK_LINES);
  return chosen.map((l) => `${l.service}  ${l.severity}  ${l.message}`);
}

function Scoreboard({ tally, onReset }: { tally: Tally; onReset: () => void }) {
  const random = randomBaseline(SERVICES.length);
  return (
    <p className="text-sm text-text-secondary" aria-live="polite">
      Your rounds: {tally.played}. ChronoLog had the broken service first in {percent(tally.top1, tally.played)} and in its top 3 in{' '}
      {percent(tally.top3, tally.played)}. Random guessing among {SERVICES.length} services gets {random.top1} and {random.top3}.{' '}
      {tally.played > 0 && (
        <button type="button" className="underline" onClick={onReset}>
          Reset
        </button>
      )}
    </p>
  );
}

export default function PlaygroundView({ makeSeed = newSeed }: { makeSeed?: () => number }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [tally, setTally] = useState<Tally>(loadTally);
  const [giveStart, setGiveStart] = useState(false);
  const [choice, setChoice] = useState<{ service: SimService; fault: FaultKind } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const breakSomething = () => {
    setPhase({ kind: 'working' });
    setShowAll(false);
    // Let the page paint "working" before the (fast) simulation and ranking block the thread.
    setTimeout(() => {
      const seed = makeSeed();
      const { service, fault } = choice ?? randomFault(new Rng(seed));
      const incident = simulateIncident({ seed, service, fault });
      const result = rankRootCauses(incident.lines, giveStart ? incident.incidentStart : undefined, ROOTRANK_V1);
      setPhase({ kind: 'ranked', incident, result, seed });
    }, 0);
  };

  const reveal = () => {
    if (phase.kind !== 'ranked') return;
    const rank = phase.result.candidates.findIndex((c) => c.service === phase.incident.truth.service) + 1;
    const next = recordRound(tally, rank);
    setTally(next);
    saveTally(next);
    setPhase({ ...phase, kind: 'revealed', rank });
  };

  const reset = () => {
    setTally(EMPTY_TALLY);
    saveTally(EMPTY_TALLY);
  };

  const result = phase.kind === 'ranked' || phase.kind === 'revealed' ? phase.result : null;
  const truth = phase.kind === 'revealed' ? phase.incident.truth : null;
  const shown = result ? (showAll ? result.candidates : result.candidates.slice(0, SHOWN_AT_FIRST)) : [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-primary">Fault Playground</h2>
        <p className="text-sm text-text-secondary">
          Break a simulated system and see whether ChronoLog finds the broken service from its logs. Everything runs in your
          browser.
        </p>
        <p className="text-xs text-text-muted mt-1">
          The logs are simulated by ChronoLog itself, so this is a demo, not the benchmark. On real incidents (RCAEval) it
          finds the right service in its top 3 less often; see the Root Cause view for those numbers.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={breakSomething}
          disabled={phase.kind === 'working'}
        >
          {phase.kind === 'working' ? 'Simulating 8 minutes of logs…' : 'Break something'}
        </button>
        <label className="text-sm text-text-secondary">
          Fault
          <select
            className="block mt-1 rounded bg-bg-elevated border border-border-dim px-2 py-1 text-text-primary"
            value={choice?.fault ?? ''}
            onChange={(e) => setChoice(e.target.value ? { service: choice?.service ?? 'db', fault: e.target.value as FaultKind } : null)}
          >
            <option value="">Random</option>
            {FAULT_KINDS.map((k) => (
              <option key={k} value={k}>
                {FAULTS[k].label} ({FAULTS[k].difficulty})
              </option>
            ))}
          </select>
        </label>
        {choice && (
          <label className="text-sm text-text-secondary">
            Service
            <select
              className="block mt-1 rounded bg-bg-elevated border border-border-dim px-2 py-1 text-text-primary"
              value={choice.service}
              onChange={(e) => setChoice({ ...choice, service: e.target.value as SimService })}
            >
              {SERVICES.filter((s) => isObservable(s, choice.fault)).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={giveStart} onChange={(e) => setGiveStart(e.target.checked)} />
          Tell ChronoLog when it broke
        </label>
      </div>

      <Scoreboard tally={tally} onReset={reset} />

      {phase.kind === 'idle' && (
        <p className="text-sm text-text-muted">
          Press &ldquo;Break something&rdquo;. A random service gets a random fault. ChronoLog sees only the logs and makes its
          guess; you decide when to see the answer.
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-secondary">ChronoLog&apos;s guess</h3>
          <p className="text-xs text-text-muted">
            {result.startSource === 'given' ? 'Using the true start time.' : 'It had to estimate when the fault began.'} Compared{' '}
            {result.incidentLines.toLocaleString()} lines after the start with {result.baselineLines.toLocaleString()} before it.
          </p>
          <ol className="space-y-3">
            {shown.map((cause) => (
              <CandidateCard key={cause.service} cause={cause} highlight={truth?.service === cause.service} />
            ))}
          </ol>
          {result.candidates.length > SHOWN_AT_FIRST && (
            <button type="button" className="text-sm text-accent-secondary underline" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${result.candidates.length} services`}
            </button>
          )}
        </div>
      )}

      {phase.kind === 'ranked' && (
        <button type="button" className="btn btn-secondary" onClick={reveal}>
          Reveal the answer
        </button>
      )}

      {phase.kind === 'revealed' && truth && (
        <div className="card space-y-2" role="status">
          <p className="text-text-primary">
            The broken service was <span className="font-mono font-semibold">{truth.service}</span>: {FAULTS[truth.fault].label.toLowerCase()}.{' '}
            ChronoLog ranked it #{phase.rank}
            {phase.rank === 1 ? ' — a hit.' : phase.rank <= 3 ? ' — in its top 3.' : ' — a miss.'}
          </p>
          <p className="text-sm text-text-secondary">
            {FAULTS[truth.fault].description} How it shows in logs: {FAULTS[truth.fault].trace}
          </p>
          <details className="text-sm text-text-secondary">
            <summary className="cursor-pointer">A few of the lines that showed it</summary>
            <pre className="mt-2 overflow-x-auto text-xs font-mono">{peekLines(phase.incident).join('\n')}</pre>
          </details>
          <p className="text-xs text-text-muted">Seed {phase.seed}: the same seed always gives the same incident.</p>
        </div>
      )}
    </div>
  );
}
