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
      <section aria-label="Your review" className="card flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-text-primary">
          {incident.status === 'confirmed' ? 'You confirmed ' : 'You said the real cause was '}
          <span className="font-mono font-semibold">{incident.correctService}</span>.
        </p>
        <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary">
          Change my answer
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Review this incident" className="card space-y-3">
      <h4 className="text-base text-text-primary">Close the case: was {top ? <span className="font-mono">{top}</span> : 'the best guess'} the root cause?</h4>
      <fieldset className="flex flex-wrap gap-2 text-sm text-text-primary">
        <legend className="sr-only">Your answer</legend>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-border-dim px-3 py-1.5 has-[:checked]:border-ink has-[:checked]:bg-pastel-lilac has-[:checked]:text-on-pastel">
          <input type="radio" name="answer" checked={answer === 'yes'} onChange={() => setAnswer('yes')} />
          Yes, that was it
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-border-dim px-3 py-1.5 has-[:checked]:border-ink has-[:checked]:bg-pastel-lilac has-[:checked]:text-on-pastel">
          <input type="radio" name="answer" checked={answer === 'no'} onChange={() => setAnswer('no')} />
          No, it was another service
        </label>
      </fieldset>
      {answer === 'no' && (
        <div>
          <label htmlFor="real-cause" className="mb-1 block text-xs text-text-muted">
            The real root cause
          </label>
          <select id="real-cause" value={service} onChange={(e) => setService(e.target.value)} className="field w-full">
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
        <textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="field w-full" />
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
        className="btn btn-primary"
      >
        {busy ? 'Saving…' : 'Close the case'}
      </button>
      <p className="text-xs text-text-muted">Your answer is stored with the ranking it was given for, so RootRank can learn from real incidents later.</p>
    </section>
  );
}
