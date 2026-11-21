/** Turning a creature's SVG into pixels: for postcards (big) and the Arcade's pixel sprites (tiny). */

/** An SVG drawn as an image cannot see the page's CSS variables, so their values are written in. */
export function resolveVars(markup: string, read: (name: string) => string): string {
  return markup.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => read(name).trim() || read('--ink').trim());
}

/** The markup as a standalone SVG image, with the current theme's colours resolved. */
export function svgImage(markup: string): Promise<HTMLImageElement> {
  const css = getComputedStyle(document.documentElement);
  const svg = resolveVars(markup, (n) => css.getPropertyValue(n)).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** Alpha above this becomes solid, below it clear: crisp pixel edges with no soft halo. */
const ALPHA_CUT = 110;

/** Draw the image into a tiny square and harden its edges: the sprite's pixels. Null if canvas is unavailable. */
export function pixelSprite(img: HTMLImageElement, size: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < data.data.length; i += 4) data.data[i] = (data.data[i] as number) > ALPHA_CUT ? 255 : 0;
  ctx.putImageData(data, 0, 0);
  return canvas;
}
