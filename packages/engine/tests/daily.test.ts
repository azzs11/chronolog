import { DAILY_EPOCH, dailyCase, isObservable, rewindMoods, simulateIncident, timelineOf, utcDate } from '../src';

describe('dailyCase', () => {
  it('numbers days from the epoch and is the same for everyone on a date', () => {
    expect(dailyCase(DAILY_EPOCH).number).toBe(1);
    expect(dailyCase('2026-11-22').number).toBe(2);
    expect(dailyCase('2027-11-21').number).toBe(366);
    expect(dailyCase('2026-12-01')).toEqual(dailyCase('2026-12-01'));
  });

  it('always picks a fault the logs can show, and varies across days', () => {
    const month = Array.from({ length: 30 }, (_, i) => dailyCase(utcDate(Date.parse('2026-12-01T00:00:00Z') + i * 86_400_000)));
    for (const d of month) expect(isObservable(d.service, d.fault)).toBe(true);
    expect(new Set(month.map((d) => d.service)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(month.map((d) => d.fault)).size).toBeGreaterThanOrEqual(4);
  });

  it('rejects anything that is not a date', () => {
    expect(() => dailyCase('2026-13-45')).toThrow(RangeError);
    expect(() => dailyCase('tomorrow')).toThrow(RangeError);
  });

  it('reads the UTC date of a moment', () => {
    expect(utcDate(Date.parse('2026-11-21T23:59:59Z'))).toBe('2026-11-21');
    expect(utcDate(Date.parse('2026-11-22T00:00:00Z'))).toBe('2026-11-22');
  });
});

describe('timelineOf', () => {
  it('counts lines and errors per service in buckets around the start', () => {
    const t = timelineOf(
      [
        { timestamp: 100, service: 'b', severity: 'info' },
        { timestamp: 95, service: 'a', severity: 'error' },
        { timestamp: 131, service: 'a', severity: 'critical' },
      ],
      100,
      30,
    );
    expect(t.startOffset).toBe(-30);
    expect(t.services).toEqual([
      { name: 'a', lines: [1, 0, 1], errors: [1, 0, 1] },
      { name: 'b', lines: [0, 1, 0], errors: [0, 0, 0] },
    ]);
    expect(timelineOf([], 0, 30).services).toEqual([]);
    const warned = timelineOf([{ timestamp: 100, service: 'a', severity: 'warning' }], 100, 30, true);
    expect(warned.services[0]?.errors).toEqual([1]);
    expect(timelineOf([{ timestamp: 100, service: 'a', severity: 'warning' }], 100, 30).services[0]?.errors).toEqual([0]);
  });

  it('feeds rewindMoods; within one bucket the broken service ties with its caller, and both are reported', () => {
    const sim = simulateIncident({ seed: 9, service: 'orders', fault: 'disk' });
    const sign = rewindMoods(timelineOf(sim.lines, sim.incidentStart, 30)).firstSign;
    expect([sign?.service, ...(sign?.alsoUnwell ?? [])]).toContain('orders');
  });
});
