import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { DatabaseService } from '../database.service';

export interface MigrationFile { name: string; sql: string; checksum: string }

export async function readSqlFiles(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (names.length === 0) throw new Error('No SQL files found');
  return Promise.all(names.map(async (name) => {
    // Normalize checkout line endings so checksums match on Windows and Linux.
    const sql = (await readFile(resolve(directory, name), 'utf8')).replace(/\r\n/g, '\n');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

export async function runMigrations(pool: Pool, files?: MigrationFile[]): Promise<string[]> {
  const migrations = files ?? await readSqlFiles(resolve(process.cwd(), 'database/migrations'));
  return new DatabaseService(pool).transaction(async (client) => {
    // Serialize CLI executions across processes/containers, without consuming a second connection.
    await client.query('SELECT pg_advisory_xact_lock($1)', [48201601]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL,
        applied_at timestamp NOT NULL DEFAULT now()
      )
    `);
    const applied = (await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows;
    for (const previous of applied) {
      if (migrations.find((file) => file.name === previous.name)?.checksum !== previous.checksum) {
        throw new Error('An applied migration has changed or is missing; restore it and add a new migration');
      }
    }
    const completed: string[] = [];
    for (const file of migrations) {
      if (applied.some((previous) => previous.name === file.name)) continue;
      if (applied.some((previous) => previous.name > file.name)) {
        throw new Error('New migrations must be appended after previously applied migrations');
      }
      // SQL is checked-in source, never HTTP input. Dynamic values below are bound separately.
      await client.query(file.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file.name, file.checksum]);
      completed.push(file.name);
    }
    return completed;
  });
}

export async function runSeeds(pool: Pool, files?: MigrationFile[]): Promise<void> {
  const seeds = files ?? await readSqlFiles(resolve(process.cwd(), 'database/seeds'));
  await new DatabaseService(pool).transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [48201601]);
    const initial = await client.query('SELECT name FROM schema_migrations WHERE name = $1', ['001_initial.sql']);
    if (!initial.rowCount) throw new Error('Run db:migrate before db:seed');
    for (const file of seeds) await client.query(file.sql);
  });
}
