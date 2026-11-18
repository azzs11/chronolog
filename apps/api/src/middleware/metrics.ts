import client from 'prom-client';
import type { Request, Response } from 'express';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const logsProcessed = new client.Counter({
  name: 'logs_processed_total',
  help: 'Total number of logs processed',
  labelNames: ['severity'],
  registers: [register],
});

export const activeConnections = new client.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections',
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const causalLinksDetected = new client.Counter({
  name: 'causal_links_detected_total',
  help: 'Total number of causal links detected between logs',
  registers: [register],
});

export const anomaliesDetected = new client.Counter({
  name: 'anomalies_detected_total',
  help: 'Total number of anomalous log patterns detected',
  registers: [register],
});

export async function metricsEndpoint(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
