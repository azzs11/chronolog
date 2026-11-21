import { suspectMood } from '@chronolog/engine';
import { useEffect, useState } from 'react';
import Critter from '../../app/critters/Critter';
import Tock from '../../app/critters/Tock';
import Timeline from './Timeline';
import Rewind from '../town/Rewind';
import { confidenceWord } from '../rootrank/format';
import { ApiError, type IncidentDetail, fetchIncident } from './api';
import CaseStamp from './CaseStamp';
import EvidenceBubbles from './EvidenceBubbles';
import FeedbackForm from './FeedbackForm';
import SuspectLineup, { LINEUP_SIZE } from './SuspectLineup';
import SuspectTable from './SuspectTable';
import { formatDuration, formatRange } from './format';

const RELATIONS_SHOWN = 6;

/**
 * The case file for one incident: Tock's best guess, RootRank's ranking as a suspect lineup, cited
 * evidence for the suspect you pick, the logs over time, and the review that closes the case.
 */
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
  const others = ranking.candidates.slice(LINEUP_SIZE);
  const chosen = ranking.candidates.find((c) => c.service === selected);
  const top = ranking.candidates[0];
  const relations = [
    ...graph.mentions.map((m) => `${m.from} names ${m.to} (${m.count} lines)`),
    ...graph.correlations.map((c) => `${c.a} and ${c.b} move together (correlation ${c.corr.toFixed(2)})`),
  ].slice(0, RELATIONS_SHOWN);

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Case {incident.id}</p>
          <h3 className="text-xl text-text-primary">{formatRange(incident.start, incident.end)}</h3>
          <p className="text-sm text-text-secondary">
            {formatDuration(incident.durationSeconds)}, {incident.errorLines.toLocaleString('en-US')} error lines across {incident.services.length} services. Found as a
            burst of errors in the logs; a burst is worth a look, not proof of an incident.
          </p>
        </div>
        <CaseStamp status={incident.status} correctService={incident.correctService} />
      </header>

      {top && (
        <section aria-label="Best guess" className="flex items-center gap-3">
          <Tock size={48} />
          <p className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-text-primary">
            My best guess is <span className="font-mono font-bold">{top.service}</span>{' '}
            <span className="text-sm text-text-secondary">
              ({confidenceWord(top.weight, top.rank)}, {top.weight.toFixed(2)})
            </span>
            . Pick any suspect to see the evidence.
          </p>
        </section>
      )}

      <section aria-label="Candidates" className="space-y-3">
        <h4 className="text-base text-text-primary">The lineup</h4>
        <SuspectTable candidates={ranking.candidates} selected={selected} onSelect={setSelected} />
        <div className="lens-cute space-y-3">
        <SuspectLineup candidates={ranking.candidates} selected={selected} onSelect={setSelected} />
        {others.length > 0 && showAll && (
          <ol className="card-flat divide-y-2 divide-border-dim overflow-hidden" start={LINEUP_SIZE + 1}>
            {others.map((c) => (
              <li key={c.service}>
                <button
                  type="button"
                  aria-current={c.service === selected ? 'true' : undefined}
                  onClick={() => setSelected(c.service)}
                  className={`row-y flex w-full items-center gap-3 px-3 text-left ${c.service === selected ? 'bg-bg-elevated' : 'hover:bg-bg-elevated'}`}
                >
                  <span className="tabular w-6 text-text-muted">{c.rank}</span>
                  <Critter name={c.service} mood={suspectMood(c.evidence)} size={28} decorative />
                  <span className="flex-1 font-mono text-text-primary">{c.service}</span>
                  <span className="text-sm text-text-secondary">
                    {confidenceWord(c.weight, c.rank)}, {c.weight.toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {others.length > 0 && (
          <button type="button" className="text-sm text-accent underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide the other suspects' : `Show all ${ranking.candidates.length} services`}
          </button>
        )}
        </div>
        <p className="text-xs text-text-muted">
          Order and bars are RootRank&apos;s ranking. Faces come from each suspect&apos;s own logs in this window; a calm face can still rank first.
        </p>
      </section>

      {chosen && (
        <section aria-label={`Evidence for ${chosen.service}`} className="space-y-2">
          <h4 className="text-base text-text-primary">Evidence for {chosen.service}</h4>
          <EvidenceBubbles cause={chosen} />
        </section>
      )}

      <section aria-label="Rewind" className="lens-cute space-y-2">
        <h4 className="text-base text-text-primary">Rewind</h4>
        <Rewind timeline={timeline} graph={graph} selected={selected ?? undefined} />
      </section>

      <section aria-label="Logs over time" className="space-y-2">
        <h4 className="text-base text-text-primary">Logs over time</h4>
        <p className="text-xs text-text-muted">Each row is a service; darker means more lines; red marks error lines. The dashed line is when the burst began.</p>
        <Timeline timeline={timeline} highlight={selected ?? undefined} />
      </section>

      {relations.length > 0 && (
        <section aria-label="How services relate" className="space-y-1">
          <h4 className="text-base text-text-primary">Services that look connected</h4>
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
