import axios from 'axios';
import { vi } from 'vitest';
import { DemoBackend, type DemoRequest } from './backend';
import { demoAdapter } from './install';
import { DemoWorld, INJECT_BASELINE_S, INJECT_FAULT_S, OPENING_SCHEDULE } from './world';

const OPENED = 1_800_000_000; // Unix seconds

const get = (path: string, query = ''): DemoRequest => ({ method: 'GET', path, query: new URLSearchParams(query), body: {} });
const post = (path: string, body: Record<string, unknown> = {}): DemoRequest => ({ method: 'POST', path, query: new URLSearchParams(), body });
const data = <T>(res: { body: unknown }): T => (res.body as { data: T }).data;

describe('DemoWorld', () => {
  const world = new DemoWorld(OPENED);

  it('places every fault of the opening schedule on the clock', () => {
    expect(world.known.map((k) => [k.service, k.fault, k.start - OPENED])).toEqual(
      OPENING_SCHEDULE.filter((s) => s.fault).map((s) => [s.fault?.service, s.fault?.fault, s.offset]),
    );
  });

  it('never returns lines from the future, and keeps ids unique and time ordered', () => {
    const lines = world.linesBetween(OPENED - 3600, OPENED + 3600, OPENED);
    expect(lines.length).toBeGreaterThan(10_000);
    expect(Math.max(...lines.slice(-10).map((l) => l.timestamp))).toBeLessThanOrEqual(OPENED);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(lines.every((l, i) => i === 0 || (lines[i - 1]?.timestamp ?? 0) <= l.timestamp)).toBe(true);
  });

  it('keeps generating normal traffic as the clock moves on', () => {
    const later = OPENED + 3 * 3600;
    const recent = world.linesBetween(later - 60, later, later);
    expect(recent.length).toBeGreaterThan(100);
    expect(recent.every((l) => l.severity === 'info')).toBe(true);
  });

  it('injects a known fault over the last 8 minutes without doubling the traffic', () => {
    const w = new DemoWorld(OPENED);
    const now = OPENED + 1200;
    const before = w.linesBetween(now - 480, now, now).length;
    const known = w.inject(now, { service: 'orders', fault: 'disk' }, 5);
    expect(known).toEqual({ service: 'orders', fault: 'disk', start: now - INJECT_FAULT_S });
    const after = w.linesBetween(now - INJECT_BASELINE_S - INJECT_FAULT_S, now, now);
    expect(after.length / before).toBeGreaterThan(0.8);
    expect(after.length / before).toBeLessThan(1.25);
    expect(after.some((l) => l.service === 'orders' && l.message.includes('no space left'))).toBe(true);
    expect(() => w.inject(now, { service: 'gateway', fault: 'delay' })).toThrow(/no logs/);
  });

  it('stops a fault that is still running when another is injected over it', () => {
    const w = new DemoWorld(OPENED); // the opening cart loss fault runs until OPENED + 120
    const now = OPENED + 30;
    w.inject(now, { service: 'db', fault: 'disk' }, 9);
    expect(w.known.map((k) => k.service)).toEqual(['catalog', 'db']);
    const after = w.linesBetween(OPENED - 600, OPENED + 600, OPENED + 600);
    expect(after.some((l) => l.message.includes('request to cart'))).toBe(false);
    const future = w.linesBetween(now + 1, now + 300, now + 300);
    expect(future.length).toBeGreaterThan(1000);
    expect(future.every((l) => l.severity === 'info')).toBe(true);
  });
});

describe('DemoBackend', () => {
  const backend = new DemoBackend(() => OPENED * 1000);

  it('finds both opening incidents in the inbox, and opens each as a case file with the faulty service among the suspects', () => {
    const incidents = data<Array<{ id: string; services: Array<{ service: string }> }>>(backend.handle(get('/api/incidents')));
    expect(incidents).toHaveLength(2);
    for (const incident of incidents) {
      const detail = data<{ ranking: { candidates: Array<{ service: string }> }; timeline: { services: unknown[] } }>(backend.handle(get(`/api/incidents/${incident.id}`)));
      const suspects = detail.ranking.candidates.map((c) => c.service);
      expect(suspects).toHaveLength(6);
      expect(backend.world.known.some((k) => suspects.includes(k.service))).toBe(true);
      expect(detail.timeline.services).toHaveLength(6);
    }
  });

  it('stores feedback for the visit and counts it in the summary', () => {
    const [first] = data<Array<{ id: string }>>(backend.handle(get('/api/incidents')));
    expect(backend.handle(post(`/api/incidents/${first?.id}/feedback`, { verdict: 'confirm' })).status).toBe(201);
    expect(data<{ reviewed: number; confirmed: number }>(backend.handle(get('/api/incidents/feedback/summary')))).toMatchObject({ reviewed: 1, confirmed: 1 });
    expect(data<Array<{ status: string }>>(backend.handle(get('/api/incidents')))[0]?.status).toBe('confirmed');
  });

  it('answers moods, the learned graph, recent logs and a ranking like the API does', () => {
    expect(data<{ moods: unknown[] }>(backend.handle(get('/api/moods'))).moods).toHaveLength(6);
    expect(data<{ services: string[] }>(backend.handle(get('/api/rca/graph', 'lookback_minutes=15'))).services).toHaveLength(6);
    const logs = data<Array<{ id: string; source: string; timestamp: string }>>(backend.handle(get('/api/logs', 'limit=200')));
    expect(logs).toHaveLength(200);
    expect(Date.parse(logs[199]?.timestamp ?? '')).toBeLessThanOrEqual(OPENED * 1000);
    const rank = data<{ candidates: unknown[]; startSource: string; warnings: string[] }>(backend.handle(post('/api/rca/rank', { lookback_minutes: 15 })));
    expect(rank.startSource).toBe('estimated');
    expect(rank.candidates).toHaveLength(6);
    expect(rank.warnings[0]).toMatch(/estimated/);
  });

  it('says plainly what the demo cannot do', () => {
    expect(backend.handle(get('/api/incidents/inc-123')).status).toBe(404);
    const res = backend.handle(get('/api/logs/stats'));
    expect(res.status).toBe(404);
    expect((res.body as { message: string }).message).toMatch(/self-hosted/);
  });

  it('injects a test incident that then shows up in the inbox', () => {
    const b = new DemoBackend(() => (OPENED + 1800) * 1000);
    const res = b.handle(post('/api/rca/incident', { service: 'db', fault: 'disk', seed: 3 }));
    expect(res.status).toBe(201);
    expect(data<{ truth: { service: string } }>(res).truth.service).toBe('db');
    const incidents = data<Array<{ services: Array<{ service: string }> }>>(b.handle(get('/api/incidents')));
    expect(incidents.some((i) => i.services.some((s) => s.service === 'db'))).toBe(true);
  });
});

describe('demoAdapter', () => {
  const client = axios.create({ adapter: demoAdapter(new DemoBackend(() => OPENED * 1000)) });

  it('returns the API envelope for a known route, with params merged into the query', async () => {
    const res = await client.get('http://localhost:5000/api/logs', { params: { limit: 3 } });
    expect(res.data.data).toHaveLength(3);
  });

  it('rejects with an axios error carrying the server message', async () => {
    const err = await client.get('http://localhost:5000/api/nope').catch((e: unknown) => e);
    expect(axios.isAxiosError(err)).toBe(true);
    expect((err as { response: { status: number; data: { message: string } } }).response.status).toBe(404);
  });
});

describe('demo socket', () => {
  afterEach(() => vi.useRealTimers());

  it('delivers each simulated line once, when the clock reaches it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(OPENED * 1000);
    vi.resetModules();
    const { default: socket } = await import('./socket');
    const received: Array<{ id: string; timestamp: string }> = [];
    socket.onNewLog(((log: { id: string; timestamp: string }) => received.push(log)) as never);
    const states: boolean[] = [];
    socket.onConnectionChange((c) => states.push(c));
    socket.connect();
    vi.advanceTimersByTime(5000);
    expect(states).toEqual([false, true]);
    expect(received.length).toBeGreaterThan(20);
    expect(new Set(received.map((r) => r.id)).size).toBe(received.length);
    expect(received.every((r) => Date.parse(r.timestamp) > OPENED * 1000)).toBe(true);
    socket.disconnect();
  });
});
