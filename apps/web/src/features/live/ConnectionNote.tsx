import type { LiveStatus } from './useLiveLogs';

const COPY: Record<LiveStatus, { label: string; dot: string }> = {
  live: { label: 'Live', dot: 'bg-accent animate-pulse-dot' },
  paused: { label: 'Paused', dot: 'bg-sev-debug' },
  disconnected: { label: 'Disconnected, retrying', dot: 'bg-sev-warning' },
};

/** The one place the connection state is shown: a small dot and a word, not three loud buttons. */
export default function LiveDot({ status, pending }: { status: LiveStatus; pending: number }) {
  const { label, dot } = COPY[status];
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm text-text-secondary">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
      {status === 'paused' && pending > 0 && <span className="tabular text-text-muted">({pending} waiting)</span>}
    </span>
  );
}
