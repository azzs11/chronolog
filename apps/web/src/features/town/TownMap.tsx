import type { Mood } from '@chronolog/engine';
import Critter from '../../app/critters/Critter';
import { MOOD_LOOK } from '../../app/critters/looks';
import { layoutTown, type Road, TOWN } from './roads';

const CREATURE = 58;
const ROAD_WIDTH = { min: 2, max: 9 } as const;
const DASH: Record<Road['kind'], string | undefined> = { mention: undefined, correlation: '10 6', prior: '2 7' };
const STROKE: Record<Road['kind'], string> = { mention: 'var(--chart-other)', correlation: 'var(--border-dim)', prior: 'var(--text-muted)' };
const OPACITY: Record<Road['kind'], number> = { mention: 0.55, correlation: 1, prior: 0.8 };

interface TownMapProps {
  services: readonly string[];
  roads: readonly Road[];
  moods: Readonly<Record<string, Mood>>;
  /** Marked with a "first sign" flag. */
  firstSign?: string;
  selected?: string;
  /** Accessible summary of what the map shows right now. */
  label: string;
}

/**
 * Services as creatures in a little town, joined by roads: solid for "A names B in its logs",
 * dashed for "their log volumes move together", dotted for the hand-made map. Thicker is surer.
 * The roads are learned from these logs, not the real architecture.
 */
export default function TownMap({ services, roads, moods, firstSign, selected, label }: TownMapProps) {
  const places = layoutTown(services);
  const at = new Map(places.map((p) => [p.name, p]));
  return (
    <svg viewBox={`0 0 ${TOWN.width} ${TOWN.height}`} role="img" aria-label={label} className="h-auto w-full max-w-full">
      <title>{label}</title>
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
      {places.map((p) => {
        const mood = moods[p.name] ?? 'fine';
        const isSelected = p.name === selected;
        return (
          <g key={p.name} transform={`translate(${p.x - CREATURE / 2}, ${p.y - CREATURE / 2 - 8})`}>
            {isSelected && <circle cx={CREATURE / 2} cy={CREATURE / 2} r={CREATURE / 2 + 3} fill="var(--bg-elevated)" stroke="var(--ink)" strokeWidth={2} />}
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
  );
}
