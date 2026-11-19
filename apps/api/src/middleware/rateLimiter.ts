import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

const WINDOW_MS = 60 * 1000;

const onLimitReached = (_req: Request, res: Response): void => {
  res.status(429).json({ status: 'error', message: 'Too many requests — please slow down' });
};

const limiter = (max: number) =>
  rateLimit({ windowMs: WINDOW_MS, max, standardHeaders: true, legacyHeaders: false, handler: onLimitReached });

/** Global API limiter: 100 req/min on all routes. Applied in app.ts before all routes. */
export const apiLimiter = limiter(100);

/** Log ingestion limiter: 500 req/min on POST /api/logs (high-throughput streams). */
export const logsIngestionLimiter = limiter(500);

/** Generator endpoint limiter: 10 req/min. Prevents accidental rapid start/stop loops. */
export const generatorLimiter = limiter(10);

// Ranking replays the whole window through the engine, so it is limited harder than reads.
export const rcaLimiter = limiter(20);
