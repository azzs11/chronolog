import type { LiveStatus } from './useLiveLogs';

/**
 * The stream's state, said only when something is off: nothing while logs flow normally (the page
 * title already says Live), a quiet word when paused or disconnected. No dot, nothing blinks.
 */
export default function ConnectionNote({ status, pending }: { status: LiveStatus; pending: number }) {
  return (
    <span role="status" aria-live="polite" className="text-sm text-text-secondary">
      {status === 'paused' && (
        <>
          Paused{pending > 0 && <span className="tabular text-text-muted"> ({pending} waiting)</span>}
        </>
      )}
      {status === 'disconnected' && <span className="text-sev-warning">Disconnected, retrying</span>}
    </span>
  );
}
