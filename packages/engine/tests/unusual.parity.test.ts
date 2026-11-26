import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rareTemplateLines } from '../src/anomaly/unusual';
import { assignTemplates } from '../src/rootrank/templates';

interface Golden {
  share: number;
  cutoff: number;
  t: number[];
  messages: string[];
  templateIds: number[];
  rare: boolean[];
}

const golden = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'unusual-golden.json'), 'utf8'),
) as Golden;

describe('rare-template surprise matches the benchmark (real BGL lines)', () => {
  it('mines the same template ids', () => {
    expect(assignTemplates(golden.messages).ids).toEqual(golden.templateIds);
  });

  it('flags the same lines', () => {
    const flags = rareTemplateLines(golden.templateIds, golden.t, golden.cutoff, golden.share);
    expect(flags).toEqual(golden.rare);
    expect(flags.filter(Boolean).length).toBeGreaterThan(0);
  });
});
