import request from 'supertest';
import app from '../src/app';
import { resetFeedbackMemory } from '../src/db/feedbackRepository';

// ADMIN_API_KEY is read per request, so setting it after the import is fine.
process.env.ADMIN_API_KEY = 'test-admin-key';
const key = { 'X-API-Key': 'test-admin-key' };

interface Listed {
  id: string;
  status: string;
  errorLines: number;
  services: Array<{ service: string }>;
  correctService: string | null;
}

describe('incidents', () => {
  let incidentId = '';

  beforeAll(async () => {
    const injected = await request(app).post('/api/rca/incident').set(key).send({ service: 'db', fault: 'disk', seed: 5 });
    expect(injected.status).toBe(201);
  });

  beforeEach(() => resetFeedbackMemory());

  it('finds the burst of error lines as an incident, with its size and services', async () => {
    const res = await request(app).get('/api/incidents');
    expect(res.status).toBe(200);
    const incidents = res.body.data as Listed[];
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    const top = incidents[0] as Listed;
    incidentId = top.id;
    expect(top.id).toMatch(/^inc-\d+$/);
    expect(top.errorLines).toBeGreaterThan(50);
    expect(top.services.map((s) => s.service)).toContain('db');
    expect(top.status).toBe('unreviewed');
  });

  it('opens an incident with a ranking led by the broken service, a timeline and a learned graph', async () => {
    const res = await request(app).get(`/api/incidents/${incidentId}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.ranking.startSource).toBe('given');
    expect(d.ranking.candidates[0].service).toBe('db');
    expect(d.ranking.candidates[0].features).toHaveProperty('rank_t_first_novel');
    expect(d.timeline.services.map((s: { name: string }) => s.name)).toContain('db');
    expect(d.timeline.startOffset).toBeLessThan(0);
    expect(d.graph.services).toContain('db');
    expect(d.windowLines).toBeGreaterThan(1000);
  });

  it('records a confirmation, marks the incident reviewed, and counts it in the summary', async () => {
    const saved = await request(app).post(`/api/incidents/${incidentId}/feedback`).send({ verdict: 'confirm' });
    expect(saved.status).toBe(201);
    expect(saved.body.data).toEqual({ verdict: 'confirm', correctService: 'db', rankOfCorrect: 1 });

    const list = await request(app).get('/api/incidents');
    expect((list.body.data as Listed[]).find((i) => i.id === incidentId)).toMatchObject({ status: 'confirmed', correctService: 'db' });
    const summary = await request(app).get('/api/incidents/feedback/summary');
    expect(summary.body.data).toEqual({ reviewed: 1, confirmed: 1, rejected: 0, top1: 1, top3: 1 });
  });

  it('records a rejection with the real cause, and keeps only the latest answer per incident', async () => {
    await request(app).post(`/api/incidents/${incidentId}/feedback`).send({ verdict: 'confirm' });
    const rejected = await request(app).post(`/api/incidents/${incidentId}/feedback`).send({ verdict: 'reject', correct_service: 'auth', note: 'it was auth' });
    expect(rejected.status).toBe(201);
    expect(rejected.body.data.correctService).toBe('auth');
    expect(rejected.body.data.rankOfCorrect).toBeGreaterThan(1);
    const summary = await request(app).get('/api/incidents/feedback/summary');
    expect(summary.body.data).toMatchObject({ reviewed: 1, rejected: 1, confirmed: 0, top1: 0 });
  });

  it('stores a service that was not a candidate with no rank', async () => {
    const res = await request(app).post(`/api/incidents/${incidentId}/feedback`).send({ verdict: 'reject', correct_service: 'something-else' });
    expect(res.status).toBe(201);
    expect(res.body.data.rankOfCorrect).toBeNull();
  });

  it('rejects bad feedback and unknown incidents', async () => {
    expect((await request(app).post(`/api/incidents/${incidentId}/feedback`).send({ verdict: 'maybe' })).status).toBe(400);
    expect((await request(app).post(`/api/incidents/${incidentId}/feedback`).send({ verdict: 'reject' })).status).toBe(400);
    expect((await request(app).get('/api/incidents/not-an-id')).status).toBe(404);
    expect((await request(app).get('/api/incidents/inc-100000000')).status).toBe(404);
    expect((await request(app).post('/api/incidents/inc-100000000/feedback').send({ verdict: 'confirm' })).status).toBe(404);
    expect((await request(app).get('/api/incidents?lookback_minutes=abc')).status).toBe(400);
  });
});
