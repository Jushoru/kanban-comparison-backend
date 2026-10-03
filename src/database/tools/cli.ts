import 'dotenv/config';
import { Pool } from 'pg';
import { validateEnvironment } from '../../config/environment';
import { createPool } from '../pool';

export async function runCli(task: (pool: Pool) => Promise<void>): Promise<void> {
  let pool: Pool | undefined;
  try {
    pool = createPool(validateEnvironment(process.env));
    await task(pool);
  } catch {
    // Do not leak connection strings, SQL, credentials or row data in deployment logs.
    console.error('Database command failed. Check DATABASE_URL, TLS CA, access rights and migration files. Run db:migrate before db:seed.');
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
