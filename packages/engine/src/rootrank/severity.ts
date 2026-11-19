/**
 * Severity for lines that do not carry one ("log adapter v1", mirrors bench/adapt.py).
 *
 * 1. An explicit level word wins; the highest level named is used.
 * 2. Otherwise error-like words give "error" and warning-like words give "warning".
 * 3. Otherwise "info".
 * These rules are part of the benchmark definition and must not be tuned.
 */

const EXPLICIT: ReadonlyArray<readonly [string, RegExp]> = [
  ['critical', /\b(?:FATAL|CRITICAL|PANIC|EMERG)\b|level=(?:fatal|critical|panic)/],
  ['error', /\bERROR\b|level=error|"level":\s*"error"|\[error\]/],
  ['warning', /\bWARN(?:ING)?\b|level=warn|"level":\s*"warn/],
  ['info', /\bINFO\b|level=info|"level":\s*"info"/],
  ['debug', /\bDEBUG\b|level=debug|"level":\s*"debug"/],
];

// "exception" has no leading word boundary so Java class names such as NullPointerException match.
const KEYWORD_ERROR = /exception|\b(?:error|fail(?:ed|ure|ures|s)?|refused|unavailable|unable to)\b/i;
const KEYWORD_WARNING = /\b(?:warn(?:ing)?|timeout|timed out|retry(?:ing)?|slow)\b/i;

export function inferSeverity(message: string): string {
  for (const [level, pattern] of EXPLICIT) {
    if (pattern.test(message)) return level;
  }
  if (KEYWORD_ERROR.test(message)) return 'error';
  if (KEYWORD_WARNING.test(message)) return 'warning';
  return 'info';
}
