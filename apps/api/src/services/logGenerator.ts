/** Synthetic log generator used by the demo "start generator" button. */
import type { RawLogInput } from '../types';

// Weighted severity distribution biased toward realistic "normal" traffic.
const SEVERITY_POOL = [
  'critical', 'error', 'error',
  'warning', 'warning', 'warning',
  'info', 'info', 'info', 'info', 'info',
  'debug', 'debug',
] as const;

type Severity = (typeof SEVERITY_POOL)[number];
interface Template {
  msg: string;
  src: string;
}

const TEMPLATES: Record<Severity, Template[]> = {
  critical: [
    { msg: 'Database connection pool exhausted', src: 'database' },
    { msg: 'System running out of memory', src: 'monitoring' },
    { msg: 'Security breach detected in auth-service', src: 'auth-service' },
    { msg: 'Fatal error: kernel panic in api-gateway', src: 'api-gateway' },
  ],
  error: [
    { msg: 'Failed to connect to database after 3 retries', src: 'api' },
    { msg: 'Authentication failed: invalid credentials', src: 'auth-service' },
    { msg: 'Payment gateway timeout after 30s', src: 'payment-service' },
    { msg: 'API request failed with HTTP 500', src: 'api-gateway' },
    { msg: 'File upload rejected: size limit exceeded', src: 'storage-service' },
  ],
  warning: [
    { msg: 'High memory usage detected: {pct}%', src: 'monitoring' },
    { msg: 'Slow query detected: {time}ms response time', src: 'database' },
    { msg: 'Rate limit approaching for downstream service', src: 'api-gateway' },
    { msg: 'Cache miss ratio elevated: {pct}%', src: 'cache-service' },
    { msg: 'Retry attempt {n} of 3 for external API call', src: 'integration' },
  ],
  info: [
    { msg: 'User authentication successful', src: 'auth-service' },
    { msg: 'Request completed in {time}ms', src: 'api-gateway' },
    { msg: 'Service health check passed', src: 'monitoring' },
    { msg: 'Data sync completed successfully', src: 'database' },
    { msg: 'Cache warmed up for user_{id}', src: 'cache-service' },
  ],
  debug: [
    { msg: 'Processing request ID: req_{id}', src: 'api-gateway' },
    { msg: 'Query execution time: {time}ms', src: 'database' },
    { msg: 'Cache hit for session key: sess_{id}', src: 'cache-service' },
    { msg: 'User session initialised for user_{id}', src: 'session-manager' },
  ],
};

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;
const randomInt = (min: number, spread: number): string => String(Math.floor(Math.random() * spread) + min);

export function generateLogData(): RawLogInput {
  const severity = pick(SEVERITY_POOL);
  const tpl = pick(TEMPLATES[severity]);

  const message = tpl.msg
    .replace('{pct}', () => randomInt(70, 30))
    .replace('{time}', () => randomInt(10, 500))
    .replace('{id}', () => randomInt(0, 10000))
    .replace('{n}', () => randomInt(1, 2));

  return { message, severity, source: tpl.src };
}
