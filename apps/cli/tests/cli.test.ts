import { simulateIncident, type SimIncident } from '@chronolog/engine';
import { formatReport, loadLines, parseArgs, run, UsageError } from '../src/cli';
import { parseLog, serviceFromPath, toUnixSeconds } from '../src/parse';

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString();

/** The simulated incident as one plain-text log file per service. */
function plainFiles(incident: SimIncident): Record<string, string> {
  const files: Record<string, string[]> = {};
  for (const l of incident.lines) {
    const name = `${l.service}.log`;
    files[name] = [...(files[name] ?? []), `${iso(l.timestamp)} ${(l.severity ?? 'info').toUpperCase()} ${l.message}`];
  }
  return Object.fromEntries(Object.entries(files).map(([name, lines]) => [name, lines.join('\n')]));
}

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

describe('arguments', () => {
  it('reads files and options, with or without the word "analyze"', () => {
    expect(parseArgs(['analyze', 'a.log', 'b.log', '--top', '3', '--json', '--start', '1700000000'])).toEqual({ files: ['a.log', 'b.log'], top: 3, json: true, start: 1_700_000_000 });
    expect(parseArgs(['a.log'])).toMatchObject({ files: ['a.log'], top: 5, json: false });
    expect(parseArgs(['--help'])).toBe('help');
  });

  it('rejects bad input with a clear message', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['a.log', '--top', '0'])).toThrow(/whole number/);
    expect(() => parseArgs(['a.log', '--start', 'soon'])).toThrow(/not a time/);
    expect(() => parseArgs(['a.log', '--nope'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['a.log', '--top'])).toThrow(/needs a value/);
  });
});

describe('run', () => {
  const incident = simulateIncident({ seed: 3, service: 'db', fault: 'disk' });
  const files = plainFiles(incident);
  const read = (path: string): string => files[path.split('/').pop() as string] as string;
  const paths = Object.keys(files).map((f) => `/logs/${f}`);

  it('ranks the broken service first from plain-text files, with evidence', () => {
    const out: string[] = [];
    const code = run([...paths, '--start', String(incident.incidentStart)], (t) => out.push(t), read);
    expect(code).toBe(0);
    const report = out.join('\n');
    expect(report).toMatch(/1\. db /);
    expect(report).toMatch(/no space left on device/);
    expect(report).toMatch(/\(given\)/);
    expect(report).toMatch(/not probabilities/);
  });

  it('estimates the start when none is given and says so', () => {
    const out: string[] = [];
    expect(run(paths, (t) => out.push(t), read)).toBe(0);
    expect(out.join('\n')).toMatch(/estimated from the logs/);
  });

  it('prints JSON on request', () => {
    const out: string[] = [];
    run([...paths, '--json', '--start', String(incident.incidentStart)], (t) => out.push(t), read);
    const parsed = JSON.parse(out.join('')) as { candidates: Array<{ service: string }>; modelId: string };
    expect(parsed.candidates[0]?.service).toBe('db');
    expect(parsed.modelId).toBe('rootrank-v1');
  });

  it('limits the list with --top and mentions what is hidden', () => {
    const out: string[] = [];
    run([...paths, '--top', '2', '--start', String(incident.incidentStart)], (t) => out.push(t), read);
    expect(out.join('\n')).toMatch(/4 more services not shown/);
  });

  it('exits 2 with usage for bad arguments, for logs too short to estimate from, and for empty files', () => {
    const out: string[] = [];
    expect(run([], (t) => out.push(t))).toBe(2);
    expect(out.join('')).toMatch(/Usage:/);
    const short = '2026-01-02T03:04:05Z a\n2026-01-02T03:05:05Z b';
    expect(run(['/x/api.log'], (t) => out.push(t), () => short)).toBe(2);
    expect(run(['/x/api.log'], (t) => out.push(t), () => 'no times here')).toBe(2);
    expect(run(['--help'], (t) => out.push(t))).toBe(0);
  });

  it('reports a file that cannot be read as an error, exit code 1', () => {
    const out: string[] = [];
    expect(run(['/nope/api.log'], (t) => out.push(t))).toBe(1);
    expect(out.join('')).toMatch(/^Error:/);
  });
});

describe('formatReport / loadLines', () => {
  it('loads several files and totals the skipped lines', () => {
    const loaded = loadLines(['a.log', 'b.log'], (p) => (p === 'a.log' ? 'junk\n2026-01-02T03:04:05Z x' : '2026-01-02T03:04:06Z y'));
    expect(loaded.lines.map((l) => l.service)).toEqual(['a', 'b']);
    expect(loaded.skipped).toBe(1);
  });

  it('formats a report for a result', () => {
    const text = formatReport({ incidentStart: 0, startSource: 'given', candidates: [], baselineLines: 0, incidentLines: 0, modelId: 'm' }, 5, 2);
    expect(text).toMatch(/Skipped 2 lines/);
  });
});
