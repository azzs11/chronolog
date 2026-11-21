import { lookOf } from '../../app/critters/looks';
import { type Place, TOWN } from './roads';

const INK = 'var(--on-pastel)';
const HOUSE = 28;
/** Above this many services the town is too crowded for houses; the creatures matter more. */
const MAX_HOUSES = 8;
/** Fixed spots near the edges, clear of the ellipse the services sit on. */
const TREES = [
  [26, 318],
  [534, 318],
  [86, 356],
  [474, 356],
  [26, 70],
  [534, 70],
] as const;
const CLOUDS = [
  [120, 30, 1],
  [430, 26, 0.8],
  [280, 14, 0.6],
] as const;

function Tree({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-3" y="0" width="6" height="14" rx="2" fill="var(--pastel-apricot)" stroke={INK} strokeWidth="1.5" />
      <circle cy="-6" r="13" fill="var(--pastel-seafoam)" stroke={INK} strokeWidth="2" />
      <circle cx="-5" cy="-9" r="3" fill="var(--bg-surface)" opacity="0.6" />
    </g>
  );
}

function Cloud({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity="0.85">
      <path d="M-30 10 Q-32 -4 -18 -4 Q-14 -16 0 -14 Q12 -20 20 -8 Q34 -8 32 10 Z" fill="var(--bg-surface)" stroke={INK} strokeWidth="1.5" strokeOpacity="0.35" />
    </g>
  );
}

/**
 * A small house beside each service, on the outer side (left of creatures on the left, right of those
 * on the right) so it never sits on the roads or the labels below. The roof colour comes from the name.
 */
function House({ place }: { place: Place }) {
  const roof = `var(--pastel-${lookOf(`${place.name}:house`).colour})`;
  const isLeft = place.x < TOWN.width / 2 - 1;
  const x = isLeft ? place.x - 34 - HOUSE : place.x + 30;
  return (
    <g transform={`translate(${x} ${place.y - 40})`}>
      <rect x="0" y={HOUSE * 0.45} width={HOUSE} height={HOUSE * 0.6} rx="3" fill="var(--bg-surface)" stroke={INK} strokeWidth="2" />
      <path d={`M-4 ${HOUSE * 0.5} L${HOUSE / 2} 0 L${HOUSE + 4} ${HOUSE * 0.5} Z`} fill={roof} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x={HOUSE / 2 - 4} y={HOUSE * 0.7} width="8" height={HOUSE * 0.35} rx="1.5" fill={roof} stroke={INK} strokeWidth="1.5" />
    </g>
  );
}

/** Decoration only: the park, trees, clouds and houses. The map is one role="img", so screen readers read its label, not these. */
export default function Scenery({ places }: { places: readonly Place[] }) {
  return (
    <g>
      <ellipse cx={TOWN.width / 2} cy={TOWN.height / 2 + 14} rx={TOWN.width / 2 - 14} ry={TOWN.height / 2 - 22} fill="var(--pastel-mint)" opacity="0.3" />
      {CLOUDS.map(([x, y, s]) => (
        <Cloud key={x} x={x} y={y} scale={s} />
      ))}
      {TREES.map(([x, y]) => (
        <Tree key={`${x}-${y}`} x={x} y={y} />
      ))}
      {places.length <= MAX_HOUSES && places.map((p) => <House key={p.name} place={p} />)}
    </g>
  );
}
