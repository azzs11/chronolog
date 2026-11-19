import type { TemplateGroup } from '@chronolog/engine';
import { filterGroups, filterLogs, NO_FILTERS, servicesOf } from './filters';
import { computeStats, formatAgo, type LiveLog } from './stats';

const NOW = 1_700_000_000_000;
const log = (id: string, severity: string, ageSeconds: number, source = 'api', message = 'm'): LiveLog => ({ id, severity, source, message, time: NOW - ageSeconds * 1000 });
const group = (id: number, over: Partial<TemplateGroup> = {}): TemplateGroup => ({
  id,
  template: `template ${id}`,
  count: 1,
  firstSeen: NOW / 1000 - 10,
  lastSeen: NOW / 1000,
  bySeverity: { info: 1 },
  byService: { api: 1 },
  highestSeverity: 'info',
  samples: ['sample'],
  ...over,
});

describe('computeStats', () => {
  it('counts lines, the recent rate, errors (critical + error) and warnings', () => {
    const logs = [log('1', 'info', 2), log('2', 'error', 5), log('3', 'critical', 50), log('4', 'warning', 3)];
    expect(computeStats(logs, [], new Set(), NOW)).toMatchObject({ lines: 4, errors: 2, warnings: 1, perSecond: 0.3 });
  });

  it('calls a template new only if it appeared after the page opened and recently', () => {
    const groups = [group(1), group(2), group(3, { firstSeen: NOW / 1000 - 10_000 })];
    const stats = computeStats([], groups, new Set([1]), NOW);
    expect(stats.templates).toBe(3);
    expect(stats.newTemplates).toBe(1); // 1 was there at the start; 3 is not recent
  });
});

describe('formatAgo', () => {
  it('uses seconds, minutes and hours, and never goes negative', () => {
    expect(formatAgo(4.4)).toBe('4 s ago');
    expect(formatAgo(125)).toBe('2 min ago');
    expect(formatAgo(7300)).toBe('2 h ago');
    expect(formatAgo(-5)).toBe('0 s ago');
  });
});

describe('filters', () => {
  const groups = [
    group(1, { bySeverity: { error: 2 }, highestSeverity: 'error', byService: { db: 2 }, template: 'connection refused' }),
    group(2, { bySeverity: { info: 5 }, byService: { api: 5 }, samples: ['user 5 logged in'] }),
  ];

  it('filters groups by severity, service and text (template or samples)', () => {
    expect(filterGroups(groups, { ...NO_FILTERS, severities: new Set(['error']) }).map((g) => g.id)).toEqual([1]);
    expect(filterGroups(groups, { ...NO_FILTERS, service: 'api' }).map((g) => g.id)).toEqual([2]);
    expect(filterGroups(groups, { ...NO_FILTERS, query: 'LOGGED IN' }).map((g) => g.id)).toEqual([2]);
    expect(filterGroups(groups, NO_FILTERS)).toHaveLength(2);
  });

  it('filters raw logs the same way and lists the services seen', () => {
    const logs = [log('1', 'error', 1, 'db', 'refused'), log('2', 'info', 1, 'api', 'hello')];
    expect(filterLogs(logs, { ...NO_FILTERS, severities: new Set(['info']) }).map((l) => l.id)).toEqual(['2']);
    expect(filterLogs(logs, { ...NO_FILTERS, query: 'refus' }).map((l) => l.id)).toEqual(['1']);
    expect(servicesOf(groups)).toEqual(['api', 'db']);
  });
});
