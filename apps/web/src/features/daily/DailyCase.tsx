import {
  dailyCase,
  FAULTS,
  learnServiceGraph,
  type RankResult,
  rankRootCauses,
  ROOTRANK_V1,
  SERVICES,
  simulateIncident,
  timelineOf,
  utcDate,
} from '@chronolog/engine';
import { useMemo, useState } from 'react';
import Critter from '../../app/critters/Critter';
import Tock from '../../app/critters/Tock';
import { dailyPostcard } from '../../app/postcard/builders';
import PostcardButton from '../../app/postcard/PostcardButton';
import Rewind from '../town/Rewind';
import { type DayResult, type History, isFinished, loadHistory, MAX_GUESSES, saveHistory, shareText, statsOf } from './record';

const BUCKET_S = 30;
const EVENT = 'the trouble';
const COPY_FALLBACK = 'Select the text above and copy it.';

/** Everything the puzzle needs for one date: the incident, Tock's ranking, and the clue data. */
function usePuzzle(date: string) {
  return useMemo(() => {
    const day = dailyCase(date);
    const incident = simulateIncident({ seed: day.seed, service: day.service, fault: day.fault });
    const ranking: RankResult = rankRootCauses(incident.lines, undefined, ROOTRANK_V1);
    // Warnings count as trouble here: a slow network or memory pressure only ever produces warnings.
    const timeline = timelineOf(incident.lines, incident.incidentStart, BUCKET_S, true);
    const graph = learnServiceGraph(incident.lines);
    return { day, ranking, timeline, graph, tockGuess: ranking.candidates[0]?.service ?? '' };
  }, [date]);
}

function Clue({ n, title, isOpen, children }: { n: number; title: string; isOpen: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={`Clue ${n}: ${title}`} className={isOpen ? 'card space-y-2' : 'card-flat p-4 text-sm text-text-muted'}>
      <h3 className="text-base text-text-primary">
        Clue {n}: {title}
      </h3>
      {isOpen ? children : <p>Unlocks after {n - 1 === 1 ? 'a wrong guess' : `${n - 1} wrong guesses`}.</p>}
    </section>
  );
}

/** Per service: messages it never said before the trouble, and its error lines (from RootRank's evidence). */
function WhatTheySaid({ ranking }: { ranking: RankResult }) {
  const rows = [...ranking.candidates].sort((a, b) => a.service.localeCompare(b.service));
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((c) => (
        <li key={c.service} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono font-bold">{c.service}</span>
          <span className="text-text-secondary">
            {c.evidence.novelTemplates.length} new kind{c.evidence.novelTemplates.length === 1 ? '' : 's'} of message, {c.evidence.errorLines} error lines
          </span>
          {c.evidence.novelTemplates[0] && <code className="log-text min-w-0 break-all text-text-muted">“{c.evidence.novelTemplates[0].template}”</code>}
        </li>
      ))}
    </ul>
  );
}

function WhoIsTalkedAbout({ ranking }: { ranking: RankResult }) {
  const rows = [...ranking.candidates].sort((a, b) => b.evidence.mentions - a.evidence.mentions || a.service.localeCompare(b.service));
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((c) => (
        <li key={c.service}>
          <span className="font-mono font-bold">{c.service}</span> <span className="text-text-secondary">is named in {c.evidence.mentions} lines by other services</span>
        </li>
      ))}
    </ul>
  );
}

function ShareBox({ result }: { result: DayResult }) {
  const [note, setNote] = useState('');
  const text = shareText(result);
  const copy = () => navigator.clipboard?.writeText(text).then(() => setNote('Copied.'), () => setNote(COPY_FALLBACK)) ?? setNote(COPY_FALLBACK);
  return (
    <div className="space-y-2">
      <pre className="log-text rounded-xl border-2 border-dashed border-ink bg-bg-base p-3 text-text-primary">{text}</pre>
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={copy}>
          Copy my result
        </button>
        <span aria-live="polite" className="text-sm text-text-secondary">
          {note}
        </span>
      </div>
    </div>
  );
}

/**
 * One simulated incident a day, the same for everyone. Three guesses; each wrong guess opens another
 * clue. Tock (RootRank) guesses too, and its guess is shown only at the end.
 */
export default function DailyCase({ today = utcDate(Date.now()) }: { today?: string }) {
  const { day, ranking, timeline, graph, tockGuess } = usePuzzle(today);
  const [history, setHistory] = useState<History>(loadHistory);
  const result: DayResult = history[today] ?? { number: day.number, guesses: [], isSolved: false, isTockRight: tockGuess === day.service };
  const isDone = isFinished(result);
  const misses = result.guesses.filter((g) => g !== day.service).length;
  const stats = statsOf(history, today);
  const fault = FAULTS[day.fault];

  const guess = (service: string) => {
    if (isDone || result.guesses.includes(service)) return;
    const next: History = { ...history, [today]: { ...result, guesses: [...result.guesses, service], isSolved: service === day.service } };
    setHistory(next);
    saveHistory(next);
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-3xl text-text-primary">Daily Case #{day.number}</h2>
        <p className="text-sm text-text-secondary">The same simulated incident for everyone today ({today}, UTC). A new one at midnight UTC.</p>
      </header>

      <div className="flex items-start gap-3">
        <Tock size={52} />
        <p className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-sm text-text-primary">
          Something broke in the shop. Six services, one culprit. You have {MAX_GUESSES} guesses, and each miss opens a new clue. I have made my guess too; you will see
          it at the end.
        </p>
      </div>

      <Clue n={1} title="Watch it happen" isOpen>
        <Rewind timeline={timeline} graph={graph} event={EVENT} countsLabel="line counts and warning-or-error counts" />
      </Clue>
      <Clue n={2} title="What they said" isOpen={misses >= 1 || isDone}>
        <WhatTheySaid ranking={ranking} />
      </Clue>
      <Clue n={3} title="Who is being talked about" isOpen={misses >= 2 || isDone}>
        <WhoIsTalkedAbout ranking={ranking} />
      </Clue>

      <section aria-label="Your guess" className="card space-y-3">
        <h3 className="text-base text-text-primary">{isDone ? 'Your guesses' : `Who did it? Guess ${result.guesses.length + 1} of ${MAX_GUESSES}`}</h3>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SERVICES.map((s) => {
            const isGuessed = result.guesses.includes(s);
            const isCulprit = isDone && s === day.service;
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={isDone || isGuessed}
                  onClick={() => guess(s)}
                  aria-label={`${s}${isGuessed ? (s === day.service ? ', right' : ', wrong') : ''}`}
                  className={`flex w-full flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 text-xs font-bold ${
                    isCulprit ? 'border-ink bg-pastel-mint text-on-pastel' : isGuessed ? 'border-border-dim bg-pastel-pink text-on-pastel line-through' : 'border-border-dim hover:border-ink'
                  } disabled:cursor-default`}
                >
                  <Critter name={s} mood={isCulprit ? 'sick' : 'fine'} size={40} decorative />
                  {s}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {isDone && (
        <section aria-label="The answer" className="card space-y-3">
          <h3 className="text-xl text-text-primary">{result.isSolved ? `Solved in ${result.guesses.length}!` : 'Not this time.'}</h3>
          <p className="text-sm text-text-primary">
            It was <span className="font-mono font-bold">{day.service}</span>: {fault.label.toLowerCase()} ({fault.difficulty}). {fault.trace}
          </p>
          <p className="text-sm text-text-primary">
            Tock guessed <span className="font-mono font-bold">{tockGuess}</span>: {result.isTockRight ? 'right.' : 'wrong.'}{' '}
            {result.isSolved && !result.isTockRight ? 'You beat the bot today.' : ''}
          </p>
          <ShareBox result={result} />
          <PostcardButton spec={dailyPostcard(result)} fileName={`chronolog-daily-${day.number}.png`} />
          <p className="text-xs text-text-muted">
            Played {stats.played} · solved {stats.solved} · streak {stats.streak} · beat Tock {stats.beatTock}. Kept in this browser only. Simulated logs are easier than
            real ones; see the Report card for real results.
          </p>
        </section>
      )}
    </div>
  );
}
