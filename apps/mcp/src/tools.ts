/**
 * The three tools. Each one calls the ChronoLog API and returns text an agent can quote: every
 * claim about a cause comes with the log ids behind it, so an agent can cite instead of guessing.
 */
import { confidenceWord, evidenceClaims, type RankedCause } from '@chronolog/engine';

export type Fetcher = (path: string) => Promise<unknown>;

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, get: Fetcher): Promise<string>;
}

const MAX_SEARCH = 50;

interface Summary {
  id: string;
  start: string;
  end: string;
  services: string[];
  errorLines: number;
  topCandidate?: string | null;
  status?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

export const TOOLS: Tool[] = [
  {
    name: 'list_incidents',
    description: 'List recent incidents (bursts of error lines) found in the stored logs, biggest impact first.',
    inputSchema: { type: 'object', properties: { lookback_minutes: { type: 'number', description: 'How far back to look (default 60).' } } },
    async run(args, get) {
      const minutes = typeof args.lookback_minutes === 'number' ? Math.max(1, Math.round(args.lookback_minutes)) : 60;
      const list = (await get(`/api/incidents?lookback_minutes=${minutes}`)) as Summary[];
      if (list.length === 0) return `No incidents in the last ${minutes} minutes.`;
      return list
        .map((i) => `${i.id}: ${i.start} to ${i.end}, ${i.errorLines} error lines from ${i.services.join(', ')}; review status ${i.status ?? 'unreviewed'}`)
        .join('\n');
    },
  },
  {
    name: 'explain_incident',
    description:
      'Rank the likely root-cause services of one incident (RootRank) with the evidence for each, citing log ids. A best guess from logs, not proof.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Incident id from list_incidents, e.g. inc-1732600000.' } }, required: ['id'] },
    async run(args, get) {
      const id = str(args.id);
      if (!id) throw new Error('id is required');
      const detail = (await get(`/api/incidents/${encodeURIComponent(id)}`)) as { ranking: { candidates: RankedCause[] } };
      const top = detail.ranking.candidates.slice(0, 3);
      const lines = [`Incident ${id}: ${detail.ranking.candidates.length} services ranked. Top suspects (a best guess from logs, not proof):`];
      for (const c of top) {
        lines.push(`#${c.rank} ${c.service} (${confidenceWord(c.weight, c.rank)}, weight ${c.weight.toFixed(2)})`);
        for (const claim of evidenceClaims(c)) {
          lines.push(`  - ${claim.text}${claim.cites.length ? ` [log ${claim.cites.join(', ')}]` : ' [no log id]'}`);
        }
      }
      return lines.join('\n');
    },
  },
  {
    name: 'search_logs',
    description: 'Search stored log lines by text, service and severity. Returns each line with its id.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to look for in the message.' },
        service: { type: 'string' },
        severity: { type: 'string', enum: ['debug', 'info', 'warning', 'error', 'critical'] },
        limit: { type: 'number', description: `At most ${MAX_SEARCH}.` },
      },
    },
    async run(args, get) {
      const params = new URLSearchParams();
      const limit = typeof args.limit === 'number' ? Math.min(MAX_SEARCH, Math.max(1, Math.round(args.limit))) : 20;
      params.set('limit', String(limit));
      for (const [key, param] of [['query', 'search'], ['service', 'source'], ['severity', 'severity']] as const) {
        const value = str(args[key]);
        if (value) params.set(param, value);
      }
      const logs = (await get(`/api/logs?${params}`)) as { id: string; timestamp: string; source: string; severity: string; message: string }[];
      if (logs.length === 0) return 'No matching log lines.';
      return logs.map((l) => `[${l.id}] ${l.timestamp} ${l.source} ${l.severity}: ${l.message}`).join('\n');
    },
  },
];
