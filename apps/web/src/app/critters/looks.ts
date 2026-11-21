import type { Mood } from '@chronolog/engine';

/** What a creature looks like is decided by its service's name alone, so it never changes between visits. */
export const BODY_COLOURS = ['mint', 'peach', 'butter', 'sky', 'pink', 'lilac'] as const;
export const EARS = ['round', 'cat', 'antenna', 'sprout', 'horns'] as const;
export const BODIES = ['round', 'wide', 'tall'] as const;

export type BodyColour = (typeof BODY_COLOURS)[number];
export type Ears = (typeof EARS)[number] | 'clock';
export type Body = (typeof BODIES)[number];

export interface Look {
  colour: BodyColour;
  ears: Ears;
  body: Body;
}

/** FNV-1a, 32 bit: small, fast and stable across browsers and Node. */
export function hashName(name: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Colour, ears and body shape each come from different bits of the hash, so they vary independently. */
export function lookOf(name: string): Look {
  const h = hashName(name);
  return {
    colour: BODY_COLOURS[h % BODY_COLOURS.length] as BodyColour,
    ears: EARS[(h >>> 8) % EARS.length] as Ears,
    body: BODIES[(h >>> 16) % BODIES.length] as Body,
  };
}

/** The words for each mood, and the pastel used for its chip. */
export const MOOD_LOOK: Record<Mood, { label: string; chip: string }> = {
  fine: { label: 'Fine', chip: 'bg-pastel-mint' },
  'new-phrase': { label: 'New phrase', chip: 'bg-pastel-butter' },
  stressed: { label: 'Stressed', chip: 'bg-pastel-peach' },
  sick: { label: 'Sick', chip: 'bg-pastel-pink' },
  quiet: { label: 'Gone quiet', chip: 'bg-pastel-sky' },
  restarted: { label: 'Restarted', chip: 'bg-pastel-lilac' },
};
