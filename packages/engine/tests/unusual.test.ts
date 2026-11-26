import { describe, expect, it } from 'vitest';
import {
  MAX_UNUSUAL_IDS,
  rareTemplateLines,
  UNUSUAL_RECENT_S,
  type UnusualInputLine,
  unusualTemplates,
} from '../src/anomaly/unusual';

const NOW = 10_000;

function line(t: number, message: string, service = 'api', id?: string): UnusualInputLine {
  return { timestamp: t, message, service, id };
}

describe('rareTemplateLines', () => {
  it('treats unseen templates as rare and uses only the baseline for shares', () => {
    expect(rareTemplateLines([1, 1, 1, 2, 3], [0, 1, 2, 3, 9], 5, 0.3)).toEqual([
      false, false, false, true, true,
    ]);
  });

  it('flags everything when there is no baseline', () => {
    expect(rareTemplateLines([1, 2], [5, 6], 0)).toEqual([true, true]);
  });
});

describe('unusualTemplates', () => {
  const baseline = Array.from({ length: 200 }, (_, i) =>
    line(NOW - UNUSUAL_RECENT_S - 1000 + i, `GET /items/${i} ok`),
  );

  it('lists only messages never seen in the baseline, with ids and services', () => {
    const recent = [
      line(NOW - 100, 'GET /items/7 ok'),
      ...Array.from({ length: 7 }, (_, i) =>
        line(NOW - 90 + i, `disk quota exceeded on volume ${i}`, i % 2 ? 'db' : 'catalog', `r${i}`),
      ),
    ];
    const result = unusualTemplates([...baseline, ...recent], NOW);
    expect(result.isOnlyNewTemplates).toBe(true);
    expect(result.baselineLines).toBe(200);
    expect(result.recentLines).toBe(8);
    expect(result.templates).toHaveLength(1);
    const [disk] = result.templates;
    expect(disk?.count).toBe(7);
    expect(disk?.baselineCount).toBe(0);
    expect(disk?.services).toEqual(['catalog', 'db']);
    expect(disk?.lineIds).toHaveLength(MAX_UNUSUAL_IDS);
    expect(disk?.lineIds[0]).toBe('r0');
  });

  it('ignores lines outside the baseline hour and the future', () => {
    const result = unusualTemplates([line(0, 'ancient'), line(NOW + 5, 'future')], NOW);
    expect(result.baselineLines + result.recentLines).toBe(0);
    expect(result.templates).toEqual([]);
  });
});
