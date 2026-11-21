import { useEffect, useState } from 'react';
import Timeline from '../playground/Timeline';
import CandidateCard from '../rootrank/CandidateCard';
import { confidenceWord } from '../rootrank/format';
import { ApiError, type IncidentDetail, fetchIncident } from './api';
import FeedbackForm from './FeedbackForm';
import { formatDuration, formatRange } from './format';

const SHOWN_AT_FIRST = 5;
const RELATIONS_SHOWN = 6;

/** Everything about one incident: the ranked causes, the evidence for the one you pick, the logs over time, and the review. */
export default function IncidentStory({ id, onReviewed }: { id: string; onReviewed: () => void }) {
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [version, setVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` re-fetches after a review is saved
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchIncident(id).then(
      (d) => {
        if (cancelled) return;
        setDetail(d);
        setSelected(d.ranking.candidates[0]?.service ?? null);
        setShowAll(false);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load this incident.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-sev-warning">
        {error}
      </p>
    );
  }
  if (!detail) return <p className="text-sm text-text-muted">Loading the incident…</p>;

  const { incident, ranking, timeline, graph } = detail;
  const candidates = showAll ? ranking.candidates : ranking.candidates.slice(0, SHOWN_AT_FIRST);
  const chosen = ranking.candidates.find((c) => c.service === selected);
  const top = ranking.candidates[0];
  const relations = [
    ...graph.mentions.map((m) => `${m.from} names ${m.to} (${m.count} lines)`),
    ...graph.correlations.map((c) => `${c.a} and ${c.b} move together (correlation ${c.corr.toFixed(2)})`),
  ].slice(0, RELATIONS_SHOWN);

  return (
    <article className="space-y-5">
      <header className="space-y-1">
        <h3 className="text-xl font-semibold text-text-primary">{formatRange(incident.start, incident.end)}</h3>
        <p className="text-sm text-text-secondary">
          {formatDuration(incident.durationSeconds)}, {incident.errorLines.toLocaleString('en-US')} error lines across {incident.services.length} services. Found as a
          burst of errors in the logs; a burst is worth a look, not proof of an incident.
        </p>
      </header>

      {top && (
        <section aria-label="Best guess" className="card">
          <p className="text-xs text-text-muted">ChronoLog&apos;s best guess</p>
          <p className="text-lg text-text-primary">
            <span className="font-mono font-semibold">{top.service}</span> <span className="text-sm text-text-secondary">({confidenceWord(top.weight, top.rank)}, {top.weight.toFixed(2)})</span>
          </p>
        </section>
      )}

      <section aria-label="Candidates" className="space-y-2">
        <h4 className="text-sm font-semibold text-text-secondary">Candidates</h4>
        <ol className="card-flat divide-y-2 divide-border-dim overflow-hidden">
          {candidates.map((c) => (
            <li key={c.service}>
              <button
                type="button"
                aria-current={c.service === selected ? 'true' : undefined}
                onClick={() => setSelected(c.service)}
                className={`row-y flex w-full items-center gap-3 px-3 text-left ${c.service === selected ? 'bg-bg-elevated' : 'hover:bg-bg-surface'}`}
              >
                <span className="tabular w-6 text-text-muted">{c.rank}</span>
                <span className="flex-1 font-mono text-text-primary">{c.service}</span>
                <span className="text-sm text-text-secondary">{confidenceWord(c.weight, c.rank)}, {c.weight.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ol>
        {ranking.candidates.length > SHOWN_AT_FIRST && (
          <button type="button" className="text-sm text-accent underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show all ${ranking.candidates.length} services`}
          </button>
        )}
      </section>

      {chosen && (
        <section aria-label={`Evidence for ${chosen.service}`} className="space-y-2">
          <h4 className="text-sm font-semibold text-text-secondary">Evidence for {chosen.service}</h4>
          <ol>
            <CandidateCard cause={chosen} highlight />
          </ol>
        </section>
      )}

      <section aria-label="Logs over time" className="space-y-2">
        <h4 className="text-sm font-semibold text-text-secondary">Logs over time</h4>
        <p className="text-xs text-text-muted">Each row is a service; darker means more lines; red marks error lines. The dashed line is when the burst began.</p>
        <Timeline timeline={timeline} highlight={selected ?? undefined} />
      </section>

      {relations.length > 0 && (
        <section aria-label="How services relate" className="space-y-1">
          <h4 className="text-sm font-semibold text-text-secondary">Services that look connected</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
            {relations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">Learned from these logs only; not a record of the real architecture.</p>
        </section>
      )}

      <FeedbackForm
        key={`${incident.id}-${incident.status}-${incident.correctService}`}
        detail={detail}
        onSaved={() => {
          onReviewed();
          setVersion((v) => v + 1);
        }}
      />
    </article>
  );
}
