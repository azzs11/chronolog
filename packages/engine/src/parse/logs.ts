/**
 * Turn log files into the engine's lines. Two formats are understood:
 *   JSON lines  one object per line with a time (`timestamp`, `time`, `ts`, `@timestamp`), a message
 *               (`message`, `msg`), and optionally `level`/`severity` and `service`/`source`/`app`.
 *   plain text  each line starts with a time: ISO 8601 ("2026-01-02T03:04:05.678Z", or with a space),
 *               or Unix seconds or milliseconds. Lines without one (stack traces) join the line above.
 * A time with no zone is read as UTC. The service of a plain-text file is its file name.
 */
import type { RcaLine } from '../rootrank/types';

const LEADING_TIME = /^\s*(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?|\d{10,13}(?:\.\d+)?)\s+(.*)$/;
const JSON_TIME_KEYS = ['timestamp', 'time', 'ts', '@timestamp'];
const JSON_MESSAGE_KEYS = ['message', 'msg'];
const JSON_LEVEL_KEYS = ['level', 'severity'];
const JSON_SERVICE_KEYS = ['service', 'source', 'app', 'container'];
const MILLISECONDS_FROM = 1e11; // a Unix time above this is milliseconds, not seconds
/** A continuation line is cut to this length so a huge stack trace cannot swamp a message. */
const MAX_CONTINUATION_CHARS = 400;

/** Unix seconds for a timestamp string or number, or null if it is not a time. */
export function toUnixSeconds(value: unknown): number | null {
  if (typeof value === 'number') return value >= MILLISECONDS_FROM ? value / 1000 : value;
  if (typeof value !== 'string') return null;
  if (/^\d{10,13}(?:\.\d+)?$/.test(value)) return toUnixSeconds(Number(value));
  const text = value.replace(',', '.').replace(' ', 'T');
  const zoned = /(?:Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`;
  const ms = Date.parse(zoned);
  return Number.isNaN(ms) ? null : ms / 1000;
}

/** Common level spellings, mapped to the engine's five severities. An unknown level is left to be inferred. */
const LEVELS: Record<string, string> = {
  trace: 'debug', debug: 'debug', info: 'info', notice: 'info',
  warn: 'warning', warning: 'warning', err: 'error', error: 'error',
  fatal: 'critical', critical: 'critical', crit: 'critical', panic: 'critical', emerg: 'critical',
};

const firstOf = (record: Record<string, unknown>, keys: string[]): unknown => keys.map((k) => record[k]).find((v) => v !== undefined);

function parseJsonLine(raw: string, fallbackService: string): RcaLine | null {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const timestamp = toUnixSeconds(firstOf(record, JSON_TIME_KEYS));
  const message = firstOf(record, JSON_MESSAGE_KEYS);
  if (timestamp === null || typeof message !== 'string') return null;
  const level = firstOf(record, JSON_LEVEL_KEYS);
  const service = firstOf(record, JSON_SERVICE_KEYS);
  return {
    timestamp,
    message,
    service: typeof service === 'string' && service ? service : fallbackService,
    ...(typeof level === 'string' && LEVELS[level.toLowerCase()] ? { severity: LEVELS[level.toLowerCase()] } : {}),
  };
}

export interface ParsedFile {
  lines: RcaLine[];
  /** Lines that were not a log line and had nothing to continue. */
  skipped: number;
}

/**
 * Parse one file's text. `service` names the plain-text lines (usually the file name). With `idPrefix`,
 * every line gets the id `<idPrefix>:<line number>` (1-based), so evidence can cite the exact line.
 */
export function parseLog(text: string, service: string, idPrefix?: string): ParsedFile {
  const lines: RcaLine[] = [];
  let skipped = 0;
  const rows = text.split(/\r?\n/);
  for (let n = 0; n < rows.length; n++) {
    const raw = rows[n] as string;
    if (raw.trim() === '') continue;
    const id = idPrefix === undefined ? {} : { id: `${idPrefix}:${n + 1}` };
    if (raw.trimStart().startsWith('{')) {
      const parsed = parseJsonLine(raw, service);
      if (parsed) lines.push({ ...parsed, ...id });
      else skipped++;
      continue;
    }
    const match = LEADING_TIME.exec(raw);
    const timestamp = match ? toUnixSeconds(match[1]) : null;
    if (match && timestamp !== null) {
      lines.push({ timestamp, message: (match[2] as string).trim(), service, ...id });
    } else if (lines.length > 0) {
      const last = lines[lines.length - 1] as RcaLine;
      if (last.message.length < MAX_CONTINUATION_CHARS) last.message += ` ${raw.trim()}`.slice(0, MAX_CONTINUATION_CHARS);
    } else {
      skipped++;
    }
  }
  return { lines, skipped };
}

/** The service name a file stands for: its name without directory and extension. */
export function serviceFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.(log|txt|jsonl|json|ndjson)$/i, '') || 'app';
}
