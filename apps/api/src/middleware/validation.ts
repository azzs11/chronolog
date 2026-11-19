import { body, query, validationResult } from 'express-validator';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { VALID_SEVERITIES, MAX_LOG_LIMIT } from '../config/constants';

export function handleValidationErrors(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.type === 'field' ? e.path : undefined, message: e.msg })),
    });
    return;
  }
  next();
}

export const validateLog: RequestHandler[] = [
  body('message')
    .isString().withMessage('message must be a string')
    .trim()
    .notEmpty().withMessage('message is required')
    .isLength({ max: 2000 }).withMessage('message must not exceed 2000 characters'),

  body('severity')
    .optional()
    .isString().withMessage('severity must be a string')
    .customSanitizer((v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v))
    .isIn([...VALID_SEVERITIES]).withMessage(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`),

  body('source')
    .optional()
    .isString().withMessage('source must be a string')
    .trim()
    .isLength({ max: 100 }).withMessage('source must not exceed 100 characters'),

  handleValidationErrors,
];

export const validateQueryLimit: RequestHandler[] = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: MAX_LOG_LIMIT })
    .withMessage(`limit must be an integer between 1 and ${MAX_LOG_LIMIT}`),

  handleValidationErrors,
];

export const validateGeneratorStart: RequestHandler[] = [
  body('interval')
    .optional()
    .isInt({ min: 200, max: 60000 })
    .withMessage('interval must be between 200 and 60000 milliseconds'),

  handleValidationErrors,
];

const MAX_RCA_BODY_LINES = 20_000;
const isTime = (v: unknown): boolean =>
  (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));

export const validateRcaRank: RequestHandler[] = [
  body('incident_start')
    .optional()
    .custom(isTime).withMessage('incident_start must be Unix seconds or an ISO timestamp'),

  body('lookback_minutes')
    .optional()
    .isFloat({ min: 1 }).withMessage('lookback_minutes must be a number of at least 1'),

  body('logs')
    .optional()
    .isArray({ min: 1, max: MAX_RCA_BODY_LINES })
    .withMessage(`logs must be an array of 1 to ${MAX_RCA_BODY_LINES} lines`),

  body('logs.*.timestamp').custom(isTime).withMessage('each log needs a timestamp (Unix seconds or ISO)'),
  body('logs.*.message').isString().withMessage('each log needs a message'),
  body('logs.*.source').optional().isString().isLength({ max: 100 }),
  body('logs.*.service').optional().isString().isLength({ max: 100 }),
  body('logs.*.severity')
    .optional()
    .customSanitizer((v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v))
    .isIn([...VALID_SEVERITIES]).withMessage(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`),

  handleValidationErrors,
];
