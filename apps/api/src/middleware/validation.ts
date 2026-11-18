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
