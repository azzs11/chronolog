import { useState } from 'react';
import { type InjectedIncident, type RankData, RankError, injectIncident, rankRootCauses } from './api';
import { BENCHMARK } from './benchmarkFacts';
import CandidateCard from './CandidateCard';
import { startSourceText } from './format';

const WINDOWS = [5, 15, 60] as const;
const SHOWN_AT_FIRST = 5;

function Result({ data }: { data: RankData }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? data.candidates : data.candidates.slice(0, SHOWN_AT_FIRST);
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Incident start {new Date(data.incidentStart * 1000).toLocaleTimeString()} ({startSourceText[data.startSource]}).
        Compared {data.incidentLines.toLocaleString()} lines from the incident with {data.baselineLines.toLocaleString()} lines
        of normal traffic.
      </p>
      {data.warnings.map((w) => (
        <p key={w} className="text-sm text-sev-warning" role="status">
          {w}
        </p>
      ))}
      <ol className="space-y-3">
        {shown.map((cause) => (
          <CandidateCard key={cause.service} cause={cause} />
        ))}
      </ol>
      {data.candidates.length > SHOWN_AT_FIRST && (
        <button type="button" className="text-sm text-accent-secondary underline" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${data.candidates.length} services`}
        </button>
      )}
      <p className="text-xs text-text-muted">
        How much to trust this: on {BENCHMARK.dataset}, RootRank had the true service in its top 3 for{' '}
        {data.startSource === 'given' ? BENCHMARK.top3TrueStart : BENCHMARK.top3EstimatedStart} of incidents when the start
        was {data.startSource === 'given' ? 'given' : 'estimated from the logs, as here'} ({BENCHMARK.top3ResourceFaults} for
        cpu, memory, disk, delay, loss and socket faults with the true start), against {BENCHMARK.top3HandRules} for
        ChronoLog&apos;s older rules. The weights compare candidates with each other and are not probabilities.
        Evidence: {BENCHMARK.evidenceFile}.
      </p>
    </div>
  );
}

export default function RootRankView() {
  const [lookback, setLookback] = useState<number>(WINDOWS[1]);
  const [startText, setStartText] = useState('');
  const [data, setData] = useState<RankData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [injected, setInjected] = useState<InjectedIncident | null>(null);

  const run = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const incidentStart = startText ? new Date(startText).getTime() / 1000 : undefined;
      setData(await rankRootCauses({ lookbackMinutes: lookback, incidentStart }));
    } catch (err) {
      setData(null);
      setError(err instanceof RankError ? err.message : 'Could not reach the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const tryTestIncident = async () => {
    const key = sessionStorage.getItem('adminKey') || window.prompt('Enter the admin API key:');
    if (!key) return;
    setIsLoading(true);
    setError(null);
    try {
      const incident = await injectIncident(key);
      setInjected(incident);
      setData(await rankRootCauses({ lookbackMinutes: WINDOWS[1] }));
    } catch (err) {
      setData(null);
      setError(err instanceof RankError ? err.message : 'Could not reach the server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-primary">Root cause</h2>
        <p className="text-sm text-text-secondary">
          Something went wrong. Which service most likely broke first? ChronoLog compares the recent logs of every
          service with how it normally behaves and ranks them. If you know when it began, say so; otherwise it estimates.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-text-secondary">
          Look back
          <select
            className="block mt-1 rounded bg-bg-elevated border border-border-dim px-2 py-1 text-text-primary"
            value={lookback}
            onChange={(e) => setLookback(Number(e.target.value))}
          >
            {WINDOWS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-text-secondary">
          Incident started at (optional)
          <input
            type="datetime-local"
            className="block mt-1 rounded bg-bg-elevated border border-border-dim px-2 py-1 text-text-primary"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
          />
        </label>
        <button type="button" className="rounded-md bg-accent-solid px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50" onClick={run} disabled={isLoading}>
          {isLoading ? 'Ranking…' : 'Rank root causes'}
        </button>
        <button type="button" className="rounded border border-border-dim px-4 py-2 text-sm text-text-primary disabled:opacity-50" onClick={tryTestIncident} disabled={isLoading}>
          Inject a test incident
        </button>
      </div>
      {error && (
        <p className="text-sm text-sev-warning" role="alert">
          {error}
        </p>
      )}
      {!data && !error && !isLoading && (
        <p className="text-sm text-text-muted">
          Nothing ranked yet. Start the log generator or send logs, wait for some errors, then rank.
        </p>
      )}
      {injected && data && (
        <p className="text-sm text-text-secondary" role="status">
          A simulated incident was injected: <span className="font-mono">{injected.truth.service}</span> had a {injected.truth.fault} fault. ChronoLog
          ranked it #{data.candidates.findIndex((c) => c.service === injected.truth.service) + 1} of {data.candidates.length}.
        </p>
      )}
      {data && <Result data={data} />}
    </div>
  );
}
