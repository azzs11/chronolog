import { useCallback, useEffect, useState } from 'react';
import { type ApiError, type FeedbackSummary, type IncidentSummary, fetchFeedbackSummary, fetchIncidents } from './api';

/** The inbox refreshes itself, so a new burst shows up without reloading. */
export const REFRESH_EVERY_MS = 15_000;

export interface Incidents {
  incidents: IncidentSummary[] | null;
  summary: FeedbackSummary | null;
  error: string | null;
  refresh: () => void;
}

export function useIncidents(): Incidents {
  const [incidents, setIncidents] = useState<IncidentSummary[] | null>(null);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchIncidents().then(
      (list) => {
        setIncidents(list);
        setError(null);
      },
      (err: ApiError) => setError(err.message),
    );
    fetchFeedbackSummary().then(setSummary, () => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { incidents, summary, error, refresh };
}
