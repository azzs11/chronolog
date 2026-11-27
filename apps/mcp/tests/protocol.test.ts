import { handle, PROTOCOL_VERSION } from '../src/protocol';
import type { Fetcher } from '../src/tools';

const cause = (service: string, rank: number, weight: number) => ({
  service, rank, weight, score: weight, features: {},
  evidence: { firstErrorAfter: 12, firstNovelAfter: null, novelTemplates: [], mentions: 0, errorLines: 31, firstErrorId: `id-${service}` },
});

const fake: Fetcher = async (path) => {
  if (path.startsWith('/api/incidents?')) return [{ id: 'inc-1', start: 'a', end: 'b', services: ['db'], errorLines: 40 }];
  if (path === '/api/incidents/inc-1') return { ranking: { candidates: [cause('db', 1, 0.6), cause('api', 2, 0.3)] } };
  if (path.startsWith('/api/logs?')) {
    expect(path).toContain('search=disk');
    return [{ id: 'L1', timestamp: 't', source: 'db', severity: 'error', message: 'disk full' }];
  }
  throw new Error(`unexpected ${path}`);
};

const call = (name: string, args: Record<string, unknown> = {}) => handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, fake);
const text = (r: unknown) => ((r as { result: { content: { text: string }[] } }).result.content[0] as { text: string }).text;

describe('MCP protocol', () => {
  it('initializes with tools capability and lists the three tools', async () => {
    const init = await handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} }, fake);
    expect(init).toMatchObject({ result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} } } });
    const list = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, fake)) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(['list_incidents', 'explain_incident', 'search_logs']);
  });

  it('ignores notifications and rejects unknown methods', async () => {
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, fake)).toBeNull();
    expect(await handle({ jsonrpc: '2.0', id: 2, method: 'nope' }, fake)).toMatchObject({ error: { code: -32601 } });
  });

  it('explain_incident cites log ids for every evidence claim', async () => {
    const out = text(await call('explain_incident', { id: 'inc-1' }));
    expect(out).toContain('#1 db (likely, weight 0.60)');
    expect(out).toContain('[log id-db]');
    expect(out).toContain('not proof');
  });

  it('list_incidents and search_logs return lines with ids', async () => {
    expect(text(await call('list_incidents'))).toContain('inc-1');
    expect(text(await call('search_logs', { query: 'disk' }))).toBe('[L1] t db error: disk full');
  });

  it('reports tool errors as isError results, not protocol errors', async () => {
    const r = (await call('explain_incident', {})) as { result: { isError: boolean } };
    expect(r.result.isError).toBe(true);
  });
});
