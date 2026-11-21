import type { Mood } from '@chronolog/engine';

/** Everything a postcard shows. Built by pure functions (tested); drawn by draw.ts. */
export interface PostcardSpec {
  eyebrow: string;
  title: string;
  lines: string[];
  critters: Array<{ name: string; mood: Mood; caption: string; isHighlighted: boolean }>;
  /** Big stamp text, or null. */
  stamp: string | null;
  footer: string;
}

export const POSTCARD_URL = 'chronolog.akchhya.xyz';
