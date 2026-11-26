import { Router, type Request, type Response } from 'express';
import * as logRepository from '../db/logRepository';
import * as anomalyDetector from '../services/anomalyDetector';
import { currentUnusual } from '../services/unusual';
import { validateQueryLimit } from '../middleware/validation';
import { errorMessage, queryString } from './http';

const router = Router();
const DEFAULT_ANOMALY_LIMIT = 50;

/** GET /api/anomalies: recent anomalies */
router.get('/', validateQueryLimit, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(queryString(req.query.limit) ?? '', 10) || DEFAULT_ANOMALY_LIMIT;
    const anomalies = await logRepository.getRecentAnomalies(limit);
    res.json({ status: 'success', data: anomalies, count: anomalies.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/anomalies/unusual: messages that are rare or new versus the hour before (anomaly v2) */
router.get('/unusual', async (_req: Request, res: Response) => {
  try {
    res.json({ status: 'success', data: await currentUnusual() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/anomalies/fingerprints: recurring anomaly patterns */
router.get('/fingerprints', (_req, res) => {
  try {
    const fingerprints = anomalyDetector.getFingerprints();
    res.json({ status: 'success', data: fingerprints, count: fingerprints.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

export default router;
