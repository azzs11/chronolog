"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUnixSeconds = toUnixSeconds;
exports.parseLog = parseLog;
exports.serviceFromPath = serviceFromPath;
const LEADING_TIME = /^\s*(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?|\d{10,13}(?:\.\d+)?)\s+(.*)$/;
const JSON_TIME_KEYS = ['timestamp', 'time', 'ts', '@timestamp'];
const JSON_MESSAGE_KEYS = ['message', 'msg'];
const JSON_LEVEL_KEYS = ['level', 'severity'];
const JSON_SERVICE_KEYS = ['service', 'source', 'app', 'container'];
const MILLISECONDS_FROM = 1e11; // a Unix time above this is milliseconds, not seconds
/** A continuation line is cut to this length so a huge stack trace cannot swamp a message. */
const MAX_CONTINUATION_CHARS = 400;
/** Unix seconds for a timestamp string or number, or null if it is not a time. */
function toUnixSeconds(value) {
    if (typeof value === 'number')
        return value >= MILLISECONDS_FROM ? value / 1000 : value;
    if (typeof value !== 'string')
        return null;
    if (/^\d{10,13}(?:\.\d+)?$/.test(value))
        return toUnixSeconds(Number(value));
    const text = value.replace(',', '.').replace(' ', 'T');
    const zoned = /(?:Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`;
    const ms = Date.parse(zoned);
    return Number.isNaN(ms) ? null : ms / 1000;
}
/** Common level spellings, mapped to the engine's five severities. An unknown level is left to be inferred. */
const LEVELS = {
    trace: 'debug', debug: 'debug', info: 'info', notice: 'info',
    warn: 'warning', warning: 'warning', err: 'error', error: 'error',
    fatal: 'critical', critical: 'critical', crit: 'critical', panic: 'critical', emerg: 'critical',
};
const firstOf = (record, keys) => keys.map((k) => record[k]).find((v) => v !== undefined);
function parseJsonLine(raw, fallbackService) {
    let record;
    try {
        record = JSON.parse(raw);
    }
    catch {
        return null;
    }
    const timestamp = toUnixSeconds(firstOf(record, JSON_TIME_KEYS));
    const message = firstOf(record, JSON_MESSAGE_KEYS);
    if (timestamp === null || typeof message !== 'string')
        return null;
    const level = firstOf(record, JSON_LEVEL_KEYS);
    const service = firstOf(record, JSON_SERVICE_KEYS);
    return {
        timestamp,
        message,
        service: typeof service === 'string' && service ? service : fallbackService,
        ...(typeof level === 'string' && LEVELS[level.toLowerCase()] ? { severity: LEVELS[level.toLowerCase()] } : {}),
    };
}
/** Parse one file's text. `service` names the plain-text lines (usually the file name). */
function parseLog(text, service) {
    const lines = [];
    let skipped = 0;
    for (const raw of text.split(/\r?\n/)) {
        if (raw.trim() === '')
            continue;
        if (raw.trimStart().startsWith('{')) {
            const parsed = parseJsonLine(raw, service);
            if (parsed)
                lines.push(parsed);
            else
                skipped++;
            continue;
        }
        const match = LEADING_TIME.exec(raw);
        const timestamp = match ? toUnixSeconds(match[1]) : null;
        if (match && timestamp !== null) {
            lines.push({ timestamp, message: match[2].trim(), service });
        }
        else if (lines.length > 0) {
            const last = lines[lines.length - 1];
            if (last.message.length < MAX_CONTINUATION_CHARS)
                last.message += ` ${raw.trim()}`.slice(0, MAX_CONTINUATION_CHARS);
        }
        else {
            skipped++;
        }
    }
    return { lines, skipped };
}
/** The service name a file stands for: its name without directory and extension. */
function serviceFromPath(path) {
    const base = path.split(/[\\/]/).pop() ?? path;
    return base.replace(/\.(log|txt|jsonl|json|ndjson)$/i, '') || 'app';
}
