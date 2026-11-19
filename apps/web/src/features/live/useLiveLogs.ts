import { type TemplateGroup, TemplateStream } from '@chronolog/engine';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../../env';
import socketService from '../../services/socketService';
import type { LiveLog } from './stats';

/** How many recent lines the raw table can show. */
export const BUFFER_LINES = 2000;
const INITIAL_LINES = 200;
/** Screen updates are batched, so a burst of logs is one render, not hundreds. */
const FLUSH_EVERY_MS = 400;
const REMEMBERED_IDS = 5000;

interface RawLog {
  id: string;
  message: string;
  severity: string;
  source: string;
  timestamp: string;
}

const toLive = (raw: RawLog): LiveLog => ({
  id: raw.id,
  message: raw.message,
  severity: raw.severity,
  source: raw.source,
  time: Date.parse(raw.timestamp),
});

export type LiveStatus = 'live' | 'paused' | 'disconnected';

export interface LiveLogs {
  logs: LiveLog[];
  groups: TemplateGroup[];
  /** Templates present when the page opened; anything else that appears later is new. */
  baseline: ReadonlySet<number>;
  status: LiveStatus;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  /** Lines that arrived while paused and are waiting. */
  pending: number;
  loadError: string | null;
}

/** The live stream: recent logs from the API, then new ones over the socket, grouped by template. */
export function useLiveLogs(): LiveLogs {
  const stream = useRef(new TemplateStream());
  const buffer = useRef<LiveLog[]>([]);
  const queue = useRef<LiveLog[]>([]);
  const seen = useRef(new Set<string>());
  const dirty = useRef(false);
  const pausedRef = useRef(false);
  const [view, setView] = useState<{ logs: LiveLog[]; groups: TemplateGroup[] }>({ logs: [], groups: [] });
  const [baseline, setBaseline] = useState<ReadonlySet<number>>(new Set());
  const [paused, setPausedState] = useState(false);
  const [pending, setPending] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ingest = useCallback((batch: LiveLog[]) => {
    for (const log of batch) {
      if (seen.current.has(log.id)) continue; // the initial load and the socket can both deliver a line
      seen.current.add(log.id);
      if (seen.current.size > REMEMBERED_IDS) seen.current.delete(seen.current.values().next().value as string);
      stream.current.add({ id: log.id, timestamp: log.time / 1000, service: log.source, severity: log.severity, message: log.message });
      buffer.current.push(log);
    }
    if (buffer.current.length > BUFFER_LINES) buffer.current.splice(0, buffer.current.length - BUFFER_LINES);
    dirty.current = true;
  }, []);

  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    setView({ logs: [...buffer.current], groups: stream.current.groups() });
  }, []);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<{ data?: RawLog[] }>(`${API_URL}/api/logs?limit=${INITIAL_LINES}`)
      .then((response) => {
        if (cancelled) return;
        ingest((response.data.data ?? []).map(toLive));
        flush();
        setBaseline(new Set(stream.current.groups().map((g) => g.id)));
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load recent logs.');
      });

    socketService.connect();
    const onLog = (raw: RawLog) => {
      const log = toLive(raw);
      if (pausedRef.current) {
        queue.current.push(log);
        setPending(queue.current.length);
      } else {
        ingest([log]);
      }
    };
    socketService.onNewLog(onLog);
    const unsubscribe = socketService.onConnectionChange(setConnected);
    const timer = setInterval(flush, FLUSH_EVERY_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
      socketService.off('new-log', onLog);
    };
  }, [ingest, flush]);

  const setPaused = useCallback(
    (next: boolean) => {
      pausedRef.current = next;
      setPausedState(next);
      if (!next) {
        ingest(queue.current);
        queue.current = [];
        setPending(0);
        flush();
      }
    },
    [ingest, flush],
  );

  const status: LiveStatus = paused ? 'paused' : connected ? 'live' : 'disconnected';
  return { logs: view.logs, groups: view.groups, baseline, status, paused, setPaused, pending, loadError };
}
