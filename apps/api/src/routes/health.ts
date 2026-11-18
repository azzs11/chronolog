import { Router } from 'express';
import * as mlService from '../services/mlService';
import { isPgAvailable } from '../db/client';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'success',
    service: 'chronolog',
    version: '2.0.0',
    features: {
      ml_classification: mlService.isAvailable(),
      causal_intelligence: true,
      anomaly_detection: true,
      persistence: isPgAvailable() ? 'postgresql' : 'in-memory',
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
