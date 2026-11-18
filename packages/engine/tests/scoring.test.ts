import {
  CAUSAL_MAX_CHAIN_DEPTH,
  CausalEngine,
  computeBlastRadius,
  computeCausalScore,
  computeEntityOverlap,
  extractEntities,
  type CausalLog,
  type ChainDetectedEvent,
  type LogInput,
  sourceRelationScore,
  temporalProximityScore,
} from '../src';

const BASE = Date.parse('2026-01-01T00:00:00Z');
const at = (seconds: number): string => new Date(BASE + seconds * 1000).toISOString();
const log = (id: string, severity: string, source: string, seconds: number, message = 'something'): LogInput => ({
  id,
  severity,
  source,
  message,
  timestamp: at(seconds),
});

describe('temporalProximityScore', () => {
  it.each([
    [0, 0],
    [-3, 0],
    [3, 1],
    [7.5, 0.9],
    [15, 0.65],
    [25, 0.35],
    [31, 0],
  ])('age %ss scores %s', (age, expected) => {
    expect(temporalProximityScore(age)).toBeCloseTo(expected, 5);
  });
});

describe('sourceRelationScore', () => {
  it('scores the same service 1', () => expect(sourceRelationScore('api', 'api')).toBe(1));
  it('scores a dependency of the child 0.75', () => expect(sourceRelationScore('database', 'api')).toBe(0.75));
  it('matches service-name prefixes', () => expect(sourceRelationScore('auth', 'payment-service')).toBe(0.75));
  it('scores the reverse direction 0.3', () => expect(sourceRelationScore('api', 'database')).toBe(0.3));
  it('scores unrelated services 0.08', () => expect(sourceRelationScore('foo', 'bar')).toBe(0.08));
});

describe('entities', () => {
  it('extracts services, ips, ports, paths and error codes', () => {
    const e = extractEntities('Redis at 10.0.0.5 port 6379 failed /api/users with 503');
    expect(e.services).toContain('redis');
    expect(e.ips).toEqual(['10.0.0.5']);
    expect(e.ports).toContain('6379');
    expect(e.paths).toContain('/api/users');
    expect(e.errorCodes).toContain('503');
  });

  it('tolerates a missing message', () => {
    expect(extractEntities(undefined).services).toEqual([]);
  });

  it('scores no overlap as 0, identical as 1 and partial in between', () => {
    expect(computeEntityOverlap(extractEntities('hello'), extractEntities('world'))).toBe(0);
    const a = extractEntities('database timeout');
    expect(computeEntityOverlap(a, a)).toBe(1);
    const partial = computeEntityOverlap(extractEntities('database redis down'), extractEntities('database up'));
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });
});

describe('computeCausalScore', () => {
  it('is 0 when the parent is not earlier than the child', () => {
    expect(computeCausalScore(log('a', 'info', 'api', 5), log('b', 'info', 'api', 5))).toBe(0);
    expect(computeCausalScore(log('a', 'info', 'api', 9), log('b', 'info', 'api', 5))).toBe(0);
  });

  it('is 0 outside the 30 s window', () => {
    expect(computeCausalScore(log('a', 'info', 'api', 0), log('b', 'error', 'api', 31))).toBe(0);
  });

  it('never exceeds 1', () => {
    const parent = log('a', 'warning', 'database', 0, 'database 503 port 5432 /db/pool');
    const child = log('b', 'critical', 'database', 1, 'database 503 port 5432 /db/pool');
    expect(computeCausalScore(parent, child)).toBeLessThanOrEqual(1);
  });

  it('adds the warning-to-error bonus only for related services', () => {
    const related = computeCausalScore(log('a', 'warning', 'database', 0), log('b', 'error', 'api', 3));
    const unrelated = computeCausalScore(log('a', 'warning', 'foo', 0), log('b', 'error', 'bar', 3));
    expect(related).toBeGreaterThan(unrelated);
  });
});

describe('computeBlastRadius', () => {
  const parent = { blast_radius_score: 10 } as CausalLog;

  it('gives a root its severity weight', () => {
    expect(computeBlastRadius(log('a', 'critical', 'api', 0), null)).toBe(5);
    expect(computeBlastRadius(log('a', 'unknown-level', 'api', 0), null)).toBe(1);
  });

  it('adds the decayed parent radius to a child', () => {
    expect(computeBlastRadius(log('b', 'error', 'api', 1), parent)).toBe(12);
  });
});

describe('CausalEngine chains', () => {
  // Gaps of 6 s make the previous log the best parent, so depth grows by one each time.
  // The message has no entities, so ties at the 1.0 score cap cannot hide the ordering.
  const spacedChain = (engine: CausalEngine, count: number): void => {
    const severities = ['debug', 'info', 'error', 'critical'];
    for (let i = 0; i < count; i++) {
      engine.analyzeLog(log(`L${i}`, severities[Math.min(i, 3)] as string, 'database', i * 6, 'tick'));
    }
  };

  it('emits a chain-detected event when depth reaches 3', () => {
    const engine = new CausalEngine();
    const events: ChainDetectedEvent[] = [];
    engine.onChainDetected((e) => events.push(e));
    spacedChain(engine, 4);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'causal-chain-detected', root_id: 'L0', chain_depth: 3, total_affected: 4 });
    expect(events[0]?.chain_preview.length).toBe(4);
  });

  it('caps chain depth', () => {
    const engine = new CausalEngine();
    spacedChain(engine, CAUSAL_MAX_CHAIN_DEPTH + 5);
    const depths = engine.getChainById('L0').map((l) => l.causal_chain_depth);
    expect(Math.max(...depths)).toBeLessThanOrEqual(CAUSAL_MAX_CHAIN_DEPTH);
  });

  it('logs each causal link through the injected logger', () => {
    const debug = vi.fn();
    const engine = new CausalEngine({ logger: { debug } });
    spacedChain(engine, 2);
    expect(debug).toHaveBeenCalledWith('Causal link established', expect.objectContaining({ depth: 1 }));
  });

  it('builds graph nodes and edges and truncates long labels', () => {
    const engine = new CausalEngine();
    engine.analyzeLog(log('R', 'info', 'database', 0, 'database '.repeat(10)));
    engine.analyzeLog(log('C', 'error', 'database', 3, 'database pool'));
    const graph = engine.getGraphData();
    expect(graph.edges).toEqual([{ from: 'R', to: 'C' }]);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['C', 'R']);
    expect(graph.nodes.find((n) => n.id === 'R')?.label.endsWith('…')).toBe(false); // parent labels are not truncated with an ellipsis
    expect(graph.nodes.find((n) => n.id === 'C')?.depth).toBe(1);
  });

  it('forgets everything on reset', () => {
    const engine = new CausalEngine();
    spacedChain(engine, 3);
    engine.reset();
    expect(engine.getActiveCausalChains()).toEqual([]);
    expect(engine.getGraphData()).toEqual({ nodes: [], edges: [] });
  });
});
