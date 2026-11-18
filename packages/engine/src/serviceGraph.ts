/**
 * Hand-written service dependency map (13 services). Any service not listed
 * here scores as unrelated. Phase 3 replaces this with a graph learned from logs.
 */
export const SERVICE_DEPS: Readonly<Record<string, readonly string[]>> = {
  api: ['database', 'redis', 'cache', 'auth'],
  'api-gateway': ['database', 'redis', 'cache', 'auth'],
  auth: ['database', 'redis', 'cache'],
  'auth-service': ['database', 'redis', 'cache'],
  cache: ['database'],
  'cache-service': ['database', 'redis'],
  payment: ['api', 'auth', 'database'],
  'payment-service': ['api', 'auth', 'database'],
  notification: ['api', 'database'],
  integration: ['api', 'database'],
  'storage-service': ['database'],
  'session-manager': ['database', 'redis', 'cache'],
  queue: ['database', 'redis'],
};

const SAME_SOURCE = 1.0;
const CHILD_DEPENDS_ON_PARENT = 0.75;
/** Reverse direction: still weakly correlated in cascading failures. */
const PARENT_DEPENDS_ON_CHILD = 0.3;
const UNRELATED = 0.08;

const matches = (a: string, b: string): boolean => a === b || a.startsWith(b) || b.startsWith(a);

export function sourceRelationScore(parentSrc: string, childSrc: string): number {
  if (parentSrc === childSrc) return SAME_SOURCE;
  const childDeps = SERVICE_DEPS[childSrc] ?? [];
  if (childDeps.some((d) => matches(parentSrc, d))) return CHILD_DEPENDS_ON_PARENT;
  const parentDeps = SERVICE_DEPS[parentSrc] ?? [];
  if (parentDeps.some((d) => matches(childSrc, d))) return PARENT_DEPENDS_ON_CHILD;
  return UNRELATED;
}
