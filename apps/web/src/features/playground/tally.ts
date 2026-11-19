/** The visitor's running score in the Fault Playground, kept in the browser only. */
export interface Tally {
  played: number;
  top1: number;
  top3: number;
}

const STORAGE_KEY = 'chronolog.playground.tally.v1';
export const EMPTY_TALLY: Tally = { played: 0, top1: 0, top3: 0 };

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Read the saved tally. Storage can be missing, blocked or corrupt (private windows), so any failure gives an empty tally. */
export function loadTally(): Tally {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      const { played, top1, top3 } = parsed as Record<string, unknown>;
      if (isCount(played) && isCount(top1) && isCount(top3) && top1 <= top3 && top3 <= played) {
        return { played, top1, top3 };
      }
    }
  } catch {
    // fall through: no storage, or unreadable
  }
  return EMPTY_TALLY;
}

export function saveTally(tally: Tally): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tally));
  } catch {
    // The page works without storage; the score just does not persist.
  }
}

/** Add one round, given the 1-based rank ChronoLog gave the truly broken service. */
export function recordRound(tally: Tally, rank: number): Tally {
  return {
    played: tally.played + 1,
    top1: tally.top1 + (rank === 1 ? 1 : 0),
    top3: tally.top3 + (rank <= 3 ? 1 : 0),
  };
}

export const percent = (part: number, whole: number): string => (whole === 0 ? '–' : `${Math.round((100 * part) / whole)}%`);

/** What random guessing scores with `services` candidates, so a hit rate always has its yardstick. */
export function randomBaseline(services: number): { top1: string; top3: string } {
  return { top1: percent(1, services), top3: percent(Math.min(3, services), services) };
}
