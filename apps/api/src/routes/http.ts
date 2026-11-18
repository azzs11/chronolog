/** Small helpers shared by the route files. */

/** A query-string value as a string, or undefined when absent or not a plain string. */
export function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
