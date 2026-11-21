import { dailyCase, utcDate } from '@chronolog/engine';
import { useMemo, useState } from 'react';
import { dailyPostcard } from '../../../app/postcard/builders';
import PostcardButton from '../../../app/postcard/PostcardButton';
import { type DayResult, type History, loadHistory, saveHistory, shareText, statsOf } from '../../daily/record';
import { isSolved, type Play } from '../game';
import GameCase from '../GameCase';
import { simPuzzle } from '../sim';
import { ModeBar } from './common';

const COPY_FALLBACK = 'Select the text and copy it.';

function ShareBox({ result }: { result: DayResult }) {
  const [note, setNote] = useState('');
  const text = shareText(result);
  const copy = () => navigator.clipboard?.writeText(text).then(() => setNote('COPIED!'), () => setNote(COPY_FALLBACK)) ?? setNote(COPY_FALLBACK);
  return (
    <div className="w-full space-y-2">
      <pre className="px-window whitespace-pre-wrap p-3 font-mono text-sm">{text}</pre>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className="px-btn bg-pastel-pink" onClick={copy}>
          COPY RESULT
        </button>
        <span aria-live="polite" className="text-sm">
          {note}
        </span>
      </div>
    </div>
  );
}

/** One simulated case a day, the same for everyone, with a spoiler-free result to share. */
export default function Daily({ today = utcDate(Date.now()), onHome }: { today?: string; onHome: () => void }) {
  const day = useMemo(() => dailyCase(today), [today]);
  const data = useMemo(() => simPuzzle(day.service, day.fault, day.seed), [day]);
  const [history, setHistory] = useState<History>(loadHistory);
  const result: DayResult = history[today] ?? { number: day.number, guesses: [], clues: [], isSolved: false, isTockRight: data.tockGuess === day.service };
  const play: Play = { guesses: result.guesses, clues: result.clues ?? [] };
  const stats = statsOf(history, today);
  const save = (p: Play) => {
    const next: History = { ...history, [today]: { ...result, guesses: p.guesses, clues: p.clues, isSolved: isSolved(p, day.service) } };
    setHistory(next);
    saveHistory(next);
  };
  return (
    <div className="space-y-4">
      <ModeBar title={`DAILY CASE #${day.number}`} onHome={onHome}>
        <span className="font-pixel text-text-secondary">
          {today} · STREAK {stats.streak}
        </span>
      </ModeBar>
      <GameCase
        data={data}
        caseLabel={`DAILY #${day.number}`}
        play={play}
        onPlay={save}
        intro="Today's case: the same for everyone. Six services, one culprit, three guesses. Each clue costs a star."
        actions={
          <>
            <ShareBox result={{ ...result, guesses: play.guesses }} />
            <PostcardButton spec={dailyPostcard({ ...result, guesses: play.guesses, isSolved: isSolved(play, day.service) })} fileName={`chronolog-daily-${day.number}.png`} />
            <p className="w-full font-sans text-xs text-[color:var(--arcade-dim)]">
              Played {stats.played} · solved {stats.solved} · beat Tock {stats.beatTock}. Kept in this browser only. Simulated logs are easier than real ones.
            </p>
          </>
        }
      />
    </div>
  );
}
