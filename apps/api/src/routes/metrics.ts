import { Router } from 'express';
import * as logRepository from '../db/logRepository';
import * as causalEngine from '../services/causalEngine';
import * as mlService from '../services/mlService';
import { errorMessage } from './http';

const router = Router();

let mlAccuracy = 0;
let mlClassified = 0;

/** Called by the log processor to keep running ML accuracy. */
export function updateMLStats({ accuracy, classified }: { accuracy?: number; classified?: number }): void {
  mlAccuracy = accuracy ?? mlAccuracy;
  mlClassified = classified ?? mlClassified;
}

function topErrorSource(): string | null {
  const errorLogs = logRepository.getMemLogs().filter((l) => l.severity === 'error' || l.severity === 'critical');
  if (!errorLogs.length) return null;
  const counts: Record<string, number> = {};
  for (const l of errorLogs) counts[l.source] = (counts[l.source] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** GET /api/metrics/summary */
router.get('/summary', async (_req, res) => {
  try {
    const stats = await logRepository.getStats();
    const chains = causalEngine.getActiveCausalChains();
    const maxBlastRadius = chains.length ? Math.max(...chains.map((c) => c.blast_radius_score)) : 0;

    res.json({
      status: 'success',
      data: {
        total_logs: stats.total,
        anomaly_count: stats.anomalyCount,
        anomaly_rate: stats.total > 0 ? parseFloat((stats.anomalyCount / stats.total).toFixed(4)) : 0,
        active_causal_chains: chains.length,
        blast_radius_max: parseFloat(maxBlastRadius.toFixed(3)),
        top_error_source: topErrorSource(),
        ml_available: mlService.isAvailable(),
        ml_accuracy: parseFloat(mlAccuracy.toFixed(4)),
        ml_classified: mlClassified,
        by_severity: stats.bySeverity,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

export default router;
