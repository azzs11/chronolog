const { Pool } = require('pg');
const logger = require('../config/logger');

let pool = null;
let pgAvailable = false;

// DATABASE_URL (set by docker-compose) wins; the POSTGRES_* vars are for local dev.
const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || 'chronolog',
      user: process.env.POSTGRES_USER || 'debug_user',
      password: process.env.POSTGRES_PASSWORD || 'debug_secret',
    };

const poolConfig = {
  ...connectionConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000
};

async function connectDB() {
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
    if (pool) { pool.end().catch(() => {}); pool = null; }
    throw err;
  }
}

function getPool() { return pool; }
function isPgAvailable() { return pgAvailable; }

module.exports = { connectDB, getPool, isPgAvailable };
