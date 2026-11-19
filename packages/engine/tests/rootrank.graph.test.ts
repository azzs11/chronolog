import { learnServiceGraph, MIN_MENTIONS, type RcaLine } from '../src';

function build(): RcaLine[] {
  const lines: RcaLine[] = [];
  for (let t = 0; t < 200; t++) {
    const burst = Math.floor(t / 10) % 2 ? 6 : 1; // alpha and beta share a rhythm; gamma is flat
    for (let i = 0; i < burst; i++) {
      lines.push({ timestamp: t, service: 'alpha', message: 'heartbeat ok' });
      lines.push({ timestamp: t, service: 'beta', message: 'heartbeat ok' });
    }
    for (let i = 0; i < 3; i++) lines.push({ timestamp: t, service: 'gamma', message: 'queue ok' });
    if (t % 20 === 0) for (let i = 0; i < MIN_MENTIONS; i++) lines.push({ timestamp: t, service: 'alpha', message: 'call to beta failed' });
    if (t === 40) lines.push({ timestamp: t, service: 'gamma', message: 'call to beta failed' }); // one stray mention
  }
  return lines;
}

describe('learnServiceGraph', () => {
  const graph = learnServiceGraph(build());

  it('finds a directed mention edge only when there are enough naming lines', () => {
    expect(graph.mentions.map((e) => `${e.from}->${e.to}`)).toEqual(['alpha->beta']);
    expect(graph.mentions[0]?.count).toBeGreaterThanOrEqual(MIN_MENTIONS);
  });

  it('links services whose volumes move together and not the flat one', () => {
    const pairs = graph.correlations.map((e) => `${e.a}-${e.b}`);
    expect(pairs).toContain('alpha-beta');
    expect(pairs.some((p) => p.includes('gamma'))).toBe(false);
    for (const e of graph.correlations) expect(e.corr).toBeLessThanOrEqual(1);
  });

  it('handles no lines and a single service', () => {
    expect(learnServiceGraph([])).toEqual({ services: [], mentions: [], correlations: [] });
    const one = learnServiceGraph([{ timestamp: 1, service: 'a', message: 'x' }]);
    expect(one.services).toEqual(['a']);
    expect(one.correlations).toEqual([]);
  });
});
