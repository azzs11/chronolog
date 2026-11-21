/** Daily Case results, kept in this browser only (never sent anywhere), and the text people share. */

export const MAX_GUESSES = 3;
const STORAGE_KEY = 'chronolog.daily.v1';
const DAY_MS = 86_400_000;
export const SHARE_URL = 'chronolog.akchhya.xyz';

export interface DayResult {
  number: number;
  guesses: string[];
  isSolved: boolean;
  /** Whether Tock (RootRank, top-1) named the right service. */
  isTockRight: boolean;
}

export type History = Record<string, DayResult>;

export const isFinished = (r: DayResult | undefined): boolean => r !== undefined && (r.isSolved || r.guesses.length >= MAX_GUESSES);

export function loadHistory(): History {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as History) : {};
  } catch {
    return {};
  }
}

export function saveHistory(history: History): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Works without storage; the result just is not remembered.
  }
}

export interface Stats {
  played: number;
  solved: number;
  /** Days in a row, ending today (or yesterday if today is not finished yet), solved. */
  streak: number;
  /** Days you solved and Tock did not. */
  beatTock: number;
}

const dayBefore = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

export function statsOf(history: History, today: string): Stats {
  const finished = Object.values(history).filter(isFinished);
  let day = isFinished(history[today]) ? today : dayBefore(today);
  let streak = 0;
  while (history[day]?.isSolved) {
    streak++;
    day = dayBefore(day);
  }
  return {
    played: finished.length,
    solved: finished.filter((r) => r.isSolved).length,
    streak,
    beatTock: finished.filter((r) => r.isSolved && !r.isTockRight).length,
  };
}

/** The spoiler-free result: one square per guess, red for a miss and green for the hit. */
export function shareText(result: DayResult): string {
  const squares = result.guesses.map((_, i) => (result.isSolved && i === result.guesses.length - 1 ? '🟩' : '🟥')).join('');
  const score = result.isSolved ? `${result.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  return [`ChronoLog Daily #${result.number}  ${score}`, squares, `Tock: ${result.isTockRight ? '🟩' : '🟥'}`, SHARE_URL].join('\n');
}
