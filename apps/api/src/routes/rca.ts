import { Router, type Request, type Response } from 'express';
import type { RcaLine } from '@chronolog/engine';
import { requireApiKey } from '../middleware/apiKeyAuth';
import { rcaLimiter } from '../middleware/rateLimiter';
import { validateInjectIncident, validateRcaRank } from '../middleware/validation';
import { UnobservableFaultError, injectIncident } from '../services/incidentInjector';
import { DEFAULT_LOOKBACK_MINUTES, MAX_LOOKBACK_MINUTES, RcaError, learnGraph, rankIncident } from '../services/rootRank';
import { errorMessage } from './http';

const router = Router();

/** A timestamp sent as Unix seconds or an ISO string, as Unix seconds. */
const toSeconds = (value: unknown): number =>
  typeof value === 'number' ? value : new Date(String(value)).getTime() / 1000;

interface SentLog {
  id?: string;
  timestamp: string | number;
  source?: string;
  service?: string;
  message: string;
  severity?: string;
}

/**
 * POST /api/rca/rank: rank the services most likely to have caused an incident.
 * Body (all optional): incident_start (ISO string or Unix seconds), lookback_minutes, logs[].
 * Without logs it ranks the stored logs of the lookback window.
 */
router.post('/rank', rcaLimiter, validateRcaRank, async (req: Request, res: Response) => {
  try {
    const body = req.body as { incident_start?: string | number; lookback_minutes?: number; logs?: SentLog[] };
    const logs: RcaLine[] | undefined = body.logs?.map((l) => ({
      id: l.id,
      timestamp: toSeconds(l.timestamp),
      service: l.service ?? l.source ?? 'unknown',
      message: l.message,
      severity: l.severity,
    }));
    const data = await rankIncident({
      logs,
      incidentStart: body.incident_start === undefined ? undefined : toSeconds(body.incident_start),
      lookbackMinutes: Math.min(body.lookback_minutes ?? Number.POSITIVE_INFINITY, MAX_LOOKBACK_MINUTES),
    });
    res.json({ status: 'success', data });
  } catch (err) {
    if (err instanceof RcaError) {
      res.status(422).json({ status: 'error', code: err.code, message: err.message });
      return;
    }
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/**
 * GET /api/rca/graph?lookback_minutes=15: the service graph learned from the stored logs
 * (mention edges A names B, and correlation edges for services whose log volumes move together).
 */
router.get('/graph', rcaLimiter, async (req: Request, res: Response) => {
  try {
    const asked = Number(req.query.lookback_minutes ?? DEFAULT_LOOKBACK_MINUTES);
    if (!Number.isFinite(asked) || asked < 1) {
      res.status(400).json({ status: 'error', message: 'lookback_minutes must be a number of at least 1' });
      return;
    }
    res.json({ status: 'success', data: await learnGraph(Math.min(asked, MAX_LOOKBACK_MINUTES)) });
  } catch (err) {
    if (err instanceof RcaError) {
      res.status(422).json({ status: 'error', code: err.code, message: err.message });
      return;
    }
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/**
 * POST /api/rca/incident (admin key): backfill a simulated incident ending now, so Root Cause can be
 * tried with a known answer. Body (all optional): service, fault, seed. Returns the truth.
 */
router.post('/incident', rcaLimiter, requireApiKey, validateInjectIncident, async (req: Request, res: Response) => {
  try {
    const data = await injectIncident(req.body as Parameters<typeof injectIncident>[0]);
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    if (err instanceof UnobservableFaultError) {
      res.status(400).json({ status: 'error', message: err.message });
      return;
    }
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

export default router;
