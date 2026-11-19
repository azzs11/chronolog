import { flagLines } from '../src/anomaly';

const calm = (i: number) => ({ t: 1000 + i * 2, source: 'api', severity: 'info' });

describe('flagLines', () => {
  it('flags nothing on a short calm stream', () => {
    expect(flagLines(Array.from({ length: 10 }, (_, i) => calm(i)))).toEqual([]);
  });

  it('flags a burst of critical lines after a calm baseline, with valid indices', () => {
    const lines = Array.from({ length: 40 }, (_, i) => calm(i));
    for (let i = 0; i < 8; i++) lines.push({ t: 1100 + i * 0.01, source: 'db', severity: 'critical' });
    const flagged = flagLines(lines);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((i) => i >= 40 && i < lines.length)).toBe(true);
  });

  it('is deterministic', () => {
    const lines = Array.from({ length: 60 }, (_, i) => ({
      ...calm(i),
      severity: i % 7 === 0 ? 'error' : 'info',
    }));
    expect(flagLines(lines)).toEqual(flagLines(lines));
  });
});
