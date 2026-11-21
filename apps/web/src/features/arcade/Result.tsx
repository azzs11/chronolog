import type { ReactNode } from 'react';
import { fieldNoteFor } from '../puzzle/fieldNotes';
import type { PuzzleData } from '../puzzle/types';
import { crackedBy, isSolved, MAX_GUESSES, type Play, starsFor } from './game';

/** The outcome: stars, what happened, how Tock did, the lesson and the field notes, then what to do next. */
export default function Result({ data, play, lesson, actions }: { data: PuzzleData; play: Play; lesson?: string; actions?: ReactNode }) {
  const solved = isSolved(play, data.answer);
  const stars = starsFor(play, data.answer);
  const note = data.fault ? fieldNoteFor(data.fault) : null;
  const tockHit = data.tockGuess === data.answer;
  return (
    <section aria-label="The outcome" className="space-y-4 p-4 sm:p-6">
      <p className="text-3xl text-[color:var(--arcade-gold)] [text-shadow:3px_3px_0_var(--arcade-deep)] sm:text-4xl">{solved ? 'CASE CLOSED' : 'CASE GONE COLD'}</p>
      <p className="text-3xl tracking-[0.3em] text-[color:var(--arcade-gold)]" role="img" aria-label={`${stars} of 3 stars`}>
        {'★'.repeat(stars)}
        <span className="text-[color:var(--arcade-lost)]">{'★'.repeat(3 - stars)}</span>
      </p>
      <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-base">
        <dt className="text-[color:var(--arcade-dim)]">CULPRIT</dt>
        <dd>
          {data.answer}
          {note ? ` · ${note.title.toLowerCase()}` : ''}
        </dd>
        <dt className="text-[color:var(--arcade-dim)]">GUESSES</dt>
        <dd>
          {play.guesses.length} of {MAX_GUESSES}
        </dd>
        <dt className="text-[color:var(--arcade-dim)]">CLUES USED</dt>
        <dd>{play.clues.length}</dd>
        {solved && (
          <>
            <dt className="text-[color:var(--arcade-dim)]">CRACKED BY</dt>
            <dd>{crackedBy(play)}</dd>
          </>
        )}
        {data.tockGuess && (
          <>
            <dt className="text-[color:var(--arcade-dim)]">TOCK</dt>
            <dd>
              guessed {data.tockGuess} · {tockHit ? 'HIT' : 'MISS'}
            </dd>
          </>
        )}
      </dl>
      {lesson && (
        <div className="px-window p-4">
          <p className="text-lg">WHAT YOU LEARNED</p>
          <p className="mt-1 font-sans text-base">{lesson}</p>
        </div>
      )}
      {note && (
        <div className="px-window space-y-1.5 p-4 font-sans text-sm">
          <p className="font-pixel text-lg">FIELD NOTES: {note.title.toUpperCase()}</p>
          <p>
            <b>In production:</b> {note.inProduction}
          </p>
          <p>
            <b>The giveaway:</b> {note.giveaway}
          </p>
          <p>
            <b>The trap:</b> {note.trap}
          </p>
          <p>
            <b>Check first:</b>
          </p>
          <ul className="list-disc pl-5">
            {note.firstChecks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {actions && <div className="flex flex-wrap gap-4 pt-1">{actions}</div>}
    </section>
  );
}
