import type { Mood } from '@chronolog/engine';
import type { ReactNode } from 'react';
import { type Accessory, type Body, type BodyColour, type Ears, type Look, lookOf, MOOD_LOOK } from './looks';

/*
 * A small original creature drawn from circles and curves in a 100 x 100 box. Its face is its
 * service's mood (computed by the engine's serviceMoods, never chosen for effect). All colours are
 * theme tokens; the outline is always the dark plum used for text on pastel.
 */

const INK = 'var(--on-pastel)';
const STROKE = 3.5;

const fillOf = (colour: BodyColour): string => `var(--pastel-${colour})`;

const BODY_PATH: Record<Body, string> = {
  round: 'M14 60 Q14 22 50 22 Q86 22 86 60 Q86 88 50 88 Q14 88 14 60Z',
  wide: 'M8 62 Q8 28 50 28 Q92 28 92 62 Q92 88 50 88 Q8 88 8 62Z',
  tall: 'M20 58 Q20 16 50 16 Q80 16 80 58 Q80 90 50 90 Q20 90 20 58Z',
  pear: 'M24 60 Q22 26 50 24 Q78 26 76 60 Q88 90 50 90 Q12 90 24 60Z',
  ghost: 'M16 56 Q16 20 50 20 Q84 20 84 56 V84 Q76 78 67 84 Q58 90 50 84 Q42 78 33 84 Q24 90 16 84Z',
};

function earsSvg(ears: Ears, fill: string): ReactNode {
  switch (ears) {
    case 'round':
      return (
        <>
          <circle cx="26" cy="28" r="9" fill={fill} stroke={INK} strokeWidth={STROKE} />
          <circle cx="74" cy="28" r="9" fill={fill} stroke={INK} strokeWidth={STROKE} />
        </>
      );
    case 'cat':
      return <path d="M22 34 L25 10 L40 26 Z M78 34 L75 10 L60 26 Z" fill={fill} stroke={INK} strokeWidth={STROKE} strokeLinejoin="round" />;
    case 'antenna':
      return (
        <>
          <path d="M50 22 Q52 9 61 6" fill="none" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" />
          <circle cx="62" cy="6" r="5" fill="var(--accent-solid)" stroke={INK} strokeWidth={2.5} />
        </>
      );
    case 'sprout':
      return (
        <>
          <path d="M50 22 V11" stroke={INK} strokeWidth={STROKE} />
          <path d="M50 12 Q40 2 35 10 Q44 15 50 12 Z M50 12 Q60 2 65 10 Q56 15 50 12 Z" fill="var(--pastel-mint)" stroke={INK} strokeWidth={2.5} />
        </>
      );
    case 'horns':
      return <path d="M30 28 Q24 14 32 8 Q34 18 40 24 Z M70 28 Q76 14 68 8 Q66 18 60 24 Z" fill="var(--pastel-butter)" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />;
    case 'bunny':
      return (
        <>
          <ellipse cx="36" cy="14" rx="7" ry="16" fill={fill} stroke={INK} strokeWidth={STROKE} />
          <ellipse cx="64" cy="14" rx="7" ry="16" fill={fill} stroke={INK} strokeWidth={STROKE} />
          <ellipse cx="36" cy="15" rx="3" ry="10" fill="var(--pastel-pink)" />
          <ellipse cx="64" cy="15" rx="3" ry="10" fill="var(--pastel-pink)" />
        </>
      );
    case 'propeller':
      return (
        <>
          <path d="M50 22 V10" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" />
          <ellipse cx="41" cy="9" rx="9" ry="3.5" fill="var(--pastel-sky)" stroke={INK} strokeWidth={2} />
          <ellipse cx="59" cy="9" rx="9" ry="3.5" fill="var(--pastel-pink)" stroke={INK} strokeWidth={2} />
        </>
      );
    case 'star':
      return (
        <>
          <path d="M50 22 Q48 14 52 9" fill="none" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" />
          <path d="M53 0 l2.6 5.4 5.9 0.8 -4.3 4.1 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.3 -4.1 5.9 -0.8z" fill="var(--pastel-butter)" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
        </>
      );
    case 'clock':
      return (
        <>
          <path d="M50 22 V6 M50 22 L61 13" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <circle cx="50" cy="6" r="3.5" fill="var(--accent-solid)" stroke={INK} strokeWidth={2} />
        </>
      );
  }
}

/** Extras that give each creature a bit more character. Drawn under the face, except glasses. */
function accessoryUnder(accessory: Accessory): ReactNode {
  switch (accessory) {
    case 'bowtie':
      return <path d="M50 84 L40 78 L40 90 Z M50 84 L60 78 L60 90 Z" fill="var(--accent-solid)" stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
    case 'scarf':
      return <path d="M22 74 Q50 84 78 74 L78 81 Q50 91 22 81 Z" fill="var(--pastel-lilac)" stroke={INK} strokeWidth={2} strokeLinejoin="round" />;
    case 'flower':
      return (
        <g transform="translate(27 30)">
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={5 * Math.cos((a * Math.PI) / 180)} cy={5 * Math.sin((a * Math.PI) / 180)} r="3.6" fill="var(--bg-surface)" stroke={INK} strokeWidth={1.2} />
          ))}
          <circle r="2.8" fill="var(--pastel-butter)" stroke={INK} strokeWidth={1.2} />
        </g>
      );
    case 'freckles':
      return (
        <g fill={INK} opacity="0.45">
          <circle cx="26" cy="60" r="1.2" />
          <circle cx="30" cy="63" r="1.2" />
          <circle cx="25" cy="65" r="1.2" />
          <circle cx="74" cy="60" r="1.2" />
          <circle cx="70" cy="63" r="1.2" />
          <circle cx="75" cy="65" r="1.2" />
        </g>
      );
    default:
      return null;
  }
}

const GLASSES = (
  <g fill="none" stroke={INK} strokeWidth={2.4}>
    <circle cx="38" cy="54" r="9" />
    <circle cx="62" cy="54" r="9" />
    <path d="M47 53 Q50 50 53 53" />
  </g>
);

const EYES_OPEN = (
  <>
    <ellipse cx="38" cy="54" rx="4.5" ry="6" fill={INK} />
    <ellipse cx="62" cy="54" rx="4.5" ry="6" fill={INK} />
    <circle cx="39.5" cy="51.5" r="1.6" fill="var(--bg-surface)" />
    <circle cx="63.5" cy="51.5" r="1.6" fill="var(--bg-surface)" />
  </>
);
const line = (d: string, width = 3.2): ReactNode => <path d={d} fill="none" stroke={INK} strokeWidth={width} strokeLinecap="round" />;

/** Eyes, mouth and any extra mark (sparkle, sweat drop, zzz, stars) for each mood. */
function face(mood: Mood): ReactNode {
  switch (mood) {
    case 'fine':
      return (
        <>
          {line('M33 56 Q38 49 43 56 M57 56 Q62 49 67 56')}
          {line('M44 66 Q50 72 56 66', 3)}
        </>
      );
    case 'new-phrase':
      return (
        <>
          {EYES_OPEN}
          <ellipse cx="50" cy="68" rx="4" ry="5" fill={INK} />
          <path d="M86 20 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="var(--pastel-butter)" stroke={INK} strokeWidth={2} />
        </>
      );
    case 'stressed':
      return (
        <>
          {EYES_OPEN}
          {line('M43 69 Q50 64 57 69', 3)}
          <path d="M80 36 Q86 46 80 51 Q74 46 80 36Z" fill="var(--pastel-sky)" stroke={INK} strokeWidth={2} />
        </>
      );
    case 'sick':
      return (
        <>
          {line('M33 52 L43 56 M57 56 L67 52')}
          {line('M40 69 q5 -5 10 0 t10 0', 3)}
        </>
      );
    case 'quiet':
      return (
        <>
          {line('M33 55 H43 M57 55 H67')}
          <circle cx="50" cy="67" r="3" fill={INK} />
          <text x="78" y="26" fontFamily="var(--font-display)" fontSize="15" fill={INK}>
            z
          </text>
          <text x="88" y="15" fontFamily="var(--font-display)" fontSize="11" fill={INK}>
            z
          </text>
        </>
      );
    case 'restarted':
      return (
        <>
          {line('M34 50 l8 8 m0 -8 l-8 8 M58 50 l8 8 m0 -8 l-8 8')}
          <ellipse cx="50" cy="69" rx="6" ry="3.5" fill={INK} />
          <circle cx="28" cy="12" r="3" fill="var(--pastel-butter)" stroke={INK} strokeWidth={1.5} />
          <circle cx="72" cy="10" r="3" fill="var(--pastel-butter)" stroke={INK} strokeWidth={1.5} />
        </>
      );
  }
}

export interface CritterProps {
  /** The service name: it decides the creature's look. */
  name: string;
  mood: Mood;
  size?: number;
  /** Override the look (Tock uses this). */
  look?: Look;
  /** When the name and mood are written next to the creature, hide it from screen readers. */
  decorative?: boolean;
  className?: string;
}

export default function Critter({ name, mood, size = 56, look, decorative = false, className = '' }: CritterProps) {
  const { colour, ears, body, accessory } = look ?? lookOf(name);
  const fill = mood === 'sick' ? `color-mix(in srgb, ${fillOf(colour)} 45%, var(--pastel-mint))` : fillOf(colour);
  const hasBlush = mood === 'fine' || mood === 'new-phrase' || mood === 'stressed';
  const label = `${name}: ${MOOD_LOOK[mood].label}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 overflow-visible ${mood === 'quiet' ? '' : 'motion-safe:animate-bob'} ${className}`.trim()}
      data-mood={mood}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      {!decorative && <title>{label}</title>}
      {earsSvg(ears, fill)}
      <path d={BODY_PATH[body]} fill={fill} stroke={INK} strokeWidth={STROKE} />
      {hasBlush && (
        <g fill="var(--accent-solid)" opacity="0.5">
          <ellipse cx="28" cy="64" rx="5" ry="3" />
          <ellipse cx="72" cy="64" rx="5" ry="3" />
        </g>
      )}
      {accessoryUnder(accessory)}
      {face(mood)}
      {accessory === 'glasses' && GLASSES}
    </svg>
  );
}
