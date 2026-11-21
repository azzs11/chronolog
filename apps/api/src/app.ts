import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiLimiter } from './middleware/rateLimiter';
import { metricsEndpoint } from './middleware/metrics';
import logsRouter from './routes/logs';
import causalRouter from './routes/causal';
import healthRouter from './routes/health';
import metricsRouter from './routes/metrics';
import anomaliesRouter from './routes/anomalies';
import rcaRouter from './routes/rca';
import incidentsRouter from './routes/incidents';
import moodsRouter from './routes/moods';
import logger from './config/logger';

const app = express();

// ── Security headers (must come first) ───────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // allow frontend to fetch metrics/API from same origin
  }),
);

// ── CORS (explicit origins only) ──────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server (no Origin header) and configured origins
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Global rate limit (100 req/min) ──────────────────────────────────────────
app.use(apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/metrics', metricsEndpoint);
app.use('/health', healthRouter);
app.use('/api/logs', logsRouter);
app.use('/api/causal', causalRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/rca', rcaRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/moods', moodsRouter);
app.use('/api/metrics', metricsRouter);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({ status: 'error', message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────────────────────
// Express identifies error handlers by their 4-argument signature.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith('CORS:')) {
    res.status(403).json({ status: 'error', message: err.message });
    return;
  }
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

export default app;
