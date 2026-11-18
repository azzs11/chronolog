import { Router, type Request, type Response } from 'express';
import * as logRepository from '../db/logRepository';
import * as anomalyDetector from '../services/anomalyDetector';
import { validateQueryLimit } from '../middleware/validation';
import { errorMessage, queryString } from './http';

const router = Router();
const DEFAULT_ANOMALY_LIMIT = 50;

/** GET /api/anomalies: recent anomalies */
router.get('/', validateQueryLimit, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(queryString(req.query.limit) ?? '') || DEFAULT_ANOMALY_LIMIT;
    const anomalies = await logRepository.getRecentAnomalies(limit);
    res.json({ status: 'success', data: anomalies, count: anomalies.length });
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
