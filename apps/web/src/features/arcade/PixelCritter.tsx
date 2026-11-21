import type { Mood } from '@chronolog/engine';
import { useEffect, useRef, useState } from 'react';
import Critter from '../../app/critters/Critter';
import type { Look } from '../../app/critters/looks';
import { pixelSprite, svgImage } from '../../app/critters/raster';
import { useThemeVersion } from './useThemeVersion';

/** The sprite is drawn this many pixels wide, then blown up: that is where the pixels come from. */
const SPRITE_PX = 26;

/**
 * A creature as a pixel sprite: the same creature as everywhere else in ChronoLog, drawn tiny and
 * scaled up without smoothing. Where canvas is unavailable it shows the normal drawing instead.
 */
export default function PixelCritter({ name, mood, size = 56, look }: { name: string; mood: Mood; size?: number; look?: Look }) {
  const source = useRef<HTMLSpanElement>(null);
  const target = useRef<HTMLCanvasElement>(null);
  const [isPixel, setPixel] = useState(true);
  const theme = useThemeVersion();

  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw when the look, the mood or the theme changes
  useEffect(() => {
    const markup = source.current?.innerHTML;
    const canvas = target.current;
    if (!markup || !canvas?.getContext('2d')) {
      setPixel(false);
      return;
    }
    let isLive = true;
    svgImage(markup).then(
      (img) => {
        const sprite = pixelSprite(img, SPRITE_PX);
        const ctx = canvas.getContext('2d');
        if (!isLive || !sprite || !ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
      },
      () => isLive && setPixel(false),
    );
    return () => {
      isLive = false;
    };
  }, [name, mood, theme]);

  return (
    <span className="relative inline-block" style={{ width: size, height: size }} aria-hidden="true">
      <span ref={source} className={isPixel ? 'hidden' : 'block'}>
        <Critter name={name} mood={mood} size={size} look={look} decorative />
      </span>
      {isPixel && <canvas ref={target} width={SPRITE_PX * 4} height={SPRITE_PX * 4} className="pixelated block h-full w-full" />}
    </span>
  );
}
