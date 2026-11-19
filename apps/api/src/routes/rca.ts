import { Router, type Request, type Response } from 'express';
import type { RcaLine } from '@chronolog/engine';
import { rcaLimiter } from '../middleware/rateLimiter';
import { validateRcaRank } from '../middleware/validation';
import { MAX_LOOKBACK_MINUTES, RcaError, rankIncident } from '../services/rootRank';
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

export default router;
