import request from 'supertest';
import app from '../src/app';

process.env.ADMIN_API_KEY = 'test-admin-key';

interface UnusualRow {
  template: string;
  count: number;
  baselineCount: number;
  services: string[];
  lineIds: string[];
}

describe('GET /api/anomalies/unusual', () => {
  beforeAll(async () => {
    const injected = await request(app).post('/api/rca/incident').set({ 'X-API-Key': 'test-admin-key' }).send({ service: 'db', fault: 'disk', seed: 5 });
    expect(injected.status).toBe(201);
  });

  it('lists unusual messages from the injected fault, citing stored log ids', async () => {
    const res = await request(app).get('/api/anomalies/unusual');
    expect(res.status).toBe(200);
    const data = res.body.data as { recentSeconds: number; baselineLines: number; templates: UnusualRow[] };
    expect(data.recentSeconds).toBe(300);
    expect(data.baselineLines).toBeGreaterThan(0);
    expect(data.templates.length).toBeGreaterThan(0);
    const all = data.templates.flatMap((t) => t.services);
    expect(all).toContain('db');
    for (const t of data.templates) expect(t.lineIds.length).toBeGreaterThan(0);
  });
});
