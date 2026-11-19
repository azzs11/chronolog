import type { TemplateGroup } from '@chronolog/engine';
import type { LiveLog } from './stats';

export interface Filters {
  /** Severities to show; empty means all. */
  severities: ReadonlySet<string>;
  service: string;
  query: string;
}

export const NO_FILTERS: Filters = { severities: new Set(), service: '', query: '' };

const matches = (text: string, query: string): boolean => text.toLowerCase().includes(query.trim().toLowerCase());

export function filterGroups(groups: TemplateGroup[], filters: Filters): TemplateGroup[] {
  return groups.filter((group) => {
    if (filters.severities.size > 0 && !Object.keys(group.bySeverity).some((s) => filters.severities.has(s))) return false;
    if (filters.service && !(filters.service in group.byService)) return false;
    if (filters.query.trim() && !matches(group.template, filters.query) && !group.samples.some((s) => matches(s, filters.query))) return false;
    return true;
  });
}

export function filterLogs(logs: LiveLog[], filters: Filters): LiveLog[] {
  return logs.filter((log) => {
    if (filters.severities.size > 0 && !filters.severities.has(log.severity)) return false;
    if (filters.service && log.source !== filters.service) return false;
    if (filters.query.trim() && !matches(log.message, filters.query)) return false;
    return true;
  });
}

/** Every service seen in the groups, sorted, for the service filter. */
export function servicesOf(groups: TemplateGroup[]): string[] {
  return [...new Set(groups.flatMap((g) => Object.keys(g.byService)))].sort();
}
