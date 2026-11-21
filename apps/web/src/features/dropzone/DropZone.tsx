import { toUnixSeconds } from '@chronolog/engine';
import { useRef, useState } from 'react';
import Tock from '../../app/critters/Tock';
import EvidenceBubbles from '../incidents/EvidenceBubbles';
import SuspectLineup from '../incidents/SuspectLineup';
import { confidenceWord } from '../rootrank/format';
import Rewind from '../town/Rewind';
import { type AnalysisResult, analyseFiles, type LogFile, sampleFiles } from './analyse';

const readFile = (file: File): Promise<LogFile> => file.text().then((text) => ({ name: file.name, text }));

/**
 * Drop your own log files and get a suspect lineup. The files are read and ranked in this browser;
 * nothing is uploaded (there is no request in this view at all).
 */
export default function DropZone() {
  const [files, setFiles] = useState<LogFile[]>([]);
  const [startText, setStartText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [isOver, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = (chosen: LogFile[], start = startText) => {
    setFiles(chosen);
    setBusy(true);
    // Let the page paint "Reading…" before the ranking blocks the thread.
    setTimeout(() => {
      const startSeconds = start.trim() ? (toUnixSeconds(start.trim()) ?? undefined) : undefined;
      const next = analyseFiles(chosen, startSeconds);
      setResult(next);
      setSelected(next.ok ? (next.analysis.ranking.candidates[0]?.service ?? null) : null);
      setBusy(false);
    }, 0);
  };
  const take = async (list: FileList | null) => {
    if (list && list.length > 0) run(await Promise.all([...list].map(readFile)));
  };

  const analysis = result?.ok ? result.analysis : null;
  const top = analysis?.ranking.candidates[0];
  const chosen = analysis?.ranking.candidates.find((c) => c.service === selected);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-3xl text-text-primary">Your logs</h2>
        <p className="text-sm text-text-secondary">Drop log files and get a suspect lineup in seconds. They are read in this browser; nothing is uploaded.</p>
      </header>

      <label
        htmlFor="drop-files"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
        className={`block cursor-pointer rounded-3xl border-[3px] border-dashed border-ink p-8 text-center ${isOver ? 'bg-pastel-butter text-on-pastel' : 'bg-pastel-mint text-on-pastel'}`}
      >
        <span className="font-display text-xl">Drop log files here</span>
        <span className="mt-1 block text-sm">or click to choose. One file per service (plain text with a time on each line), or JSON lines with a service field.</span>
        <input id="drop-files" ref={input} type="file" multiple accept=".log,.txt,.json,.jsonl,.ndjson,text/plain" className="sr-only" onChange={(e) => void take(e.target.files)} />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <button type="button" className="btn btn-fun" onClick={() => run(sampleFiles())}>
          Try a sample incident
        </button>
        <label className="text-sm text-text-secondary" htmlFor="drop-start">
          When did it start? (optional, UTC)
          <input
            id="drop-start"
            className="field mt-1 block w-64"
            placeholder="2026-11-21T14:02:00Z"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={() => files.length > 0 && run(files)}
          />
        </label>
      </div>

      {isBusy && <p className="text-sm text-text-muted">Reading {files.length} files…</p>}
      {result && !result.ok && (
        <p role="alert" className="card text-sm text-text-primary">
          {result.message}
        </p>
      )}
      {analysis && top && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Tock size={48} />
            <p className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-sm text-text-primary">
              I read {analysis.lines.toLocaleString('en-US')} lines from {analysis.services.length} services
              {analysis.skipped > 0 ? ` (${analysis.skipped} lines had no time and were skipped)` : ''}. My best guess is{' '}
              <span className="font-mono font-bold">{top.service}</span> ({confidenceWord(top.weight, top.rank)}, {top.weight.toFixed(2)}). The start was{' '}
              {analysis.ranking.startSource === 'given' ? 'the time you gave' : 'estimated from the logs; give it above if you know it'}.
            </p>
          </div>
          <section aria-label="Candidates" className="space-y-2">
            <SuspectLineup candidates={analysis.ranking.candidates} selected={selected} onSelect={setSelected} />
          </section>
          {chosen && (
            <section aria-label={`Evidence for ${chosen.service}`} className="space-y-2">
              <h3 className="text-base text-text-primary">Evidence for {chosen.service}</h3>
              <EvidenceBubbles cause={chosen} />
            </section>
          )}
          <section aria-label="Rewind" className="space-y-2">
            <h3 className="text-base text-text-primary">Rewind</h3>
            <Rewind timeline={analysis.timeline} graph={analysis.graph} selected={selected ?? undefined} event="the incident" countsLabel="line counts and warning-or-error counts" />
          </section>
          <p className="text-xs text-text-muted">RootRank finds the right service in its top 3 in about half of real incidents it never trained on (see the Report card). Treat this as a lead, not a verdict.</p>
        </div>
      )}
    </div>
  );
}
