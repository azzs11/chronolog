import type { Mood } from '@chronolog/engine';
import Critter from '../../app/critters/Critter';
import { MOOD_LOOK } from '../../app/critters/looks';
import { layoutTown } from './layout';
import type { Road } from './roads';
import Scenery from './Scenery';

const CREATURE = 58;
const ROAD_WIDTH = { min: 2, max: 9 } as const;
const DASH: Record<Road['kind'], string | undefined> = { mention: undefined, correlation: '10 6', prior: '2 7' };
const STROKE: Record<Road['kind'], string> = { mention: 'var(--chart-other)', correlation: 'var(--border-dim)', prior: 'var(--text-muted)' };
const OPACITY: Record<Road['kind'], number> = { mention: 0.55, correlation: 1, prior: 0.8 };
/** Where along a road the "trouble went this way" arrow sits (0 = start, 1 = end). */
const ARROW_AT = 0.62;
const PULSE_SECONDS = 0.7;
/** Shown up to this much larger than the drawing's own size, and never taller than MAX_HEIGHT_PX. */
const SCALE_UP = 1.4;

export interface SpreadMark {
  from: string;
  to: string;
  /** Just happened in this frame: animate a pulse along the road. */
  isNew: boolean;
}

interface TownMapProps {
  services: readonly string[];
  roads: readonly Road[];
  moods: Readonly<Record<string, Mood>>;
  /** Marked with a "first sign" flag. */
  firstSign?: string;
  selected?: string;
  /** Trouble that moved along a road, in time order (Rewind only). */
  spread?: readonly SpreadMark[];
  /** Accessible summary of what the map shows right now. */
  label: string;
}

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Services as creatures in a little town, joined by roads: solid for "A names B in its logs",
 * dashed for "their log volumes move together", dotted for the hand-made map. Thicker is surer.
 * With "names" roads the town reads left to right, callers first. The roads are learned from these
 * logs, not the real architecture.
 */
export default function TownMap({ services, roads, moods, firstSign, selected, spread = [], label }: TownMapProps) {
  const layout = layoutTown(services, roads);
  const at = new Map(layout.places.map((p) => [p.name, p]));
  const isStill = prefersReducedMotion();
  return (
    <figure className="m-0 space-y-1">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width * SCALE_UP}
        height={layout.height * SCALE_UP}
        role="img"
        aria-label={label}
        className="mx-auto block h-auto max-h-[600px] w-auto max-w-full"
      >
        <title>{label}</title>
        <Scenery places={layout.places} width={layout.width} height={layout.height} />
        {roads.map((road) => {
          const a = at.get(road.a);
          const b = at.get(road.b);
          if (!a || !b) return null;
          return (
            <line
              key={`${road.kind}-${road.a}-${road.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={STROKE[road.kind]}
              strokeOpacity={OPACITY[road.kind]}
              strokeWidth={ROAD_WIDTH.min + road.strength * (ROAD_WIDTH.max - ROAD_WIDTH.min)}
              strokeDasharray={DASH[road.kind]}
              strokeLinecap="round"
            >
              <title>{road.label}</title>
            </line>
          );
        })}
        {spread.map((s) => {
          const a = at.get(s.from);
          const b = at.get(s.to);
          if (!a || !b) return null;
          const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          const mx = a.x + (b.x - a.x) * ARROW_AT;
          const my = a.y + (b.y - a.y) * ARROW_AT;
          return (
            <g key={`spread-${s.from}-${s.to}`}>
              <path d="M-9 -7 L7 0 L-9 7 Z" transform={`translate(${mx} ${my}) rotate(${angle})`} fill="var(--accent-solid)" stroke="var(--on-pastel)" strokeWidth="1.5" />
              {s.isNew && !isStill && (
                <circle r="7" cx={b.x} cy={b.y} fill="var(--accent-solid)" stroke="var(--on-pastel)" strokeWidth="1.5" opacity="0.9">
                  <animate attributeName="cx" from={a.x} to={b.x} dur={`${PULSE_SECONDS}s`} fill="freeze" />
                  <animate attributeName="cy" from={a.y} to={b.y} dur={`${PULSE_SECONDS}s`} fill="freeze" />
                  <animate attributeName="opacity" values="0.95;0.95;0" keyTimes="0;0.8;1" dur={`${PULSE_SECONDS}s`} fill="freeze" />
                </circle>
              )}
            </g>
          );
        })}
        {layout.places.map((p) => {
          const mood = moods[p.name] ?? 'fine';
          return (
            <g key={p.name} transform={`translate(${p.x - CREATURE / 2}, ${p.y - CREATURE / 2 - 8})`}>
              {p.name === selected && <circle cx={CREATURE / 2} cy={CREATURE / 2} r={CREATURE / 2 + 3} fill="var(--bg-elevated)" stroke="var(--ink)" strokeWidth={2} />}
              <Critter name={p.name} mood={mood} size={CREATURE} decorative />
              <text x={CREATURE / 2} y={CREATURE + 17} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text-primary)">
                {p.name}
              </text>
              <text x={CREATURE / 2} y={CREATURE + 33} textAnchor="middle" fontSize="13" fill="var(--text-secondary)">
                {MOOD_LOOK[mood].label}
              </text>
              {p.name === firstSign && (
                <g transform={`translate(${CREATURE / 2 - 34}, -24)`}>
                  <rect width="68" height="20" rx="10" fill="var(--pastel-butter)" stroke="var(--on-pastel)" strokeWidth="1.5" />
                  <text x="34" y="14" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--on-pastel)">
                    first sign
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="px-2 text-xs text-text-muted">
        {layout.kind === 'columns'
          ? 'Left to right: services, then the services their logs name (what they call). Learned from the logs.'
          : 'These logs never name other services, so there is no direction to show: services sit in a ring by name.'}
      </figcaption>
    </figure>
  );
}
