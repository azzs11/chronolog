import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * WCAG contrast for the design tokens, read from theme.css itself. Text and signal colours need
 * 4.5:1 on every surface; control outlines need 3:1. If someone edits a token and breaks accessibility,
 * this fails.
 */
const css = readFileSync(join(__dirname, 'theme.css'), 'utf8');

type Tokens = Record<string, string>;

function tokensIn(block: string): Tokens {
  const out: Tokens = {};
  for (const [, name, value] of block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) out[name as string] = (value as string).toLowerCase();
  return out;
}

function blockAfter(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `selector ${selector} not found`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block for ${selector}`);
}

const dark = tokensIn(blockAfter(':root,\n[data-theme="dark"]'));
const light = tokensIn(blockAfter('[data-theme="light"]'));
const systemLight = tokensIn(blockAfter(':root:not([data-theme])'));

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const SURFACES = ['bg-base', 'bg-surface', 'bg-elevated'] as const;
const TEXT = ['text-primary', 'text-secondary', 'text-muted', 'accent', 'sev-critical', 'sev-error', 'sev-warning', 'sev-info', 'sev-debug'] as const;

describe.each([
  ['dark', dark],
  ['light', light],
] as const)('%s theme', (_name, tokens) => {
  it('defines every token as a six-digit colour', () => {
    for (const key of [...SURFACES, ...TEXT, 'border-dim', 'border-strong', 'accent-solid', 'accent-fg']) {
      expect(tokens[key], key).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(TEXT)('%s text meets 4.5:1 on every surface', (text) => {
    for (const surface of SURFACES) {
      const ratio = contrast(tokens[text] as string, tokens[surface] as string);
      expect(ratio, `${text} on ${surface}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps button text readable on the solid accent', () => {
    expect(contrast(tokens['accent-fg'] as string, tokens['accent-solid'] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps control outlines visible (3:1) against the base', () => {
    expect(contrast(tokens['border-strong'] as string, tokens['bg-base'] as string)).toBeGreaterThanOrEqual(3);
  });
});

describe('the system-light fallback', () => {
  it('repeats the light theme exactly, so following the system looks the same as choosing light', () => {
    expect(systemLight).toEqual(light);
  });
});

describe('severity is a signal, not a background', () => {
  it('has no background utility built from a severity colour in the theme', () => {
    expect(css).not.toMatch(/background[^;]*var\(--sev-/);
  });
});
