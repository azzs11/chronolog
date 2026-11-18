import { CausalEngine, type LogInput } from '../src';

/** Small seeded generator so the stream is the same on every run. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const MESSAGES = [
  'database connection pool exhausted port 5432',
  'redis timeout on 10.0.0.5',
  'GET /api/users 503',
  'payment gateway timeout after 30s',
  'cache miss ratio elevated',
  'tick',
  'auth failed for /login 401',
  'queue backlog growing',
];
const SEVERITIES = ['debug', 'info', 'info', 'warning', 'error', 'critical'];
const SOURCES = ['api', 'database', 'auth', 'payment', 'cache', 'queue', 'redis', 'unknown-svc'];

function stream(count: number): LogInput[] {
  const rand = lcg(42);
  const base = Date.parse('2026-01-01T00:00:00Z');
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)] as T;
  let t = base;
  return Array.from({ length: count }, (_, i) => {
    t += Math.floor(rand() * 4000);
    return { id: `log-${i}`, message: pick(MESSAGES), severity: pick(SEVERITIES), source: pick(SOURCES), timestamp: new Date(t).toISOString() };
  });
}

describe('entity cache', () => {
  it('gives identical results with the cache on, off and tiny (forcing evictions)', () => {
    const logs = stream(2000);
    const run = (entityCacheSize?: number) => {
      const engine = new CausalEngine({ entityCacheSize });
      return logs.map((l) => engine.analyzeLog(l));
    };
    const reference = run(0);
    expect(run()).toEqual(reference);
    expect(run(3)).toEqual(reference);
    // The stream really exercises linking, so the equality above is meaningful.
    expect(reference.filter((r) => r.causal_parent_id !== null).length).toBeGreaterThan(500);
  });
});
