import { FAULT_KINDS, FAULTS, type FaultKind, isObservable, randomFault, Rng, SERVICES, type SimService } from '@chronolog/engine';
import { useMemo, useState } from 'react';
import { EMPTY_PLAY, isOver, isSolved, type Play } from '../game';
import GameCase from '../GameCase';
import { simPuzzle } from '../sim';
import { ModeBar } from './common';

const KEY = 'chronolog.sandbox.v1';
interface Tally {
  played: number;
  you: number;
  tock: number;
}
const loadTally = (): Tally => {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Tally | null;
    return t && typeof t.played === 'number' ? t : { played: 0, you: 0, tock: 0 };
  } catch {
    return { played: 0, you: 0, tock: 0 };
  }
};
const newSeed = (): number => Math.floor(Math.random() * 2_147_483_647);

/** Break something yourself: pick a fault and a service (or let it surprise you), then find it. */
export default function Sandbox({ onHome, makeSeed = newSeed }: { onHome: () => void; makeSeed?: () => number }) {
  const [choice, setChoice] = useState<{ service: SimService | 'random'; fault: FaultKind | 'random' }>({ service: 'random', fault: 'random' });
  const [round, setRound] = useState<{ seed: number; service: SimService; fault: FaultKind } | null>(null);
  const [play, setPlay] = useState<Play>(EMPTY_PLAY);
  const [tally, setTally] = useState<Tally>(loadTally);
  const data = useMemo(() => (round ? simPuzzle(round.service, round.fault, round.seed) : null), [round]);

  const breakIt = () => {
    const seed = makeSeed();
    const picked = randomFault(new Rng(seed));
    const service = choice.service === 'random' ? picked.service : choice.service;
    const fault = choice.fault === 'random' ? (isObservable(service, picked.fault) ? picked.fault : 'disk') : choice.fault;
    setRound({ seed, service, fault: isObservable(service, fault) ? fault : 'disk' });
    setPlay(EMPTY_PLAY);
  };
  const onPlay = (p: Play) => {
    setPlay(p);
    if (!data || isOver(play, data.answer) || !isOver(p, data.answer)) return;
    const next = { played: tally.played + 1, you: tally.you + (isSolved(p, data.answer) ? 1 : 0), tock: tally.tock + (data.tockGuess === data.answer ? 1 : 0) };
    setTally(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // not remembered
    }
  };

  return (
    <div className="space-y-4">
      <ModeBar title="SANDBOX" onHome={onHome}>
        <span className="font-pixel text-text-secondary">
          YOU {tally.you} · TOCK {tally.tock} / {tally.played}
        </span>
      </ModeBar>
      <div className="flex flex-wrap items-end gap-4 font-pixel">
        <label className="text-sm text-text-secondary">
          BREAK
          <select className="field mt-1 block font-sans" value={choice.service} onChange={(e) => setChoice({ ...choice, service: e.target.value as SimService | 'random' })}>
            <option value="random">a random service</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-text-secondary">
          WITH
          <select className="field mt-1 block font-sans" value={choice.fault} onChange={(e) => setChoice({ ...choice, fault: e.target.value as FaultKind | 'random' })}>
            <option value="random">a random fault</option>
            {FAULT_KINDS.map((f) => (
              <option key={f} value={f}>
                {FAULTS[f].label} ({FAULTS[f].difficulty})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="px-btn bg-pastel-pink" onClick={breakIt}>
          BREAK SOMETHING!
        </button>
      </div>
      {round && data ? (
        <GameCase
          key={round.seed}
          data={data}
          caseLabel="SANDBOX"
          play={play}
          onPlay={onPlay}
          intro={choice.service === 'random' ? 'Something broke, and I do not know what either. Find it!' : `You broke ${round.service}. Find it the way an on-call engineer would: from the logs alone.`}
          actions={
            <button type="button" className="px-btn bg-pastel-butter" onClick={breakIt}>
              BREAK ANOTHER ▶
            </button>
          }
        />
      ) : (
        <p className="max-w-2xl text-sm text-text-secondary">Choose what to break, or leave both on random and play detective. Simulated logs are easier than real ones.</p>
      )}
    </div>
  );
}
