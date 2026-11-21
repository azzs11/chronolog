import { useCallback, useState } from 'react';
import { CLUES, type ClueKind, type Play } from './game';

/** Plays per case for one game mode, kept in this browser only. */
export type Plays = Record<string, Play>;

const isClue = (c: unknown): c is ClueKind => (CLUES as readonly unknown[]).includes(c);

function load(key: string): Plays {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    const out: Plays = {};
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const p = v as Partial<Play>;
      if (Array.isArray(p.guesses)) out[id] = { guesses: p.guesses.filter((g): g is string => typeof g === 'string'), clues: Array.isArray(p.clues) ? p.clues.filter(isClue) : [] };
    }
    return out;
  } catch {
    return {};
  }
}

export function usePlays(key: string): [Plays, (id: string, play: Play) => void] {
  const [plays, setPlays] = useState(() => load(key));
  const save = useCallback(
    (id: string, play: Play) => {
      setPlays((current) => {
        const next = { ...current, [id]: play };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // still playable, just not remembered
        }
        return next;
      });
    },
    [key],
  );
  return [plays, save];
}
