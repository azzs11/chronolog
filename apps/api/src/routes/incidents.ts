import { Router, type Request, type Response } from 'express';
import * as feedbackRepository from '../db/feedbackRepository';
import { rcaLimiter } from '../middleware/rateLimiter';
import { validateFeedback } from '../middleware/validation';
import {
  DEFAULT_INCIDENT_LOOKBACK_MINUTES,
  IncidentNotFoundError,
  MAX_INCIDENT_LOOKBACK_MINUTES,
  NoCandidatesError,
  incidentDetail,
  listIncidents,
  recordFeedback,
} from '../services/incidents';
import { incidentStory, StoriesOffError, storyStatus } from '../services/story';
import { errorMessage } from './http';

const router = Router();

function failure(res: Response, err: unknown): void {
  if (err instanceof IncidentNotFoundError) {
    res.status(404).json({ status: 'error', message: err.message });
  } else if (err instanceof StoriesOffError) {
    res.status(503).json({ status: 'error', code: 'story_off', message: err.message });
  } else if (err instanceof NoCandidatesError) {
    res.status(422).json({ status: 'error', message: err.message });
  } else {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
}

function lookback(req: Request, fallback: number): number | null {
  const asked = Number(req.query.lookback_minutes ?? fallback);
  return Number.isFinite(asked) && asked >= 1 ? Math.min(asked, MAX_INCIDENT_LOOKBACK_MINUTES) : null;
}

/**
 * Reads are cheap (the incident detail ranks one window in about 100 ms) and covered by the global
 * rate limit; only the write has its own stricter limit.
 */

/** GET /api/incidents: bursts of error lines in the stored logs, biggest impact first. */
router.get('/', async (req: Request, res: Response) => {
  const minutes = lookback(req, DEFAULT_INCIDENT_LOOKBACK_MINUTES);
  if (minutes === null) {
    res.status(400).json({ status: 'error', message: 'lookback_minutes must be a number of at least 1' });
    return;
  }
  try {
    const data = await listIncidents(minutes);
    res.json({ status: 'success', data, count: data.length });
  } catch (err) {
    failure(res, err);
  }
});

/** GET /api/incidents/feedback/summary: how RootRank has done on the incidents engineers reviewed. */
router.get('/feedback/summary', async (_req: Request, res: Response) => {
  try {
    res.json({ status: 'success', data: await feedbackRepository.feedbackSummary() });
  } catch (err) {
    failure(res, err);
  }
});

/** GET /api/incidents/story/status: is a story model configured? (Stories are off by default.) */
router.get('/story/status', (_req: Request, res: Response) => {
  res.json({ status: 'success', data: storyStatus() });
});

/** GET /api/incidents/:id: the incident with its ranking, timeline and learned service graph. */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    res.json({ status: 'success', data: await incidentDetail(req.params.id as string) });
  } catch (err) {
    failure(res, err);
  }
});

/**
 * POST /api/incidents/:id/story: a short story written by the configured model, where every kept
 * sentence passed the engine's checker and carries the log ids behind it. 503 story_off if no model.
 */
router.post('/:id/story', rcaLimiter, async (req: Request, res: Response) => {
  try {
    res.json({ status: 'success', data: await incidentStory(req.params.id as string) });
  } catch (err) {
    failure(res, err);
  }
});

/**
 * POST /api/incidents/:id/feedback: "was this the root cause?"
 * Body: verdict ("confirm" | "reject"), correct_service (required for reject), note (optional).
 */
router.post('/:id/feedback', rcaLimiter, validateFeedback, async (req: Request, res: Response) => {
  try {
    const body = req.body as { verdict: 'confirm' | 'reject'; correct_service?: string; note?: string };
    const saved = await recordFeedback(req.params.id as string, { verdict: body.verdict, correctService: body.correct_service || undefined, note: body.note });
    res.status(201).json({ status: 'success', data: { verdict: saved.verdict, correctService: saved.correctService, rankOfCorrect: saved.rankOfCorrect } });
  } catch (err) {
    failure(res, err);
  }
});

export default router;
