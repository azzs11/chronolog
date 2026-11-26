import type { UnusualTemplate } from '@chronolog/engine';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { API_URL } from '../../env';

/** The window is 5 minutes, so a refresh every 30 s is plenty. */
export const UNUSUAL_REFRESH_MS = 30_000;

export interface Unusual {
  templates: UnusualTemplate[] | null;
  isOnlyNewTemplates: boolean;
  error: string | null;
}

const isTemplateList = (value: unknown): value is UnusualTemplate[] =>
  Array.isArray(value) &&
  value.every((t) => typeof t === 'object' && t !== null && 'template' in t && 'count' in t && 'lineIds' in t);

/** Unusual messages from GET /api/anomalies/unusual (anomaly v2), refreshed on a timer. */
export function useUnusual(): Unusual {
  const [state, setState] = useState<Unusual>({ templates: null, isOnlyNewTemplates: false, error: null });
  useEffect(() => {
    let isActive = true;
    const load = () => {
      axios.get(`${API_URL}/api/anomalies/unusual`).then(
        (res) => {
          const data = res.data?.data as { templates?: unknown; isOnlyNewTemplates?: unknown } | undefined;
          if (!isActive) return;
          if (isTemplateList(data?.templates)) {
            setState({ templates: data.templates, isOnlyNewTemplates: data.isOnlyNewTemplates === true, error: null });
          } else {
            setState({ templates: null, isOnlyNewTemplates: false, error: 'unexpected response' });
          }
        },
        (err: unknown) => {
          if (isActive) setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'request failed' }));
        },
      );
    };
    load();
    const timer = setInterval(load, UNUSUAL_REFRESH_MS);
    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, []);
  return state;
}
