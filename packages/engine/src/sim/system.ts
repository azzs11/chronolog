/**
 * The simulated system: six services, the requests that flow through them, and the log lines each
 * hop writes. Messages are written like ordinary application logs; the numbers in them vary, so
 * Drain groups them into stable templates just as it does for real logs.
 */
import type { Rng } from './rng';

export const SERVICES = ['gateway', 'auth', 'catalog', 'cart', 'orders', 'db'] as const;
export type SimService = (typeof SERVICES)[number];

/** Who calls whom, for the three kinds of request. */
export interface Flow {
  name: string;
  /** Hops in order: [caller, callee, operation]. The first caller is the outside world. */
  hops: ReadonlyArray<readonly [string, SimService, string]>;
}

export const FLOWS: readonly Flow[] = [
  { name: 'browse', hops: [['client', 'gateway', 'catalog'], ['gateway', 'catalog', 'list'], ['catalog', 'db', 'select']] },
  {
    name: 'add_to_cart',
    hops: [['client', 'gateway', 'cart'], ['gateway', 'auth', 'validate'], ['gateway', 'cart', 'update'], ['cart', 'db', 'upsert']],
  },
  {
    name: 'checkout',
    hops: [
      ['client', 'gateway', 'checkout'],
      ['gateway', 'auth', 'validate'],
      ['gateway', 'orders', 'create'],
      ['orders', 'db', 'insert'],
    ],
  },
];

/** What a healthy service writes for one handled call. `ms` is the call's latency. */
export function handledMessage(service: SimService, op: string, ms: number, rng: Rng): string {
  switch (service) {
    case 'gateway':
      return `${op === 'checkout' ? 'POST' : 'GET'} /api/${op}/${rng.int(1, 5000)} 200 ${ms}ms`;
    case 'auth':
      return `token validated for user ${rng.int(1000, 9999)} in ${ms}ms`;
    case 'catalog':
      return `query products category=${rng.pick(['books', 'toys', 'tools', 'food'])} returned ${rng.int(1, 40)} rows in ${ms}ms`;
    case 'cart':
      return `cart updated user=${rng.int(1000, 9999)} items=${rng.int(1, 9)} in ${ms}ms`;
    case 'orders':
      return `order ${rng.int(100000, 999999)} created total=${rng.int(5, 400)}.${rng.int(10, 99)} in ${ms}ms`;
    case 'db':
      return `${op.toUpperCase()} on table ${rng.pick(['products', 'carts', 'orders'])} executed in ${ms}ms`;
  }
}

/** Typical latency of one hop, in milliseconds. */
export const BASE_LATENCY_MS: Record<SimService, number> = {
  gateway: 18,
  auth: 6,
  catalog: 14,
  cart: 10,
  orders: 22,
  db: 4,
};

/** Background lines each service writes every few seconds, healthy or not. */
export function backgroundMessage(service: SimService, rng: Rng): string {
  const pick = rng.int(0, 2);
  if (pick === 0) return 'health check ok';
  if (pick === 1) return `connection pool: ${rng.int(2, 9)} active of 10`;
  return `${service} metrics flushed: ${rng.int(100, 900)} requests in last 10s`;
}

export const BACKGROUND_EVERY_S = 10;
