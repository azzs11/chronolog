import { useEffect, useState } from 'react';
import CandidateCard from '../rootrank/CandidateCard';
import Timeline from './Timeline';
import { type Replay, type ReplayBundle, SYSTEM_NAMES, loadReplays, totalLines } from './replays';

const SHOWN_AT_FIRST = 3;
const FAULT_LABELS: Record<string, string> = {
  cpu: 'CPU saturation',
  mem: 'Memory pressure',
  delay: 'Network delay',
  loss: 'Packet loss',
  disk: 'Disk full',
  socket: 'Socket exhaustion',
};
const faultLabel = (fault: string): string => FAULT_LABELS[fault] ?? (/^f\d$/.test(fault) ? 'Code fault (service restarted with a bug)' : fault);

export default function ReplayView({ load = loadReplays }: { load?: () => Promise<ReplayBundle> }) {
  const [bundle, setBundle] = useState<ReplayBundle | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [giveStart, setGiveStart] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    load().then(setBundle, () => setFailed(true));
  }, [load]);

  if (failed) return <p className="text-sm text-sev-warning" role="alert">Could not load the real incidents.</p>;
  if (!bundle) return <p className="text-sm text-text-muted">Loading real incidents…</p>;
  if (bundle.cases.length === 0) return <p className="text-sm text-text-muted">No real incidents are bundled in this build.</p>;

  const replay: Replay | undefined = index === null ? undefined : bundle.cases[index];
  const result = replay ? (giveStart ? replay.given : replay.estimated) : null;
  const rank = replay ? (giveStart ? replay.rankGiven : replay.rankEstimated) : null;
  const shown = result ? (showAll ? result.candidates : result.candidates.slice(0, SHOWN_AT_FIRST)) : [];

  const pick = (i: number) => {
    setIndex(i);
    setRevealed(false);
    setShowAll(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Five real incidents from the public RCAEval benchmark, picked by a fixed rule before looking at any result. ChronoLog
        analysed the full real logs ahead of time with a model that never saw these services in training. Misses are shown
        like hits.
      </p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Choose a real incident</legend>
        {bundle.cases.map((c, i) => (
          <button
            key={c.caseId}
            type="button"
            aria-pressed={index === i}
            className={`rounded border px-3 py-1.5 text-sm ${index === i ? 'border-accent text-text-primary' : 'border-border-dim text-text-secondary'}`}
            onClick={() => pick(i)}
          >
            {SYSTEM_NAMES[c.system]} #{i + 1}
          </button>
        ))}
      </fieldset>

      {replay && result && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            {SYSTEM_NAMES[replay.system]}, {replay.services} services, {totalLines(replay).toLocaleString()} log lines read.
          </p>
          <Timeline replay={replay} highlight={revealed ? replay.truth : undefined} />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={giveStart} onChange={(e) => setGiveStart(e.target.checked)} />
            Tell ChronoLog when it broke
          </label>
          <h3 className="text-sm font-semibold text-text-secondary">ChronoLog&apos;s guess</h3>
          <ol className="space-y-3">
            {shown.map((cause) => (
              <CandidateCard key={cause.service} cause={cause} highlight={revealed && cause.service === replay.truth} />
            ))}
          </ol>
          {result.candidates.length > SHOWN_AT_FIRST && (
            <button type="button" className="text-sm text-accent-secondary underline" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${result.candidates.length} services`}
            </button>
          )}
          {!revealed ? (
            <button type="button" className="rounded border border-border-dim px-4 py-2 text-sm text-text-primary" onClick={() => setRevealed(true)}>
              Reveal the answer
            </button>
          ) : (
            <div className="card space-y-1" role="status">
              <p className="text-text-primary">
                The broken service was <span className="font-mono font-semibold">{replay.truth}</span>: {faultLabel(replay.fault).toLowerCase()}.
                ChronoLog ranked it {rank === null ? 'nowhere (it wrote no logs)' : `#${rank} of ${replay.services}`}
                {rank === 1 ? ' — a hit.' : rank !== null && rank <= 3 ? ' — in its top 3.' : rank === null ? '.' : ' — a miss.'}
              </p>
              <p className="text-xs text-text-muted">
                Case {replay.caseId}. {bundle.source}. {bundle.modelNote}. Across all 359 RCAEval incidents the top-3 hit rate
                is far from perfect; see the Root Cause view.
              </p>
            </div>
          )}
        </div>
      )}
      {index === null && <p className="text-sm text-text-muted">Pick an incident to see what the logs looked like and what ChronoLog made of them.</p>}
    </div>
  );
}
