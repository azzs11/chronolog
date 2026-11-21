import { createElement, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import Critter from '../critters/Critter';
import Tock from '../critters/Tock';
import type { PostcardSpec } from './spec';

/** Open Graph size, so the image previews well wherever the link or file is posted. */
export const POSTCARD = { width: 1200, height: 630 } as const;
const PAD = 56;
const CRITTER = 120;

/** Markup of a small element, rendered with the React DOM already on the page (no server renderer needed). */
function markupOf(element: ReactElement): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(element));
  const html = host.innerHTML;
  root.unmount();
  return html;
}

/** An SVG drawn as an image cannot see the page's CSS variables, so their values are written in. */
export function resolveVars(markup: string, read: (name: string) => string): string {
  return markup.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => read(name).trim() || read('--ink').trim());
}

function svgImage(markup: string): Promise<HTMLImageElement> {
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

const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Draws the postcard and returns it as a PNG. */
export async function drawPostcard(spec: PostcardSpec): Promise<Blob> {
  await document.fonts?.load('40px "Mochiy Pop One"').catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = POSTCARD.width;
  canvas.height = POSTCARD.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  const display = '"Mochiy Pop One", "Arial Rounded MT Bold", sans-serif';
  const body = '"Nunito Variable", system-ui, sans-serif';

  ctx.fillStyle = token('--bg-base');
  ctx.fillRect(0, 0, POSTCARD.width, POSTCARD.height);
  ctx.fillStyle = token('--dot-grid');
  for (let x = 11; x < POSTCARD.width; x += 22) for (let y = 11; y < POSTCARD.height; y += 22) ctx.fillRect(x, y, 2.4, 2.4);

  ctx.fillStyle = token('--text-secondary');
  ctx.font = `800 24px ${body}`;
  ctx.fillText(spec.eyebrow.toUpperCase(), PAD + 110, PAD + 30);
  ctx.fillStyle = token('--text-primary');
  ctx.font = `48px ${display}`;
  ctx.fillText(spec.title, PAD + 110, PAD + 86);
  ctx.font = `600 28px ${body}`;
  for (const [i, line] of spec.lines.entries()) ctx.fillText(line, PAD, PAD + 160 + i * 40);

  ctx.drawImage(await svgImage(markupOf(createElement(Tock, { size: 96 }))), PAD, PAD);
  const startX = PAD;
  const y = POSTCARD.height - PAD - CRITTER - 50;
  for (const [i, c] of spec.critters.entries()) {
    const x = startX + i * (CRITTER + 40);
    if (c.isHighlighted) {
      ctx.fillStyle = token('--pastel-butter');
      ctx.strokeStyle = token('--ink');
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(x - 12, y - 12, CRITTER + 24, CRITTER + 70, 24);
      ctx.fill();
      ctx.stroke();
    }
    ctx.drawImage(await svgImage(markupOf(createElement(Critter, { name: c.name, mood: c.mood, size: CRITTER, decorative: true }))), x, y);
    ctx.fillStyle = token(c.isHighlighted ? '--on-pastel' : '--text-primary');
    ctx.font = `800 22px ${body}`;
    ctx.textAlign = 'center';
    ctx.fillText(c.caption, x + CRITTER / 2, y + CRITTER + 36);
    ctx.textAlign = 'left';
  }

  if (spec.stamp) {
    ctx.save();
    ctx.translate(POSTCARD.width - PAD - 220, PAD + 90);
    ctx.rotate(-0.12);
    ctx.strokeStyle = token('--accent');
    ctx.fillStyle = token('--accent');
    ctx.lineWidth = 6;
    ctx.font = `40px ${display}`;
    const w = ctx.measureText(spec.stamp).width + 48;
    ctx.strokeRect(-w / 2, -40, w, 72);
    ctx.textAlign = 'center';
    ctx.fillText(spec.stamp, 0, 12);
    ctx.restore();
  }

  ctx.fillStyle = token('--text-muted');
  ctx.font = `700 22px ${body}`;
  ctx.textAlign = 'right';
  ctx.fillText(spec.footer, POSTCARD.width - PAD, POSTCARD.height - 24);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), 'image/png'));
}
