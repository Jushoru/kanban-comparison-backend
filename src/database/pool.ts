import { Pool, PoolConfig } from 'pg';
import { Environment } from '../config/environment';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

export function poolOptions(config: Environment): PoolConfig {
  const url = new URL(config.DATABASE_URL);
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(config.DB_SSL_CA ? { ca: config.DB_SSL_CA } : {}) },
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    lock_timeout: 5000,
    idle_in_transaction_session_timeout: 15000,
    options: '-c timezone=UTC',
    application_name: 'kanban-comparison-backend',
  };
}

export function createPool(config: Environment): Pool {
  const pool = new Pool(poolOptions(config));
  // Never log pg errors verbatim: they can contain a connection URI or row data.
  pool.on('error', () => console.error('An idle PostgreSQL connection failed'));
  return pool;
}
