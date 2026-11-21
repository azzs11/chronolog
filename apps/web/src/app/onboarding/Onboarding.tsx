import type { Mood } from '@chronolog/engine';
import { useState } from 'react';
import Critter from '../critters/Critter';
import { MOOD_LOOK } from '../critters/looks';
import Tock from '../critters/Tock';

const STORAGE_KEY = 'chronolog.onboarded.v1';

/** Shown once per browser; `?intro=off` skips it (screenshots, audits). */
export function shouldShowIntro(): boolean {
  if (new URLSearchParams(window.location.search).get('intro') === 'off') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false; // no storage: do not nag on every visit
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'yes');
  } catch {
    // fine: it will simply not be remembered
  }
}

const FACES: Array<{ name: string; mood: Mood }> = [
  { name: 'cart', mood: 'fine' },
  { name: 'catalog', mood: 'new-phrase' },
  { name: 'db', mood: 'sick' },
];

const STEPS = [
  {
    title: 'Hi, I am Tock',
    body: 'Every service in your system is a little creature here. Its face shows what its logs look like right now, and every face has a measured reason behind it.',
  },
  {
    title: 'When something breaks',
    body: 'I rank the suspects and show the log lines behind every claim. I am right about half the time on real incidents, so I show my work and my report card.',
  },
  { title: 'Learn by playing', body: 'Training Town is three short cases. In a few minutes you will read ChronoLog like an on-call engineer, and see where I get fooled.' },
] as const;

/** Three short steps into Training Town. Skippable at any point; Escape closes it. */
export default function Onboarding({ onFinish }: { onFinish: (play: boolean) => void }) {
  const [step, setStep] = useState(0);
  const done = (play: boolean) => {
    markIntroSeen();
    onFinish(play);
  };
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step] as (typeof STEPS)[number];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        className="card w-full max-w-md space-y-4 text-center"
        onKeyDown={(e) => e.key === 'Escape' && done(false)}
      >
        <div className="flex justify-center">
          <Tock size={88} />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id="intro-title" className="text-2xl text-text-primary">
          {current.title}
        </h2>
        <p className="text-sm text-text-secondary">{current.body}</p>
        {step === 0 && (
          <ul className="flex justify-center gap-4" aria-label="Example faces">
            {FACES.map((f) => (
              <li key={f.name} className="flex flex-col items-center gap-1 text-xs font-bold">
                <Critter name={f.name} mood={f.mood} size={48} decorative />
                {MOOD_LOOK[f.mood].label}
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => done(false)}>
            Skip
          </button>
          {/* Keyed by step so it re-mounts and takes focus on every step. */}
          <button key={step} ref={(el) => el?.focus()} type="button" className="btn btn-primary" onClick={() => (isLast ? done(true) : setStep(step + 1))}>
            {isLast ? 'Start training' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
