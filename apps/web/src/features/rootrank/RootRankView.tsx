import { useState } from 'react';
import { type RankData, RankError, rankRootCauses } from './api';
import { BENCHMARK } from './benchmarkFacts';
import { confidenceWord, evidenceSentences, startSourceText } from './format';

const WINDOWS = [5, 15, 60] as const;
const SHOWN_AT_FIRST = 5;

function Candidate({ cause }: { cause: RankData['candidates'][number] }) {
  const word = confidenceWord(cause.weight);
  return (
    <li className="card" data-testid="candidate">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-accent-secondary w-6">{cause.rank}</span>
        <span className="font-mono text-text-primary flex-1">{cause.service}</span>
        <span className="text-sm text-text-secondary">
          {word}, {cause.weight.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 rounded bg-bg-base mt-2" aria-hidden="true">
        <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${Math.round(cause.weight * 100)}%` }} />
      </div>
      <ul className="mt-3 space-y-1 text-sm text-text-secondary list-disc pl-5">
        {evidenceSentences(cause).map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>
    </li>
  );
}

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
        <p key={w} className="text-sm text-amber-400" role="status">
          {w}
        </p>
      ))}
      <ol className="space-y-3">
        {shown.map((cause) => (
          <Candidate key={cause.service} cause={cause} />
        ))}
      </ol>
      {data.candidates.length > SHOWN_AT_FIRST && (
        <button type="button" className="text-sm text-accent-secondary underline" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${data.candidates.length} services`}
        </button>
      )}
      <p className="text-xs text-text-muted">
        How much to trust this: on {BENCHMARK.dataset}, RootRank had the true service in its top 3 for {BENCHMARK.top3AllIncidents} of
        incidents ({BENCHMARK.top3ResourceFaults} for cpu, memory, disk, delay, loss and socket faults), against{' '}
        {BENCHMARK.top3HandRules} for ChronoLog&apos;s older rules. The weights compare candidates with each other and are
        not probabilities. Evidence: {BENCHMARK.evidenceFile}.
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text-primary">Root cause</h2>
        <p className="text-sm text-text-secondary">
          Something went wrong. Which service most likely broke first? ChronoLog compares the recent logs of every
          service with how it normally behaves and ranks them. If you know when it began, say so; otherwise it estimates.
        </p>
      </div>
      <div className="flex items-end gap-3">
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
        <button type="button" className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50" onClick={run} disabled={isLoading}>
          {isLoading ? 'Ranking…' : 'Rank root causes'}
        </button>
      </div>
      {error && (
        <p className="text-sm text-amber-400" role="alert">
          {error}
        </p>
      )}
      {!data && !error && !isLoading && (
        <p className="text-sm text-text-muted">
          Nothing ranked yet. Start the log generator or send logs, wait for some errors, then rank.
        </p>
      )}
      {data && <Result data={data} />}
    </div>
  );
}
