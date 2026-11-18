import { Router, type Request, type Response } from 'express';
import { DEFAULT_LOG_LIMIT, GENERATOR_DEFAULT_INTERVAL_MS } from '../config/constants';
import { validateLog, validateQueryLimit, validateGeneratorStart } from '../middleware/validation';
import { logsIngestionLimiter, generatorLimiter } from '../middleware/rateLimiter';
import { requireApiKey } from '../middleware/apiKeyAuth';
import * as logRepository from '../db/logRepository';
import { processLog } from '../services/logProcessor';
import { generateLogData } from '../services/logGenerator';
import { errorMessage, queryString } from './http';

const router = Router();

const ANOMALY_LIST_LIMIT = 20;
const SEVERITY_LIST_LIMIT = 100;

let generatorInterval: NodeJS.Timeout | null = null;
let generatorActive = false;

/** GET /api/logs */
router.get('/', validateQueryLimit, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(queryString(req.query.limit) ?? '') || DEFAULT_LOG_LIMIT;
    const logs = await logRepository.getLogs({
      limit,
      severity: queryString(req.query.severity),
      source: queryString(req.query.source),
      search: queryString(req.query.search),
      onlyAnomalies: req.query.anomalies === 'true',
    });
    res.json({ status: 'success', data: logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** POST /api/logs: high-throughput ingestion rate limit */
router.post('/', logsIngestionLimiter, validateLog, async (req: Request, res: Response) => {
  try {
    const log = await processLog(req.body);
    res.status(201).json({ status: 'success', data: log });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/logs/stats */
router.get('/stats', async (_req, res) => {
  try {
    res.json({ status: 'success', data: await logRepository.getStats() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/logs/anomalies */
router.get('/anomalies', async (req, res) => {
  try {
    const limit = parseInt(queryString(req.query.limit) ?? '') || ANOMALY_LIST_LIMIT;
    const anomalies = await logRepository.getRecentAnomalies(limit);
    res.json({ status: 'success', data: anomalies, count: anomalies.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/logs/severity/:severity */
router.get('/severity/:severity', async (req, res) => {
  try {
    const logs = await logRepository.getLogs({ severity: req.params.severity, limit: SEVERITY_LIST_LIMIT });
    res.json({ status: 'success', data: logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/logs/generator/status */
router.get('/generator/status', (_req, res) => {
  res.json({ status: 'success', data: { isActive: generatorActive } });
});

/** POST /api/logs/generator/start: admin only */
router.post('/generator/start', generatorLimiter, requireApiKey, validateGeneratorStart, (req: Request, res: Response) => {
  if (generatorActive) {
    res.json({ status: 'success', message: 'Generator already running' });
    return;
  }
  const interval = parseInt(String(req.body?.interval ?? '')) || GENERATOR_DEFAULT_INTERVAL_MS;
  generatorInterval = setInterval(() => void processLog(generateLogData()), interval);
  generatorActive = true;
  res.json({ status: 'success', message: 'Log generator started', interval });
});

/** POST /api/logs/generator/stop: admin only */
router.post('/generator/stop', generatorLimiter, requireApiKey, (_req, res) => {
  if (!generatorActive) {
    res.json({ status: 'success', message: 'Generator not running' });
    return;
  }
  if (generatorInterval) clearInterval(generatorInterval);
  generatorInterval = null;
  generatorActive = false;
  res.json({ status: 'success', message: 'Log generator stopped' });
});

export default router;
