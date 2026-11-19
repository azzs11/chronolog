import { BURST_BUCKET_S, findErrorBursts, MIN_BURST_ERRORS, type BurstLine } from '../src';

const T0 = 1_700_000_040; // a multiple of the 30 s bucket
const err = (t: number, service = 'api', severity = 'error'): BurstLine => ({ timestamp: t, service, severity });
const calm = (): BurstLine[] => Array.from({ length: 600 }, (_, i) => err(T0 + i, 'api', 'info'));
/** `count` error lines spread over [from, from + seconds). */
const errors = (from: number, seconds: number, count: number, service = 'db'): BurstLine[] =>
  Array.from({ length: count }, (_, i) => err(from + Math.floor((i * seconds) / count), service));

describe('findErrorBursts', () => {
  it('finds nothing in calm logs, in no logs, or in a few stray errors', () => {
    expect(findErrorBursts([])).toEqual([]);
    expect(findErrorBursts(calm())).toEqual([]);
    expect(findErrorBursts([...calm(), err(T0 + 100), err(T0 + 200), err(T0 + 400)])).toEqual([]);
  });

  it('finds a burst with its start, end, size, services and impact', () => {
    const lines = [...calm(), ...errors(T0 + 300, 60, 30, 'db'), ...errors(T0 + 300, 60, 10, 'api')];
    const [burst, ...rest] = findErrorBursts(lines);
    expect(rest).toEqual([]);
    expect(burst).toMatchObject({ start: T0 + 300, errorLines: 40, impact: 80, peak: 20 });
    expect(burst?.end).toBe(T0 + 360);
    expect(burst?.services).toEqual([{ service: 'db', errors: 30 }, { service: 'api', errors: 10 }]);
  });

  it('counts critical lines as errors and ignores warnings', () => {
    const lines = [...calm(), ...Array.from({ length: 12 }, (_, i) => err(T0 + 300 + i, 'db', 'critical')), ...Array.from({ length: 30 }, (_, i) => err(T0 + 300 + i, 'x', 'warning'))];
    expect(findErrorBursts(lines)[0]?.errorLines).toBe(12);
  });

  it('merges hot buckets across a short gap and splits them across a long one', () => {
    const near = [...calm(), ...errors(T0 + 60, 30, 12), ...errors(T0 + 60 + 3 * BURST_BUCKET_S, 30, 12)];
    expect(findErrorBursts(near)).toHaveLength(1);
    const far = [...calm(), ...errors(T0 + 30, 30, 12), ...errors(T0 + 30 + 8 * BURST_BUCKET_S, 30, 12)];
    expect(findErrorBursts(far)).toHaveLength(2);
  });

  it('ranks bursts by impact, and drops bursts under the minimum size', () => {
    const lines = [...calm(), ...errors(T0 + 30, 30, 10, 'a'), ...errors(T0 + 300, 30, 40, 'b'), ...errors(T0 + 300, 30, 40, 'c'), ...errors(T0 + 500, 30, MIN_BURST_ERRORS - 1, 'z')];
    const found = findErrorBursts(lines);
    expect(found.map((b) => b.start)).toEqual([T0 + 300, T0 + 30]);
    expect(found[0]?.impact).toBe(160);
  });

  it('still finds a burst that covers half of the window, which a median baseline would miss', () => {
    const half = Array.from({ length: 480 }, (_, i) => err(T0 + i, 'api', 'info'));
    const found = findErrorBursts([...half, ...errors(T0 + 240, 240, 800, 'db')]);
    expect(found).toHaveLength(1);
    expect(found[0]?.start).toBe(T0 + 240);
  });

  it('does not treat constant background errors as a burst, but still sees a spike on top of them', () => {
    const noisy = Array.from({ length: 600 }, (_, i) => err(T0 + i, 'api')).filter((_, i) => i % 5 === 0); // 6 errors per bucket all the time
    expect(findErrorBursts(noisy)).toEqual([]);
    expect(findErrorBursts([...noisy, ...errors(T0 + 300, 30, 60, 'db')])[0]?.start).toBe(T0 + 300);
  });
});
