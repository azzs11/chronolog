/**
 * The Arcade's rules, kept apart from the screen so they are easy to test. A case is won by naming
 * the culprit within MAX_GUESSES; clues are items the player chooses to use; stars reward reading
 * the town before reaching for help. Everything Tock says is built from the case's own data.
 */
import type { Mood, RewindTimeline } from '@chronolog/engine';
import { fieldNoteFor } from '../puzzle/fieldNotes';
import type { PuzzleData } from '../puzzle/types';
import { layoutTown, type TownLayout } from '../town/layout';
import type { Road } from '../town/roads';

export const MAX_GUESSES = 3;
export const CLUES = ['said', 'talk'] as const;
export type ClueKind = (typeof CLUES)[number];
export const CLUE_NAMES: Record<ClueKind, string> = { said: 'What they said', talk: 'Who is talked about' };

export interface Play {
  guesses: string[];
  clues: ClueKind[];
}

export const EMPTY_PLAY: Play = { guesses: [], clues: [] };

export const isSolved = (play: Play, answer: string): boolean => play.guesses.includes(answer);
export const isOver = (play: Play, answer: string): boolean => isSolved(play, answer) || play.guesses.length >= MAX_GUESSES;
export const missesOf = (play: Play, answer: string): number => play.guesses.filter((g) => g !== answer).length;

/** 3 stars for a first-try solve with no clues; each extra guess or clue costs one; a solve is worth at least 1. */
export function starsFor(play: Play, answer: string): number {
  if (!isSolved(play, answer)) return 0;
  return Math.max(1, 3 - (play.guesses.length - 1) - play.clues.length);
}

/** What cracked it: the last clue used before the winning guess, or the town itself. */
export function crackedBy(play: Play): string {
  const last = play.clues[play.clues.length - 1];
  return last ? CLUE_NAMES[last] : 'Reading the town';
}

/** "T-02:00" before the fault, "T+01:30" after. */
export function clockLabel(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  return `T${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Big towns (Train Ticket has 45 services) get small sprites and no roads, or the screen turns to spaghetti. */
export const CROWDED_FROM = 13;
const ROOMY = { w: 190, h: 150 } as const;
const TIGHT = { w: 120, h: 112 } as const;

/**
 * The game's town: a roomy grid with space for a speech bubble above every creature and a name
 * below. Services are taken in the learned layout's order (callers on the left, what they call to
 * the right) and filled column by column, so the left-to-right meaning survives.
 */
export function arcadeLayout(services: readonly string[], roads: readonly Road[]): TownLayout & { isGrid: boolean } {
  const n = services.length;
  const isCrowded = n >= CROWDED_FROM;
  const order = [...layoutTown(services, roads).places].sort((a, b) => a.x - b.x || a.y - b.y).map((p) => p.name);
  const cols = n <= 6 ? 3 : n <= 12 ? 4 : Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cell = isCrowded ? TIGHT : ROOMY;
  const places = order.map((name, i) => ({ name, x: cell.w * (Math.floor(i / rows) + 0.5), y: cell.h * ((i % rows) + 0.5) + 16 }));
  return { places, width: cols * cell.w, height: rows * cell.h + 24, kind: 'columns', isGrid: isCrowded };
}

/** Each service's mood on the last frame of the tape. */
export function finalMoods(frames: ReadonlyArray<Record<string, Mood>>): Record<string, Mood> {
  return frames[frames.length - 1] ?? {};
}

export type Timeline = RewindTimeline;

/** Tock's line after a wrong guess: true to the case's own data. */
export function wrongGuessLine(guess: string, data: PuzzleData, moods: Record<string, Mood>, play: Play): string {
  const looked = moods[guess] ?? 'fine';
  const answerLooked = moods[data.answer] ?? 'fine';
  if (looked !== 'fine' && answerLooked === 'fine') {
    return `Not ${guess}. It looks unwell, but faces show symptoms. Who could it be waiting on?`;
  }
  const unused = CLUES.filter((c) => !play.clues.includes(c));
  return unused[0] ? `Not ${guess}. Try a clue: ${CLUE_NAMES[unused[0]].toLowerCase()}.` : `Not ${guess}. Look again at who is talked about.`;
}

/** Tock's line when a clue is used: what the clue shows, from the data. */
export function clueLine(kind: ClueKind, data: PuzzleData): string {
  if (kind === 'said') {
    const speakers = data.clues.filter((c) => c.newMessages > 0).length;
    return speakers === 0
      ? 'Speech bubbles show anything new each one said. Nobody said anything new.'
      : `Speech bubbles show anything new each one said. ${speakers} of them said something new.`;
  }
  const top = [...data.clues].sort((a, b) => b.mentions - a.mentions)[0];
  return top && top.mentions > 0
    ? `The numbers show how often the others name each one. Someone is named ${top.mentions} times.`
    : 'The numbers show how often the others name each one. Nobody is named here.';
}

/** Tock's closing line: what it was, and how Tock itself did. */
export function endLine(data: PuzzleData, play: Play): string {
  const note = data.fault ? fieldNoteFor(data.fault) : null;
  const what = `${data.answer}${note ? `: ${note.title.toLowerCase()}` : ''}`;
  const tock = data.tockGuess === data.answer ? 'I guessed it too.' : data.tockGuess ? `I guessed ${data.tockGuess}. ${isSolved(play, data.answer) ? 'You beat me.' : 'I was fooled too.'}` : '';
  return isSolved(play, data.answer) ? `Got it! It was ${what}. ${tock}` : `Out of guesses. It was ${what}. ${tock}`;
}
