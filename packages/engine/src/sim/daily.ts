/**
 * The Daily Case: one simulated incident per calendar day (UTC), the same for everyone, so people can
 * compare results. The puzzle is derived from the date alone; the caller passes the date in (no clock
 * inside the engine).
 */
import { Rng } from './rng';
import { randomFault } from './simulate';
import type { FaultKind } from './faults';
import type { SimService } from './system';

/** Daily Case #1 is this day. */
export const DAILY_EPOCH = '2026-11-21';
const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DailyCase {
  /** 1 on DAILY_EPOCH, counting up one per day. */
  number: number;
  /** YYYY-MM-DD (UTC). */
  date: string;
  seed: number;
  service: SimService;
  fault: FaultKind;
}

/** FNV-1a over the text: a stable 32-bit seed. */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The UTC calendar date of a moment, as YYYY-MM-DD. */
export const utcDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function dailyCase(date: string): DailyCase {
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new RangeError(`not a YYYY-MM-DD date: ${date}`);
  const seed = seedOf(`chronolog-daily:${date}`);
  const { service, fault } = randomFault(new Rng(seed));
  const number = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / DAY_MS) + 1;
  return { number, date, seed, service, fault };
}
