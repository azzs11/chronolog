import request from 'supertest';
import app from '../src/app';

process.env.ADMIN_API_KEY = 'test-admin-key';

interface MoodRow {
  service: string;
  mood: string;
  reason: string;
  evidenceIds: string[];
}

describe('GET /api/moods', () => {
  beforeAll(async () => {
    const injected = await request(app).post('/api/rca/incident').set({ 'X-API-Key': 'test-admin-key' }).send({ service: 'db', fault: 'disk', seed: 5 });
    expect(injected.status).toBe(201);
  });

  it('returns every service with a mood, a reason and the window it used', async () => {
    const res = await request(app).get('/api/moods');
    expect(res.status).toBe(200);
    const data = res.body.data as { recentSeconds: number; baselineSeconds: number; lines: number; moods: MoodRow[] };
    expect(data.recentSeconds).toBe(120);
    expect(data.baselineSeconds).toBe(900);
    expect(data.lines).toBeGreaterThan(100);
    expect(data.moods.length).toBeGreaterThanOrEqual(5);
    for (const m of data.moods) expect(m.reason.length).toBeGreaterThan(0);
  });

  it('shows the disk fault on the broken service, worst mood first, citing stored log ids', async () => {
    const res = await request(app).get('/api/moods');
    const moods = (res.body.data as { moods: MoodRow[] }).moods;
    const db = moods.find((m) => m.service === 'db') as MoodRow;
    expect(db.mood).toBe('sick');
    expect(moods[0]?.mood).toBe('sick');
    expect(db.evidenceIds.length).toBeGreaterThan(0);
  });
});
