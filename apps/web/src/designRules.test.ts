import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The design system only works if views use its tokens. This fails if a new view reaches for a raw
 * Tailwind palette colour (indigo-500, amber-400...) or a hex colour instead of a token such as
 * text-sev-warning or bg-accent-solid. The older views under src/components are excluded: they are
 * being replaced.
 */
const ROOTS = ['features', 'app', 'DemoApp.tsx'];
const RAW_PALETTE = /\b(?:bg|text|border|fill|stroke|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

const sources = ROOTS.flatMap((root) => files(join(__dirname, root))).filter(
  (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('benchmarkFacts.ts') && !f.endsWith('modelV1.ts'),
);

describe('views use design tokens', () => {
  it('finds the view sources', () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  it.each(sources.map((f) => [f.replace(`${__dirname}/`, ''), f]))('%s has no raw palette colours or hex values', (_name, file) => {
    const text = readFileSync(file as string, 'utf8');
    expect(text.match(RAW_PALETTE), 'raw Tailwind palette colour').toBeNull();
    expect(text.match(HEX), 'hex colour').toBeNull();
  });
});
