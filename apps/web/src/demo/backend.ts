/**
 * The API, answered in the browser for the static demo. Each route does what its server
 * counterpart in apps/api does (same engine functions, same response shapes), but over the
 * simulated world instead of a database. Feedback lives in memory for the visit.
 */
import {
  BASELINE_S,
  type Burst,
  RECENT_S,
  ROOTRANK_V1,
  type SimService,
  WindowTooShortError,
  findErrorBursts,
  learnServiceGraph,
  rankRootCauses,
  serviceMoods,
  timelineOf,
} from '@chronolog/engine';
import { type DemoLine, DemoWorld } from './world';

// The same windows as the API (apps/api/src/services/incidents.ts and rootRank.ts).
const INCIDENT_LOOKBACK_MIN = 60;
const BASELINE_BEFORE_S = 600;
const MARGIN_AFTER_S = 120;
const TIMELINE_BUCKET_S = 30;
const RANK_LOOKBACK_MIN = 15;
const MAX_LOOKBACK_MIN = 24 * 60;

export interface DemoRequest {
  method: string;
  /** Path starting with /api. */
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

export interface DemoResponse {
  status: number;
  body: unknown;
}

interface Feedback {
  verdict: 'confirm' | 'reject';
  correctService: string;
  rankOfCorrect: number | null;
}

const ok = (data: unknown, status = 200): DemoResponse => ({ status, body: { status: 'success', data } });
const fail = (status: number, message: string, code?: string): DemoResponse => ({ status, body: { status: 'error', message, ...(code ? { code } : {}) } });

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString();
const toRaw = (l: DemoLine) => ({ id: l.id, message: l.message, severity: l.severity, source: l.service, timestamp: iso(l.timestamp) });

function minutes(query: URLSearchParams, fallback: number): number {
  const asked = Number(query.get('lookback_minutes') ?? fallback);
  return Number.isFinite(asked) && asked >= 1 ? Math.min(asked, MAX_LOOKBACK_MIN) : fallback;
}

export class DemoBackend {
  readonly world: DemoWorld;
  private readonly feedback = new Map<string, Feedback>();

  /** @param clock Unix milliseconds now (injected so tests can move time). */
  constructor(private readonly clock: () => number = Date.now) {
    this.world = new DemoWorld(this.now());
  }

  private now(): number {
    return this.clock() / 1000;
  }

  handle(req: DemoRequest): DemoResponse {
    const { method, path, query, body } = req;
    const incident = /^\/api\/incidents\/(inc-\d+)(\/feedback)?$/.exec(path);
    if (method === 'GET' && path === '/api/logs') return ok(this.world.latest(Number(query.get('limit') ?? 100), this.now()).map(toRaw));
    if (method === 'GET' && path === '/api/moods') return ok(this.moods());
    if (method === 'GET' && path === '/api/rca/graph') return this.graph(minutes(query, RANK_LOOKBACK_MIN));
    if (method === 'POST' && path === '/api/rca/rank') return this.rank(body);
    if (method === 'POST' && path === '/api/rca/incident') return this.inject(body);
    if (method === 'GET' && path === '/api/incidents') return ok(this.bursts(minutes(query, INCIDENT_LOOKBACK_MIN)).map((b) => this.summarise(b)));
    if (method === 'GET' && path === '/api/incidents/feedback/summary') return ok(this.summary());
    if (method === 'GET' && incident && !incident[2]) return this.detail(incident[1] as string);
    if (method === 'POST' && incident?.[2]) return this.recordFeedback(incident[1] as string, body);
    return fail(404, `The demo has no ${method} ${path}: it needs the self-hosted app.`);
  }

  private since(minutesBack: number): DemoLine[] {
    const now = this.now();
    return this.world.linesBetween(now - minutesBack * 60, now, now);
  }

  private moods() {
    const now = this.now();
    const lines = this.world.linesBetween(now - RECENT_S - BASELINE_S, now, now);
    return { at: iso(now), recentSeconds: RECENT_S, baselineSeconds: BASELINE_S, lines: lines.length, isTruncated: false, moods: serviceMoods(lines, now) };
  }

  private graph(lookback: number): DemoResponse {
    const lines = this.since(lookback);
    if (lines.length === 0) return fail(422, 'No logs in the requested window.', 'no_logs');
    return ok({ ...learnServiceGraph(lines), lines: lines.length });
  }

  private rank(body: Record<string, unknown>): DemoResponse {
    const lines = this.since(Math.min(Number(body.lookback_minutes ?? RANK_LOOKBACK_MIN), MAX_LOOKBACK_MIN));
    if (lines.length === 0) return fail(422, 'No logs in the requested window.', 'no_logs');
    const given = body.incident_start;
    const start = given === undefined ? undefined : typeof given === 'number' ? given : Date.parse(String(given)) / 1000;
    try {
      const result = rankRootCauses(lines, start, ROOTRANK_V1);
      const warnings: string[] = [];
      if (result.startSource === 'estimated') warnings.push('The incident start was estimated from the logs. Pass incident_start if you know it: accuracy is higher.');
      if (result.baselineLines === 0) warnings.push('No log lines before the incident start, so nothing shows what normal looked like.');
      return ok({ ...result, model: { id: ROOTRANK_V1.id, trainedOn: ROOTRANK_V1.trained_on }, warnings });
    } catch (err) {
      if (err instanceof WindowTooShortError) return fail(422, err.message, 'window_too_short');
      throw err;
    }
  }

  private inject(body: Record<string, unknown>): DemoResponse {
    const choice = body.service && body.fault ? { service: body.service as SimService, fault: body.fault as never } : undefined;
    try {
      const seed = typeof body.seed === 'number' ? body.seed : undefined;
      const known = this.world.inject(this.now(), choice, seed);
      const lines = this.world.linesBetween(known.start - 240, known.start + 240, this.now()).length;
      return ok({ truth: { service: known.service, fault: known.fault }, seed: seed ?? 0, lines, incidentStart: iso(known.start) }, 201);
    } catch (err) {
      return fail(400, err instanceof Error ? err.message : String(err));
    }
  }

  private bursts(lookback: number): Burst[] {
    return findErrorBursts(this.since(lookback));
  }

  private summarise(burst: Burst) {
    const id = `inc-${burst.start}`;
    const fb = this.feedback.get(id);
    return {
      id,
      start: iso(burst.start),
      end: iso(burst.end),
      durationSeconds: burst.end - burst.start,
      errorLines: burst.errorLines,
      services: burst.services,
      impact: burst.impact,
      status: fb ? (fb.verdict === 'confirm' ? 'confirmed' : 'rejected') : 'unreviewed',
      correctService: fb?.correctService ?? null,
    };
  }

  private detail(id: string): DemoResponse {
    const burst = this.bursts(MAX_LOOKBACK_MIN).find((b) => `inc-${b.start}` === id);
    if (!burst) return fail(404, 'That incident is no longer in the simulated logs (the demo keeps about an hour).');
    const windowStart = burst.start - BASELINE_BEFORE_S;
    const lines = this.world.linesBetween(windowStart, burst.end + MARGIN_AFTER_S, this.now());
    const ranking = rankRootCauses(lines, burst.start, ROOTRANK_V1);
    return ok({ incident: this.summarise(burst), ranking, timeline: timelineOf(lines, burst.start, TIMELINE_BUCKET_S), graph: learnServiceGraph(lines), windowLines: lines.length });
  }

  private recordFeedback(id: string, body: Record<string, unknown>): DemoResponse {
    const found = this.detail(id);
    if (found.status !== 200) return found;
    const candidates = (found.body as { data: { ranking: { candidates: Array<{ service: string }> } } }).data.ranking.candidates;
    const verdict = body.verdict === 'reject' ? 'reject' : 'confirm';
    const correct = typeof body.correct_service === 'string' ? body.correct_service : verdict === 'confirm' ? candidates[0]?.service : undefined;
    if (!correct) return fail(400, 'Say which service was the real cause.');
    const at = candidates.findIndex((c) => c.service === correct);
    const saved: Feedback = { verdict, correctService: correct, rankOfCorrect: at < 0 ? null : at + 1 };
    this.feedback.set(id, saved);
    return ok(saved, 201);
  }

  private summary() {
    const all = [...this.feedback.values()];
    return {
      reviewed: all.length,
      confirmed: all.filter((f) => f.verdict === 'confirm').length,
      rejected: all.filter((f) => f.verdict === 'reject').length,
      top1: all.filter((f) => f.rankOfCorrect === 1).length,
      top3: all.filter((f) => f.rankOfCorrect !== null && f.rankOfCorrect <= 3).length,
    };
  }
}
