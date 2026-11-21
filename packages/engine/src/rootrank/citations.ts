/**
 * Which log lines back each piece of a candidate's evidence, so every sentence the app shows can cite
 * real log ids. Computed after ranking from the same lines and templates; it never changes a score.
 */
import { mentionTable, type PreparedLine } from './features';

/** How many lines a claim cites at most. */
export const MAX_CITES = 3;

export interface Citations {
  /** The service's first error line at or after the incident start. */
  firstErrorId?: string;
  /** Lines from other services during the incident whose message names this service. */
  mentionIds: string[];
}

const isError = (severity: string): boolean => severity === 'error' || severity === 'critical';

/** Citations per service, for lines already in time order with their prepared (severity, template) twins. */
export function citeEvidence(
  ids: ReadonlyArray<string | undefined>,
  prepared: readonly PreparedLine[],
  services: string[],
  templates: Map<number, string>,
  start: number,
): Map<string, Citations> {
  const out = new Map<string, Citations>(services.map((s) => [s, { mentionIds: [] }]));
  const targets = mentionTable(services, templates);
  prepared.forEach((line, i) => {
    const id = ids[i];
    if (id === undefined || line.timestamp < start) return;
    const own = out.get(line.service);
    if (own && own.firstErrorId === undefined && isError(line.severity)) own.firstErrorId = id;
    for (const to of targets.get(line.templateId) ?? []) {
      const named = out.get(services[to] as string);
      if (named && services[to] !== line.service && named.mentionIds.length < MAX_CITES) named.mentionIds.push(id);
    }
  });
  return out;
}
