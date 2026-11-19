import { learnServiceGraph, rankRootCauses, ROOTRANK_V1, type RcaLine } from '../src';

/** Real incidents have up to ~270,000 log lines; spreading that many numbers into Math.min throws. */
function manyLines(count: number): RcaLine[] {
  const services = ['api', 'db', 'cache', 'auth'];
  const out: RcaLine[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ timestamp: 1_700_000_000 + Math.floor(i / 300), service: services[i % services.length] as string, message: i % 97 === 0 ? 'slow query' : 'heartbeat ok' });
  }
  return out;
}

describe('very large inputs', () => {
  const lines = manyLines(260_000);

  it('ranks 260,000 lines without a stack overflow', () => {
    const result = rankRootCauses(lines, 1_700_000_000 + 430, ROOTRANK_V1);
    expect(result.candidates).toHaveLength(4);
    expect(result.baselineLines + result.incidentLines).toBe(260_000);
  });

  it('estimates the start and learns a graph from 260,000 lines too', () => {
    expect(rankRootCauses(lines, undefined, ROOTRANK_V1).startSource).toBe('estimated');
    expect(learnServiceGraph(lines).services).toHaveLength(4);
  });
});
