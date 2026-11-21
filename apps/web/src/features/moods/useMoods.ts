import type { ServiceMood } from '@chronolog/engine';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { API_URL } from '../../env';

/** Moods describe minutes, so a refresh every 15 s is plenty. */
export const MOODS_REFRESH_MS = 15_000;

export interface Moods {
  moods: ServiceMood[] | null;
  error: string | null;
}

const isMoodList = (value: unknown): value is ServiceMood[] =>
  Array.isArray(value) && value.every((m) => typeof m === 'object' && m !== null && 'service' in m && 'mood' in m && 'reason' in m);

/** Every service's mood from GET /api/moods, refreshed on a timer. */
export function useMoods(): Moods {
  const [state, setState] = useState<Moods>({ moods: null, error: null });
  useEffect(() => {
    let isActive = true;
    const load = () => {
      axios.get(`${API_URL}/api/moods`).then(
        (res) => {
          const moods: unknown = res.data?.data?.moods;
          if (isActive) setState(isMoodList(moods) ? { moods, error: null } : { moods: null, error: 'unexpected response' });
        },
        (err: unknown) => {
          if (isActive) setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'request failed' }));
        },
      );
    };
    load();
    const timer = setInterval(load, MOODS_REFRESH_MS);
    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, []);
  return state;
}
