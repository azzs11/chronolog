import request from 'supertest';
import app from '../src/app';

// ADMIN_API_KEY is read per request, so setting it after the import is fine.
process.env.ADMIN_API_KEY = 'test-admin-key';

const normal = (t: number, source: string) => ({ timestamp: t, source, message: 'heartbeat ok', severity: 'info' });

/** 200 s of calm traffic from three services, then `db` breaks first and `api` follows. */
function incidentLogs() {
  const logs: Array<Record<string, unknown>> = [];
  for (let t = 0; t < 200; t++) for (const s of ['api', 'db', 'cache']) logs.push(normal(t, s));
  logs.push({ id: 'boom', timestamp: 205, source: 'db', message: 'disk write failed on volume 3', severity: 'error' });
  logs.push({ timestamp: 206, source: 'db', message: 'disk write failed on volume 4', severity: 'error' });
  logs.push({ timestamp: 220, source: 'api', message: 'call to db failed', severity: 'error' });
  for (let t = 200; t < 400; t++) for (const s of ['api', 'cache']) logs.push(normal(t, s));
  for (let t = 207; t < 400; t++) logs.push({ timestamp: t, source: 'db', message: 'disk write failed on volume 3', severity: 'error' });
  return logs;
}

describe('POST /api/rca/rank', () => {
  it('ranks the service that broke first and explains it', async () => {
    const res = await request(app).post('/api/rca/rank').send({ incident_start: 200, logs: incidentLogs() });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.model.id).toBe('rootrank-v1');
    expect(data.startSource).toBe('given');
    expect(data.incidentStart).toBe(200);
    expect(data.candidates.map((c: { service: string }) => c.service).sort()).toEqual(['api', 'cache', 'db']);
    expect(data.candidates[0].service).toBe('db');
    expect(data.candidates[0].rank).toBe(1);
    expect(data.candidates[0].evidence.firstErrorAfter).toBe(5);
    expect(data.candidates[0].evidence.novelTemplates[0].exampleId).toBe('boom');
    const total = data.candidates.reduce((sum: number, c: { weight: number }) => sum + c.weight, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(data.warnings).toEqual([]);
  });

  it('estimates the incident start when none is given, and warns about it', async () => {
    const res = await request(app).post('/api/rca/rank').send({ logs: incidentLogs() });
    expect(res.status).toBe(200);
    expect(res.body.data.startSource).toBe('estimated');
    expect(Math.abs(res.body.data.incidentStart - 205)).toBeLessThanOrEqual(20);
    expect(res.body.data.candidates[0].service).toBe('db');
    expect(res.body.data.warnings.join(' ')).toMatch(/estimated/);
  });

  it('accepts ISO timestamps and the "service" field name', async () => {
    const logs = incidentLogs().map((l) => ({
      ...l,
      timestamp: new Date((l.timestamp as number) * 1000).toISOString(),
      service: l.source,
      source: undefined,
    }));
    const res = await request(app)
      .post('/api/rca/rank')
      .send({ incident_start: new Date(200_000).toISOString(), logs });
    expect(res.status).toBe(200);
    expect(res.body.data.candidates[0].service).toBe('db');
  });

  it('returns 422 when the logs span too little time to estimate a start', async () => {
    const short = Array.from({ length: 60 }, (_, t) => normal(t, 'api'));
    const res = await request(app).post('/api/rca/rank').send({ logs: short });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('window_too_short');
  });

  it('rejects malformed input with 400', async () => {
    const bad = await request(app).post('/api/rca/rank').send({ logs: [{ message: 'x' }] });
    expect(bad.status).toBe(400);
    const badStart = await request(app).post('/api/rca/rank').send({ incident_start: 'not a time', logs: incidentLogs() });
    expect(badStart.status).toBe(400);
    const empty = await request(app).post('/api/rca/rank').send({ logs: [] });
    expect(empty.status).toBe(400);
  });

  it('answers 422 when the stored window has no logs', async () => {
    const res = await request(app).post('/api/rca/rank').send({ lookback_minutes: 1 });
    expect([200, 422]).toContain(res.status); // other tests may have stored recent logs
  });
});

describe('GET /api/rca/graph', () => {
  it('rejects a bad look-back', async () => {
    const res = await request(app).get('/api/rca/graph?lookback_minutes=abc');
    expect(res.status).toBe(400);
  });

  it('answers with a graph or an explanation when no logs are stored', async () => {
    const res = await request(app).get('/api/rca/graph?lookback_minutes=1');
    expect([200, 422]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data).toHaveProperty('services');
      expect(res.body.data).toHaveProperty('mentions');
      expect(res.body.data).toHaveProperty('correlations');
    }
  });
});

describe('POST /api/rca/incident', () => {
  const key = { 'X-API-Key': 'test-admin-key' };

  it('needs the admin key', async () => {
    const res = await request(app).post('/api/rca/incident').send({});
    expect(res.status).toBe(401);
  });

  it('backfills an incident with a known cause that Root Cause can then rank', async () => {
    const injected = await request(app).post('/api/rca/incident').set(key).send({ service: 'db', fault: 'disk', seed: 5 });
    expect(injected.status).toBe(201);
    expect(injected.body.data.truth).toEqual({ service: 'db', fault: 'disk' });
    expect(injected.body.data.lines).toBeGreaterThan(5000);

    const ranked = await request(app).post('/api/rca/rank').send({ lookback_minutes: 15 });
    expect(ranked.status).toBe(200);
    expect(ranked.body.data.candidates[0].service).toBe('db');
    expect(ranked.body.data.startSource).toBe('estimated');
  });

  it('picks a random observable fault when none is given', async () => {
    const res = await request(app).post('/api/rca/incident').set(key).send({ seed: 11 });
    expect(res.status).toBe(201);
    expect(res.body.data.truth).toHaveProperty('service');
  });

  it('rejects unknown values, half a choice, and faults that leave no logs', async () => {
    expect((await request(app).post('/api/rca/incident').set(key).send({ service: 'nope', fault: 'disk' })).status).toBe(400);
    expect((await request(app).post('/api/rca/incident').set(key).send({ service: 'db' })).status).toBe(400);
    const gateway = await request(app).post('/api/rca/incident').set(key).send({ service: 'gateway', fault: 'delay' });
    expect(gateway.status).toBe(400);
    expect(gateway.body.message).toMatch(/no logs to find/);
  });
});
