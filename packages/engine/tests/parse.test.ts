import { parseLog, serviceFromPath, toUnixSeconds } from '../src';

describe('parsing', () => {
  it('reads ISO times with and without a zone, and Unix seconds and milliseconds', () => {
    expect(toUnixSeconds('2026-01-02T03:04:05Z')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5) / 1000);
    expect(toUnixSeconds('2026-01-02 03:04:05')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5) / 1000);
    expect(toUnixSeconds('2026-01-02 03:04:05,500')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 500) / 1000);
    expect(toUnixSeconds('1700000000')).toBe(1_700_000_000);
    expect(toUnixSeconds('1700000000000')).toBe(1_700_000_000);
    expect(toUnixSeconds('not a time')).toBeNull();
  });

  it('parses plain text, joins stack-trace lines to the line above, and counts what it cannot place', () => {
    const text = ['preamble with no time', '2026-01-02T03:04:05Z ERROR boom', '    at Foo.bar(Foo.java:1)', '2026-01-02T03:04:06Z INFO ok'].join('\n');
    const { lines, skipped } = parseLog(text, 'api');
    expect(skipped).toBe(1);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.message).toBe('ERROR boom at Foo.bar(Foo.java:1)');
    expect(lines[0]?.service).toBe('api');
  });

  it('parses JSON lines, honouring the service and level fields', () => {
    const text = [
      JSON.stringify({ ts: '2026-01-02T03:04:05Z', level: 'WARN', service: 'db', msg: 'slow' }),
      JSON.stringify({ time: 1_700_000_000, message: 'x', level: 'unknown-level' }),
      '{ broken json',
    ].join('\n');
    const { lines, skipped } = parseLog(text, 'fallback');
    expect(skipped).toBe(1);
    expect(lines[0]).toMatchObject({ service: 'db', severity: 'warning', message: 'slow' });
    expect(lines[1]).toMatchObject({ service: 'fallback', message: 'x' });
    expect(lines[1]?.severity).toBeUndefined();
  });

  it('names a service after its file', () => {
    expect(serviceFromPath('/var/log/payments.log')).toBe('payments');
    expect(serviceFromPath('C:\\logs\\api.jsonl')).toBe('api');
  });
});


describe('line ids', () => {
  it('tags each line with file and line number when asked, and only then', () => {
    const text = '2026-01-02T03:04:05Z boom\n\n  at frame\n2026-01-02T03:04:06Z ok\n{"ts": 1767323047, "msg": "json"}';
    expect(parseLog(text, 'api', 'api.log').lines.map((l) => l.id)).toEqual(['api.log:1', 'api.log:4', 'api.log:5']);
    expect(parseLog(text, 'api').lines.every((l) => l.id === undefined)).toBe(true);
  });
});
