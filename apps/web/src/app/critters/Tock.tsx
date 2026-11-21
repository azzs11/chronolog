import type { Mood } from '@chronolog/engine';
import Critter from './Critter';
import type { Look } from './looks';

/** Tock, the case keeper: a lilac creature with clock hands on its head. It explains, it never decides. */
export const TOCK_LOOK: Look = { colour: 'lilac', ears: 'clock', body: 'round', accessory: 'none' };

export default function Tock({ size = 56, mood = 'fine', decorative = true }: { size?: number; mood?: Mood; decorative?: boolean }) {
  return <Critter name="Tock" mood={mood} size={size} look={TOCK_LOOK} decorative={decorative} />;
}
