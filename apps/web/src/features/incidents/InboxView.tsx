import { type KeyboardEvent, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Panes from '../../app/Panes';
import type { IncidentSummary } from './api';
import { STATUS_LABEL, formatDuration, formatRange } from './format';
import IncidentStory from './IncidentStory';
import { useIncidents } from './useIncidents';

const SERVICES_SHOWN = 3;

function ReviewStrip({ reviewed, top1, top3 }: { reviewed: number; top1: number; top3: number }) {
  if (reviewed === 0) {
    return <p className="text-xs text-text-muted">Nothing reviewed yet. Open an incident and say whether ChronoLog found the real cause; that is how it learns from your system.</p>;
  }
  return (
    <p className="text-xs text-text-secondary">
      You reviewed {reviewed}: ChronoLog had the real cause first in {top1} and in its top 3 in {top3}.
    </p>
  );
}

function Row({ incident, maxImpact, current, cursor, onOpen }: { incident: IncidentSummary; maxImpact: number; current: boolean; cursor: boolean; onOpen: () => void }) {
  const names = incident.services.map((s) => s.service);
  return (
    <li>
      <button
        type="button"
        aria-current={current ? 'true' : undefined}
        data-cursor={cursor ? 'true' : undefined}
        onClick={onOpen}
        className={`row-y flex w-full flex-col gap-1 border-l-2 px-3 text-left ${cursor ? 'border-l-accent' : 'border-l-transparent'} ${current ? 'bg-bg-elevated' : 'hover:bg-bg-surface'}`}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-text-primary">
            {names.slice(0, SERVICES_SHOWN).join(', ')}
            {names.length > SERVICES_SHOWN && ` +${names.length - SERVICES_SHOWN}`}
          </span>
          <span className="shrink-0 text-xs text-text-muted">{STATUS_LABEL[incident.status]}</span>
        </span>
        <span className="text-xs text-text-secondary">
          {formatRange(incident.start, incident.end)} · {formatDuration(incident.durationSeconds)} · {incident.errorLines.toLocaleString('en-US')} error lines
        </span>
        <span className="h-1 w-full rounded bg-bg-elevated" role="img" aria-label={`Impact ${incident.impact}`}>
          <span className="block h-1 rounded bg-accent" style={{ width: `${Math.max(4, (100 * incident.impact) / maxImpact)}%` }} />
        </span>
      </button>
    </li>
  );
}

/** The incidents inbox: bursts of errors, biggest impact first. j and k move, Enter opens. */
export default function InboxView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { incidents, summary, error, refresh } = useIncidents();
  const [cursor, setCursor] = useState(0);
  const list = incidents ?? [];
  const maxImpact = Math.max(1, ...list.map((i) => i.impact));
  const open = (incident: IncidentSummary) => navigate(`/incidents/${incident.id}`);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (list.length === 0) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      open(list[Math.min(cursor, list.length - 1)] as IncidentSummary);
      return;
    }
    const step = event.key === 'j' || event.key === 'ArrowDown' ? 1 : event.key === 'k' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    setCursor((c) => Math.min(list.length - 1, Math.max(0, c + step)));
  };

  const listPane = (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Incidents</h2>
        <p className="text-sm text-text-secondary">Bursts of error lines in the last hour, biggest impact first. Impact is error lines times services affected.</p>
      </div>
      {summary && <ReviewStrip reviewed={summary.reviewed} top1={summary.top1} top3={summary.top3} />}
      {error && (
        <p role="alert" className="text-sm text-sev-warning">
          Could not load incidents: {error}
        </p>
      )}
      {incidents === null && !error && <p className="text-sm text-text-muted">Loading…</p>}
      {incidents !== null && list.length === 0 && (
        <div className="card text-sm text-text-secondary">
          <p className="font-medium text-text-primary">No incidents in the last hour.</p>
          <p className="mt-1">
            An incident appears when error-level lines spike well above normal. Try the Playground to break something, or open Root Cause and press &ldquo;Inject a test incident&rdquo;.
          </p>
        </div>
      )}
      {list.length > 0 && (
        <ul aria-label="Incidents" onKeyDown={onKeyDown} className="divide-y divide-border-dim rounded-md border border-border-dim">
          {list.map((incident, i) => (
            <Row
              key={incident.id}
              incident={incident}
              maxImpact={maxImpact}
              current={incident.id === id}
              cursor={i === cursor}
              onOpen={() => {
                setCursor(i);
                open(incident);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );

  return <Panes list={listPane} detail={id ? <IncidentStory id={id} onReviewed={refresh} /> : null} onBack={() => navigate('/incidents')} detailLabel="Incident" />;
}
