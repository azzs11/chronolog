import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { activeConnections } from '../middleware/metrics';
import * as mlService from '../services/mlService';
import logger from '../config/logger';
import type { CausalEvent } from '../services/logProcessor';
import type { LogStats, ProcessedLog, RawLogInput } from '../types';

let io: SocketServer | null = null;

type LogProcessor = (log: RawLogInput) => Promise<ProcessedLog>;
// Injected after server + logProcessor are both initialised (avoids circular imports).
let processLog: LogProcessor = async () => {
  throw new Error('Log processor not set');
};

export function setLogProcessor(fn: LogProcessor): void {
  processLog = fn;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function initializeSocket(server: HttpServer): SocketServer {
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim());

  io = new SocketServer(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Socket.io CORS: origin ${origin} not allowed`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.info('WebSocket client connected', { id: socket.id });
    activeConnections.inc();

    socket.emit('connection-success', {
      message: 'Connected to ChronoLog v2',
      ml_enabled: mlService.isAvailable(),
      features: ['causal-intelligence', 'anomaly-detection'],
      timestamp: new Date().toISOString(),
    });

    // Client can submit a log directly via WebSocket
    socket.on('send-log', async (logData: RawLogInput) => {
      try {
        const log = await processLog(logData);
        // Broadcast to OTHER clients (the originator gets it via the processor's emitLog).
        socket.broadcast.emit('new-log', log);
      } catch (err) {
        logger.error('Error processing socket log', { error: errorMessage(err) });
        socket.emit('error', { message: 'Failed to process log' });
      }
    });

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', { id: socket.id });
      activeConnections.dec();
    });

    socket.on('error', (err: Error) => {
      logger.warn('WebSocket error', { id: socket.id, error: err.message });
    });
  });

  return io;
}

export const emitLog = (log: ProcessedLog): void => void io?.emit('new-log', log);
export const emitStats = (stats: LogStats): void => void io?.emit('log-stats', stats);
export const emitCausalEvent = (evt: CausalEvent): void => void io?.emit('causal-event', evt);
export const getIo = (): SocketServer | null => io;
