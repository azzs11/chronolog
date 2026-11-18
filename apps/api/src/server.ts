import 'dotenv/config';
import http from 'http';
import app from './app';
import { initializeSocket, setLogProcessor, emitLog, emitStats, emitCausalEvent } from './socket/socketHandler';
import { processLog, setEmitters } from './services/logProcessor';
import { onChainDetected } from './services/causalEngine';
import { connectDB } from './db/client';
import { checkHealth } from './services/mlService';
import logger from './config/logger';

const PORT = process.env.PORT || 5000;
const ML_HEALTH_CHECK_INTERVAL_MS = 30_000;
const server = http.createServer(app);

initializeSocket(server);
setLogProcessor(processLog);
setEmitters({ emitLog, emitStats, emitCausalEvent });
onChainDetected(emitCausalEvent);

connectDB().catch((err: unknown) =>
  logger.warn('PostgreSQL unavailable — using in-memory fallback', {
    error: err instanceof Error ? err.message : String(err),
  }),
);

server.listen(PORT, () => {
  logger.info(`ChronoLog v2.0 running on :${PORT}`);
  logger.info(`Prometheus metrics → http://localhost:${PORT}/metrics`);
  logger.info(`Causal graph API  → http://localhost:${PORT}/api/causal/chains`);
});

setInterval(() => void checkHealth(), ML_HEALTH_CHECK_INTERVAL_MS);
