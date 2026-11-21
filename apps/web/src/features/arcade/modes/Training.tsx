import { useMemo } from 'react';
import { EMPTY_PLAY, starsFor } from '../game';
import GameCase from '../GameCase';
import { simPuzzle } from '../sim';
import { usePlays } from '../store';
import { APP_PLACES, STAGES } from '../training';
import { AppLink, ModeBar } from './common';

export const TRAINING_KEY = 'chronolog.training.v1';

/** Training Town: the three teaching stages, one at a time, each ending in the matching place in the app. */
export default function Training({ stage, onStage, onHome, onOpenApp }: { stage: number; onStage: (i: number) => void; onHome: () => void; onOpenApp?: (path: string) => void }) {
  const current = STAGES[stage] ?? STAGES[0];
  const [plays, save] = usePlays(TRAINING_KEY);
  // biome-ignore lint/correctness/useExhaustiveDependencies: one puzzle per stage
  const data = useMemo(() => (current ? simPuzzle(current.service, current.fault, current.seed) : null), [current?.id]);
  if (!current || !data) return null;
  const play = plays[current.id] ?? EMPTY_PLAY;
  const place = APP_PLACES[current.place];
  const total = STAGES.reduce((n, s) => n + starsFor(plays[s.id] ?? EMPTY_PLAY, s.service), 0);
  return (
    <div className="space-y-4">
      <ModeBar title={`TRAINING TOWN · ${current.id} ${current.title.toUpperCase()}`} onHome={onHome}>
        <span className="font-pixel text-text-secondary">
          ★ {total} / {STAGES.length * 3}
        </span>
      </ModeBar>
      <GameCase
        key={current.id}
        data={data}
        caseLabel={current.id}
        play={play}
        onPlay={(p) => save(current.id, p)}
        intro={current.intro}
        lesson={current.lesson}
        actions={
          <>
            {stage + 1 < STAGES.length ? (
              <button type="button" className="px-btn bg-pastel-butter" onClick={() => onStage(stage + 1)}>
                NEXT STAGE ▶
              </button>
            ) : (
              <button type="button" className="px-btn bg-pastel-butter" onClick={onHome}>
                TRAINING DONE ▶ MAP
              </button>
            )}
            <AppLink path={place.path} label={place.label} onOpenApp={onOpenApp} />
          </>
        }
      />
    </div>
  );
}
