import { Pool, type PoolConfig } from 'pg';
import logger from '../config/logger';

let pool: Pool | null = null;
let pgAvailable = false;

// DATABASE_URL (set by docker-compose) wins; the POSTGRES_* vars are for local dev.
const connectionConfig: PoolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT ?? '', 10) || 5432,
      database: process.env.POSTGRES_DB || 'chronolog',
      user: process.env.POSTGRES_USER || 'debug_user',
      password: process.env.POSTGRES_PASSWORD || 'debug_secret',
    };

const poolConfig: PoolConfig = {
  ...connectionConfig,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3000,
};

export async function connectDB(): Promise<boolean> {
  try {
    pool = new Pool(poolConfig);
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    pgAvailable = true;
    logger.info('PostgreSQL connected');
    return true;
  } catch (err) {
    pgAvailable = false;
    if (pool) {
      pool.end().catch(() => undefined);
      pool = null;
    }
    throw err;
  }
}

export function getPool(): Pool | null {
  return pool;
}

/** The pool, or an error. Call only after isPgAvailable() returned true. */
export function requirePool(): Pool {
  if (!pool) throw new Error('PostgreSQL pool is not initialised');
  return pool;
}

export function isPgAvailable(): boolean {
  return pgAvailable;
}
