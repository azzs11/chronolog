import type { Mood } from '@chronolog/engine';
import { useRef } from 'react';
import type { ClueRow } from '../puzzle/types';
import type { Road } from '../town/roads';
import { arcadeLayout } from './game';
import PixelCritter from './PixelCritter';

const BUBBLE_CHARS = 26;

interface SceneProps {
  services: readonly string[];
  roads: readonly Road[];
  moods: Readonly<Record<string, Mood>>;
  clues: readonly ClueRow[];
  showSaid: boolean;
  showTalk: boolean;
  guesses: readonly string[];
  selected: string;
  answer: string | null;
  onSelect: (service: string) => void;
}

const said = (row: ClueRow | undefined): string => {
  const text = row?.examples[0];
  if (!text) return 'nothing new';
  return `"${text.length > BUBBLE_CHARS ? `${text.slice(0, BUBBLE_CHARS - 1)}…` : text}"`;
};

/**
 * The town: grass tiles, dirt paths along the learned "names" roads, and every service as a pixel
 * creature that is also a button. Arrow keys move between creatures; clicking a creature twice (or
 * pressing ACCUSE) names it. Clues draw straight onto the scene: speech bubbles and name counters.
 */
export default function Scene({ services, roads, moods, clues, showSaid, showTalk, guesses, selected, answer, onSelect }: SceneProps) {
  const layout = arcadeLayout(services, roads);
  const at = new Map(layout.places.map((p) => [p.name, p]));
  const byService = new Map(clues.map((c) => [c.service, c]));
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const sprite = layout.isGrid ? 40 : 56;
  const order = layout.places.map((p) => p.name);

  const move = (from: string, step: number) => {
    const next = order[(order.indexOf(from) + step + order.length) % order.length] as string;
    onSelect(next);
    buttons.current.get(next)?.focus();
  };

  return (
    <div className="arcade-grass relative mx-auto w-full" style={{ aspectRatio: `${layout.width} / ${layout.height}`, maxHeight: 620 }}>
      {!layout.isGrid && (
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="absolute inset-0 h-full w-full" aria-hidden="true" shapeRendering="crispEdges">
          {roads
            .filter((r) => r.kind === 'mention')
            .map((r) => {
              const a = at.get(r.a);
              const b = at.get(r.b);
              return a && b ? <line key={`${r.a}-${r.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--arcade-path)" strokeWidth="12" strokeDasharray="12 4" /> : null;
            })}
        </svg>
      )}
      <ul aria-label="Suspects">
        {layout.places.map((p) => {
          const isWrong = guesses.includes(p.name) && p.name !== answer;
          const isCulprit = answer !== null && p.name === answer;
          const mood = isCulprit ? 'sick' : (moods[p.name] ?? 'fine');
          const row = byService.get(p.name);
          const left = `${(p.x / layout.width) * 100}%`;
          const top = `${(p.y / layout.height) * 100}%`;
          const extra = [showSaid ? `said ${said(row)}` : '', showTalk ? `named ${row?.mentions ?? 0} times` : '', isWrong ? 'not the culprit' : ''].filter(Boolean).join(', ');
          return (
            <li key={p.name} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left, top }}>
              {showSaid && (
                <span className={`absolute -top-9 left-1/2 w-max max-w-[11rem] -translate-x-1/2 truncate px-1.5 py-0.5 text-xs shadow-[0_0_0_2px_var(--arcade-frame)] ${row?.examples[0] ? 'bg-pastel-butter' : 'bg-pastel-sky'} text-[color:var(--arcade-frame)]`} aria-hidden="true">
                  {said(row)}
                </span>
              )}
              <button
                ref={(el) => {
                  if (el) buttons.current.set(p.name, el);
                }}
                type="button"
                tabIndex={p.name === selected ? 0 : -1}
                aria-pressed={p.name === selected}
                aria-label={`${p.name}, looks ${mood}${extra ? `, ${extra}` : ''}`}
                onClick={() => onSelect(p.name)}
                onKeyDown={(e) => {
                  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                  if (step === undefined) return;
                  e.preventDefault();
                  move(p.name, step);
                }}
                className={`flex flex-col items-center gap-0.5 px-1 pt-1 text-center ${isWrong ? 'opacity-50' : ''} ${
                  p.name === selected && answer === null ? 'outline-dashed outline-[3px] outline-offset-2 outline-[color:var(--arcade-gold)]' : ''
                } ${isCulprit ? 'bg-[color:var(--arcade-gold)]/30 shadow-[0_0_0_3px_var(--arcade-gold)]' : ''}`}
              >
                <PixelCritter name={p.name} mood={mood} size={sprite} />
                <span className="max-w-[7rem] truncate bg-[color:var(--arcade-deep)]/70 px-1 text-sm leading-tight">{p.name}</span>
                {isWrong && <span className="text-xs text-[color:var(--arcade-heart)]">✗ NOT ME</span>}
              </button>
              {showTalk && (
                <span className={`absolute -right-6 top-1/3 px-1 text-xs shadow-[0_0_0_2px_var(--arcade-frame)] text-[color:var(--arcade-frame)] ${(row?.mentions ?? 0) > 0 ? 'bg-pastel-pink' : 'bg-[color:var(--arcade-text)]'}`} aria-hidden="true">
                  ×{row?.mentions ?? 0}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
