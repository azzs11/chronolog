import { useState } from 'react';
import { type IncidentDetail, sendFeedback } from './api';

/**
 * "Was this the root cause?" Confirming agrees with ChronoLog's first choice; otherwise the engineer
 * names the real cause. Every answer is kept with the ranking it was given for, so RootRank can learn
 * from real incidents later.
 */
export default function FeedbackForm({ detail, onSaved }: { detail: IncidentDetail; onSaved: () => void }) {
  const top = detail.ranking.candidates[0]?.service ?? '';
  const { incident } = detail;
  const [editing, setEditing] = useState(incident.status === 'unreviewed');
  const [answer, setAnswer] = useState<'yes' | 'no'>('yes');
  const [service, setService] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(incident.id, answer === 'yes' ? { verdict: 'confirm', note: note || undefined } : { verdict: 'reject', correct_service: service, note: note || undefined });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer.');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <section aria-label="Your review" className="card space-y-2">
        <p className="text-sm text-text-primary">
          {incident.status === 'confirmed' ? 'You confirmed ' : 'You said the real cause was '}
          <span className="font-mono font-semibold">{incident.correctService}</span>.
        </p>
        <button type="button" onClick={() => setEditing(true)} className="text-sm text-accent underline">
          Change my answer
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Review this incident" className="card space-y-3">
      <h4 className="text-sm font-semibold text-text-primary">Was {top ? <span className="font-mono">{top}</span> : 'the first choice'} the root cause?</h4>
      <fieldset className="flex flex-wrap gap-4 text-sm text-text-primary">
        <legend className="sr-only">Your answer</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="answer" checked={answer === 'yes'} onChange={() => setAnswer('yes')} />
          Yes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="answer" checked={answer === 'no'} onChange={() => setAnswer('no')} />
          No, it was another service
        </label>
      </fieldset>
      {answer === 'no' && (
        <div>
          <label htmlFor="real-cause" className="mb-1 block text-xs text-text-muted">
            The real root cause
          </label>
          <select id="real-cause" value={service} onChange={(e) => setService(e.target.value)} className="w-full rounded-md border border-border-strong bg-bg-surface px-2 py-1.5 text-sm text-text-primary">
            <option value="">Choose a service</option>
            {detail.graph.services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="review-note" className="mb-1 block text-xs text-text-muted">
          Note (optional)
        </label>
        <textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="w-full rounded-md border border-border-strong bg-bg-surface px-2 py-1.5 text-sm text-text-primary" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-sev-warning">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy || (answer === 'no' && service === '')}
        className="rounded-md bg-accent-solid px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save my answer'}
      </button>
      <p className="text-xs text-text-muted">Answers are stored with the ranking they were given for, to improve ChronoLog later.</p>
    </section>
  );
}
