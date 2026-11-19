import type { ReviewStatus } from './api';

export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 90 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
}

/** "14:02:30 to 14:05:00", with the date when it is not today. */
export function formatRange(startIso: string, endIso: string, now: Date = new Date()): string {
  const start = new Date(startIso);
  const time = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const day = start.toDateString() === now.toDateString() ? '' : `${start.toLocaleDateString()} `;
  return `${day}${time(start)} to ${time(new Date(endIso))}`;
}

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  unreviewed: 'Not reviewed',
  confirmed: 'Confirmed',
  rejected: 'Corrected',
};
