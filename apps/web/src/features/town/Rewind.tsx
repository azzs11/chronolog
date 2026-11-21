import { type RewindTimeline, rewindMoods } from '@chronolog/engine';
import { useEffect, useMemo, useState } from 'react';
import Tock from '../../app/critters/Tock';
import { MOOD_LOOK } from '../../app/critters/looks';

import { defaultRoadOptions, type GraphData, priorRoads, townRoads } from './roads';
import RoadToggles from './RoadToggles';
import TownMap from './TownMap';

/** One 30 s bucket per step while playing. */
const STEP_MS = 450;

/** "2 min 30 s before the burst", "at the start of the burst", "1 min after the burst". */
export function describeOffset(seconds: number, event = 'the burst'): string {
  if (seconds === 0) return `at the start of ${event}`;
  const abs = Math.abs(seconds);
  const min = Math.floor(abs / 60);
  const sec = abs % 60;
  const span = [min > 0 ? `${min} min` : '', sec > 0 ? `${sec} s` : ''].filter(Boolean).join(' ');
  return `${span} ${seconds < 0 ? 'before' : 'after'} ${event}`;
}

/** Tock's sentence about the first sign; services that turned unwell in the same bucket are named as a tie. */
export function firstSignSentence(rewind: ReturnType<typeof rewindMoods>, event = 'the burst'): string {
  const sign = rewind.firstSign;
  if (!sign) return 'No service looked unwell around the start in these counts.';
  const mood = MOOD_LOOK[rewind.frames[sign.bucket]?.[sign.service] ?? 'fine'].label.toLowerCase();
  if (sign.alsoUnwell.length === 0) return `First sign: ${sign.service} looked ${mood} ${describeOffset(sign.seconds, event)}.`;
  const names = [sign.service, ...sign.alsoUnwell];
  const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `First signs: ${list} turned unwell within the same 30 s, ${describeOffset(sign.seconds, event)}. Counts cannot tell which came first.`;
}

interface RewindProps {
  timeline: RewindTimeline;
  graph: GraphData;
  selected?: string;
  /** What time zero is called in sentences: "the burst" in a case file, "the trouble" in a puzzle. */
  event?: string;
  /** What the counts are, for the explanation under Tock's sentence. */
  countsLabel?: string;
}

/**
 * Replay an incident on the town map: drag through time (or press Play) and watch each service's
 * face follow its own line and error counts, 30 s at a time. Faces here come from counts only.
 */
export default function Rewind({ timeline, graph, selected, event = 'the burst', countsLabel = 'line and error counts' }: RewindProps) {
  const rewind = useMemo(() => rewindMoods(timeline), [timeline]);
  const last = Math.max(0, rewind.frames.length - 1);
  const [frame, setFrame] = useState(rewind.firstSign?.bucket ?? last);
  const [isPlaying, setPlaying] = useState(false);
  const [roadOptions, setRoadOptions] = useState(() => defaultRoadOptions(graph));
  const hasPrior = priorRoads(graph.services).length > 0;
  const roads = useMemo(() => townRoads(graph, roadOptions), [graph, roadOptions]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setFrame((f) => {
        if (f >= last) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [isPlaying, last]);

  if (rewind.frames.length === 0) return <p className="text-sm text-text-muted">No timeline to replay.</p>;
  const moods = rewind.frames[frame] ?? {};
  const seconds = rewind.seconds[frame] ?? 0;
  const sign = rewind.firstSign;
  const isSignVisible = sign !== null && frame >= sign.bucket;
  const play = () => {
    if (frame >= last) setFrame(0);
    setPlaying(!isPlaying);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Tock size={44} />
        <p className="rounded-2xl border-2 border-ink bg-bg-surface px-3 py-2 text-sm text-text-primary">
          {firstSignSentence(rewind, event)}{' '}
          <span className="text-text-muted">From per-service {countsLabel}, compared with each service&apos;s own minutes before {event}.</span>
        </p>
      </div>
      <div className="card p-2">
        <TownMap
          services={graph.services.length > 0 ? graph.services : timeline.services.map((s) => s.name)}
          roads={roads}
          moods={moods}
          firstSign={isSignVisible ? sign?.service : undefined}
          selected={selected}
          label={`Town map ${describeOffset(seconds, event)}: ${Object.entries(moods)
            .map(([name, mood]) => `${name} ${MOOD_LOOK[mood].label}`)
            .join(', ')}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-fun" onClick={play}>
          {isPlaying ? 'Pause' : frame >= last ? 'Replay' : 'Play'}
        </button>
        <label htmlFor="rewind-time" className="sr-only">
          Time in the incident
        </label>
        <input
          id="rewind-time"
          type="range"
          min={0}
          max={last}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            setFrame(Number(e.target.value));
          }}
          aria-valuetext={describeOffset(seconds, event)}
          className="min-w-40 flex-1 accent-[var(--accent-solid)]"
        />
        <span className="tabular min-w-44 text-sm text-text-secondary" aria-live="off">
          {describeOffset(seconds, event)}
        </span>
      </div>
      <RoadToggles options={roadOptions} onChange={setRoadOptions} hasPrior={hasPrior} hasCorrelations={graph.correlations.length > 0} />
      <p className="text-xs text-text-muted">Roads are learned from these logs only, not the real architecture.</p>
    </div>
  );
}
