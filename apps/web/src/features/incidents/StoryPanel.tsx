import { useEffect, useState } from 'react';
import Tock from '../../app/critters/Tock';
import { REPORT_CARD } from '../report/reportCard';
import { ApiError, type IncidentStoryText, fetchStoryStatus, writeStory } from './api';
import { CiteChip } from './EvidenceBubbles';

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** How much a model's story survives the checker, from the generated benchmark numbers. */
export function storyCaveat(): string {
  const s = REPORT_CARD.stories;
  return `Written by a local model (${s.model}) from the evidence above only. A checker removes any sentence it cannot tie to cited facts; on ${s.cases} simulated incidents it kept ${pct(s.keptRate)} of sentences.`;
}

type State = { kind: 'idle' } | { kind: 'writing' } | { kind: 'done'; story: IncidentStoryText } | { kind: 'error'; message: string };

/**
 * "Write it up": an optional story, shown only when the server has a story model (off by default).
 * Every sentence shown passed the engine's checker and carries the log ids behind it.
 */
export default function StoryPanel({ incidentId }: { incidentId: string }) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    let isActive = true;
    fetchStoryStatus().then(
      (s) => isActive && setIsEnabled(s.isEnabled),
      () => isActive && setIsEnabled(false),
    );
    return () => {
      isActive = false;
    };
  }, []);

  if (!isEnabled) return null;

  const write = () => {
    setState({ kind: 'writing' });
    writeStory(incidentId).then(
      (story) => setState({ kind: 'done', story }),
      (err: unknown) => setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'Could not write the story.' }),
    );
  };

  return (
    <section aria-label="Case summary" className="space-y-2">
      <h4 className="text-base text-text-primary">Case summary</h4>
      {state.kind !== 'done' && (
        <button type="button" className="btn btn-secondary" onClick={write} disabled={state.kind === 'writing'}>
          {state.kind === 'writing' ? 'Writing…' : 'Write it up'}
        </button>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-sev-warning">
          {state.message}
        </p>
      )}
      {state.kind === 'done' && (
        <div className="card space-y-2">
          <div className="flex items-start gap-2">
            <Tock size={32} decorative />
            {state.story.kept.length === 0 ? (
              <p className="text-sm text-text-secondary">No sentence passed the checker, so there is nothing to show. The evidence above still stands.</p>
            ) : (
              <ul className="space-y-2 text-sm text-text-primary">
                {state.story.kept.map((s) => (
                  <li key={s.text}>
                    {s.text}{' '}
                    {s.logIds.map((id) => (
                      <CiteChip key={id} id={id} />
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {state.story.dropped.length > 0 && (
            <p className="text-xs text-text-muted">
              {state.story.dropped.length} sentence{state.story.dropped.length === 1 ? '' : 's'} removed by the checker (
              {[...new Set(state.story.dropped.map((d) => d.reason.replace(/_/g, ' ')))].join(', ')}).
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-text-muted">{storyCaveat()}</p>
    </section>
  );
}
