import type { NextFunction, Request, Response } from 'express';
import logger from '../config/logger';

/** Constant-time string comparison (pure JS, no crypto needed for this length). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Admin API key guard.
 *
 * Checks the X-API-Key request header against the ADMIN_API_KEY env var.
 * Applied to mutating admin routes (generator start/stop, model retrain).
 *
 * If ADMIN_API_KEY is not set the server refuses to serve these routes
 * entirely: fail-closed is safer than fail-open.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    logger.warn('Admin route accessed but ADMIN_API_KEY is not configured');
    res.status(503).json({ status: 'error', message: 'Admin API key not configured on this server' });
    return;
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || typeof providedKey !== 'string') {
    res.status(401).json({ status: 'error', message: 'Missing X-API-Key header' });
    return;
  }

  if (!timingSafeEqual(providedKey, expectedKey)) {
    logger.warn('Invalid admin API key attempt', { ip: req.ip, path: req.path, method: req.method });
    res.status(403).json({ status: 'error', message: 'Invalid API key' });
    return;
  }

  next();
}
