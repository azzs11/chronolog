import { FAULT_KINDS, isObservable, randomFault, Rng, SERVICES, simulateIncident, type FaultKind, type SimIncident, type SimService } from '../src';

const make = (service: SimService, fault: FaultKind, seed = 1): SimIncident => simulateIncident({ seed, service, fault });
const textOf = (inc: SimIncident, service: string, after = true): string[] =>
  inc.lines.filter((l) => l.service === service && (l.timestamp >= inc.incidentStart) === after).map((l) => l.message);

describe('simulateIncident', () => {
  it('is deterministic for a seed and different for another', () => {
    expect(make('db', 'disk', 7)).toEqual(make('db', 'disk', 7));
    expect(make('db', 'disk', 7).lines).not.toEqual(make('db', 'disk', 8).lines);
  });

  it('returns ordered lines with ids, the truth, the start and six services', () => {
    const inc = make('cart', 'cpu');
    expect(inc.services).toEqual(SERVICES);
    expect(inc.truth).toEqual({ service: 'cart', fault: 'cpu' });
    expect(inc.lines.length).toBeGreaterThan(5000);
    const stamps = inc.lines.map((l) => l.timestamp);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    expect(new Set(inc.lines.map((l) => l.id)).size).toBe(inc.lines.length);
    expect(inc.lines.filter((l) => l.timestamp < inc.incidentStart).length).toBeGreaterThan(2000);
    expect(inc.affected).toContain('cart');
  });

  it('writes nothing fault-like before the fault starts', () => {
    for (const fault of FAULT_KINDS) {
      const inc = make('auth', fault, 3);
      const before = inc.lines.filter((l) => l.timestamp < inc.incidentStart);
      expect(before.some((l) => l.severity === 'error' || l.severity === 'warning')).toBe(false);
    }
  });

  it('crash: the service logs shutdown and startup lines, and callers see refused connections', () => {
    const inc = make('catalog', 'crash');
    const own = textOf(inc, 'catalog').join('\n');
    expect(own).toMatch(/SIGTERM/);
    expect(own).toMatch(/catalog v2\.3\.1 starting/);
    expect(textOf(inc, 'gateway').join('\n')).toMatch(/connection refused to catalog/);
    expect(inc.affected).toEqual(expect.arrayContaining(['catalog', 'gateway']));
  });

  it('disk: the service logs a new error on many requests', () => {
    const errors = textOf(make('db', 'disk'), 'db').filter((m) => m.includes('no space left on device'));
    expect(errors.length).toBeGreaterThan(50);
  });

  it('memory: an occasional new GC warning and little else', () => {
    const inc = make('orders', 'memory');
    expect(textOf(inc, 'orders').filter((m) => m.includes('GC pause')).length).toBeGreaterThan(10);
    expect(inc.affected).toEqual(['orders']);
  });

  it('delay and loss: the broken service logs no fault line, its callers name it', () => {
    for (const fault of ['delay', 'loss'] as const) {
      const inc = make('db', fault);
      const own = textOf(inc, 'db').filter((m) => /slow response|retry|failed|error|timeout/.test(m));
      expect(own).toEqual([]);
      const named = inc.lines.filter((l) => l.service !== 'db' && l.message.includes('db') && (l.severity === 'warning' || l.severity === 'error'));
      expect(named.length).toBeGreaterThan(20);
    }
  });

  it('cpu: callers log timeouts that name the service', () => {
    const inc = make('auth', 'cpu');
    expect(textOf(inc, 'gateway').join('\n')).toMatch(/timeout calling auth after 2000ms/);
  });

  it('rejects unobservable combinations: a lossy or slow network to the gateway leaves no logs', () => {
    expect(isObservable('gateway', 'delay')).toBe(false);
    expect(isObservable('gateway', 'loss')).toBe(false);
    expect(isObservable('gateway', 'crash')).toBe(true);
    expect(isObservable('db', 'delay')).toBe(true);
  });

  it('randomFault only returns observable faults and covers every kind eventually', () => {
    const rng = new Rng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const { service, fault } = randomFault(rng);
      expect(isObservable(service, fault)).toBe(true);
      seen.add(fault);
    }
    expect(seen.size).toBe(FAULT_KINDS.length);
  });
});

describe('Rng', () => {
  it('repeats for a seed, stays in range and latency is positive', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      expect(r.latency(10)).toBeGreaterThanOrEqual(1);
    }
    expect(new Rng(1).pick(['only'])).toBe('only');
    expect([true, false]).toContain(new Rng(1).chance(0.5));
  });
});
