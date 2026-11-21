import { useEffect, useMemo, useState } from 'react';
import Panes from '../../app/Panes';
import FilterBar, { type Mode } from './FilterBar';
import LiveDot from './LiveDot';
import RawLogTable from './RawLogTable';
import StatsStrip from './StatsStrip';
import TemplateDetail from './TemplateDetail';
import TemplateList from './TemplateList';
import { filterGroups, filterLogs, NO_FILTERS, servicesOf } from './filters';
import { computeStats } from './stats';
import { useLiveLogs } from './useLiveLogs';

const CLOCK_EVERY_MS = 1000;

/** "Now", refreshed each second, so relative times and the rate stay current. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function LiveView() {
  const live = useLiveLogs();
  const now = useNow();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [mode, setMode] = useState<Mode>('grouped');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const stats = useMemo(() => computeStats(live.logs, live.groups, live.baseline, now), [live.logs, live.groups, live.baseline, now]);
  const groups = useMemo(() => filterGroups(live.groups, filters), [live.groups, filters]);
  const logs = useMemo(() => filterLogs(live.logs, filters), [live.logs, filters]);
  const services = useMemo(() => servicesOf(live.groups), [live.groups]);
  const selected = mode === 'grouped' ? live.groups.find((g) => g.id === selectedId) : undefined;
  const nowSeconds = now / 1000;
  const isEmpty = live.logs.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-text-primary">Live</h2>
        <LiveDot status={live.status} pending={live.pending} />
        <button
          type="button"
          onClick={() => live.setPaused(!live.paused)}
          className="btn btn-secondary ml-auto"
        >
          {live.paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <StatsStrip stats={stats} />
      <FilterBar filters={filters} onChange={setFilters} services={services} mode={mode} onMode={setMode} />
      {live.loadError && (
        <p role="alert" className="text-sm text-sev-warning">
          Could not load recent logs: {live.loadError}. New logs will still appear as they arrive.
        </p>
      )}
      {isEmpty ? (
        <div className="card text-sm text-text-secondary">
          <p className="font-medium text-text-primary">No logs yet.</p>
          <p className="mt-1">
            Send one with <code className="log-text">POST /api/logs</code>, or start the log generator from the previous UI&apos;s Settings. Lines appear here
            as they arrive and are grouped by what they say.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Panes
            list={
              mode === 'grouped' ? (
                <TemplateList groups={groups} baseline={live.baseline} selectedId={selectedId} onSelect={setSelectedId} nowSeconds={nowSeconds} />
              ) : (
                <RawLogTable logs={logs} />
              )
            }
            detail={selected ? <TemplateDetail group={selected} nowSeconds={nowSeconds} isNew={!live.baseline.has(selected.id)} /> : null}
            onBack={() => setSelectedId(null)}
            detailLabel="Template details"
          />
        </div>
      )}
      <p className="text-xs text-text-muted">
        Counts are for the lines this page has received since it opened; the raw view keeps the latest 2,000.
      </p>
    </div>
  );
}
