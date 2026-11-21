import { BASELINE_S, type FaultKind, MIN_BURST_ERRORS, type MoodLine, RECENT_S, serviceMoods, simulateIncident } from '../src';

const NOW = 1_700_001_000;
const START = NOW - RECENT_S - BASELINE_S;
let next = 0;
const line = (timestamp: number, service: string, message: string, severity = 'info'): MoodLine => ({ id: `l${next++}`, timestamp, service, severity, message });

/** `count` lines spread evenly over [from, to). */
const spread = (from: number, to: number, count: number, service: string, message: string, severity = 'info'): MoodLine[] =>
  Array.from({ length: count }, (_, i) => line(from + Math.floor((i * (to - from)) / count), service, message, severity));

/** A steady service: one request line every 5 s across baseline and recent windows. */
const steady = (service: string): MoodLine[] => spread(START, NOW, (RECENT_S + BASELINE_S) / 5, service, 'GET /items 200 in 12 ms');
const recent = (count: number, service: string, message: string, severity = 'info'): MoodLine[] => spread(NOW - RECENT_S + 1, NOW, count, service, message, severity);
const moodOf = (lines: MoodLine[], service: string) => serviceMoods(lines, NOW).find((m) => m.service === service);

describe('serviceMoods', () => {
  it('calls a steady service fine and gives a reason', () => {
    const mood = moodOf(steady('api'), 'api');
    expect(mood?.mood).toBe('fine');
    expect(mood?.reason).toMatch(/normal/i);
    expect(mood?.evidenceIds).toEqual([]);
  });

  it('calls a service with too little history fine, never new or quiet', () => {
    const lines = recent(3, 'fresh', 'hello there friend');
    expect(moodOf(lines, 'fresh')).toMatchObject({ mood: 'fine', reason: expect.stringMatching(/too little history/i) });
  });

  it('notices a phrase the service never said in the baseline and cites its first line', () => {
    const extra = recent(4, 'api', 'cache warmup took 300 ms for region eu');
    const mood = moodOf([...steady('api'), ...extra], 'api');
    expect(mood?.mood).toBe('new-phrase');
    expect(mood?.evidenceIds).toEqual([extra[0]?.id]);
    expect(mood?.newTemplates).toHaveLength(1);
  });

  it('calls a burst of errors sick, with error lines as evidence', () => {
    const errors = recent(MIN_BURST_ERRORS + 4, 'db', 'GET /items 200 in 12 ms', 'error');
    const mood = moodOf([...steady('db'), ...errors], 'db');
    expect(mood?.mood).toBe('sick');
    expect(mood?.reason).toContain(`${MIN_BURST_ERRORS + 4} error lines`);
    expect(mood?.evidenceIds).toEqual(errors.slice(0, 5).map((l) => l.id));
  });

  it('calls a few extra warnings stressed, not sick', () => {
    const mood = moodOf([...steady('cart'), ...recent(4, 'cart', 'GET /items 200 in 12 ms', 'warning')], 'cart');
    expect(mood?.mood).toBe('stressed');
  });

  it('does not call errors stressed when the service always logs that many', () => {
    const usual = spread(START, NOW, 60, 'noisy', 'GET /items 200 in 12 ms', 'warning');
    expect(moodOf([...steady('noisy'), ...usual], 'noisy')?.mood).toBe('fine');
  });

  it('calls a busy service that goes silent quiet, with no evidence ids', () => {
    const lines = spread(START, NOW - RECENT_S, BASELINE_S / 5, 'auth', 'token issued for user 42');
    const mood = moodOf(lines, 'auth');
    expect(mood).toMatchObject({ mood: 'quiet', evidenceIds: [], recentLines: 0 });
  });

  it('calls new shutdown and startup lines a restart, which outranks errors', () => {
    const restart = [line(NOW - 60, 'orders', 'received SIGTERM, shutting down'), line(NOW - 50, 'orders', 'orders service started on port 8080')];
    const errors = recent(MIN_BURST_ERRORS + 2, 'orders', 'GET /items 200 in 12 ms', 'error');
    const mood = moodOf([...steady('orders'), ...restart, ...errors], 'orders');
    expect(mood?.mood).toBe('restarted');
    expect(mood?.evidenceIds).toEqual(restart.map((l) => l.id));
  });

  it('ignores lines outside the windows and sorts the worst mood first', () => {
    const lines = [...steady('a-fine'), ...steady('z-sick'), ...recent(MIN_BURST_ERRORS, 'z-sick', 'boom', 'error'), line(NOW + 10, 'future', 'later'), line(START - 10, 'old', 'before')];
    expect(serviceMoods(lines, NOW).map((m) => [m.service, m.mood])).toEqual([
      ['z-sick', 'sick'],
      ['a-fine', 'fine'],
    ]);
  });

  it('does not depend on the order lines arrive in', () => {
    const lines = [...steady('api'), ...recent(4, 'api', 'cache warmup took 300 ms for region eu')];
    expect(serviceMoods([...lines].reverse(), NOW)).toEqual(serviceMoods(lines, NOW));
  });

  it('returns nothing for no lines', () => {
    expect(serviceMoods([], NOW)).toEqual([]);
  });
});

describe('serviceMoods on simulated incidents', () => {
  const moodsDuring = (fault: FaultKind, seed: number) => {
    const sim = simulateIncident({ seed, service: 'catalog', fault });
    const lines = sim.lines.map((l) => ({ ...l, severity: l.severity ?? 'info' }));
    return serviceMoods(lines, sim.incidentStart + 100);
  };
  const moodOfIn = (fault: FaultKind, seed: number, service: string) => moodsDuring(fault, seed).find((m) => m.service === service)?.mood;

  it.each([
    ['crash', 'restarted'],
    ['disk', 'sick'],
    ['memory', 'stressed'],
  ] as const)('shows a %s fault on the broken service itself (%s)', (fault, mood) => {
    for (const seed of [1, 2, 3]) expect(moodOfIn(fault, seed, 'catalog')).toBe(mood);
  });

  it.each(['cpu', 'delay', 'loss'] as const)('shows a %s fault only as a symptom on the callers: moods are symptoms, not causes', (fault) => {
    for (const seed of [1, 2, 3]) {
      expect(moodOfIn(fault, seed, 'catalog')).toBe('fine');
      expect(moodOfIn(fault, seed, 'gateway')).not.toBe('fine');
    }
  });
});
