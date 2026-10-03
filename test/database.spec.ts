import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service';
import { runMigrations, runSeeds } from '../src/database/tools/runner';

function fixture() {
  const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const release = jest.fn();
  const client = { query, release };
  const pool = { connect: jest.fn().mockResolvedValue(client), end: jest.fn(), query: jest.fn() };
  return { query, release, client, pool: pool as unknown as Pool, db: new DatabaseService(pool as unknown as Pool) };
}

describe('DatabaseService', () => {
  it('uses one checked-out client through BEGIN, work, COMMIT and releases it', async () => {
    const f = fixture();
    const result = await f.db.transaction(async (client) => {
      expect(client).toBe(f.client);
      await client.query('SELECT $1', ['value']);
      return 42;
    });
    expect(result).toBe(42);
    expect(f.query.mock.calls).toEqual([['BEGIN'], ['SELECT $1', ['value']], ['COMMIT']]);
    expect(f.release).toHaveBeenCalledWith(false);
  });

  it('rolls back failures, including deferred constraints failing at COMMIT', async () => {
    const f = fixture();
    const error = { code: '23505' };
    f.query.mockImplementation(async (sql: string) => { if (sql === 'COMMIT') throw error; });
    await expect(f.db.transaction(async () => 'ok')).rejects.toBe(error);
    expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
    expect(f.release).toHaveBeenCalledWith(false);
  });

  it('discards broken clients when rollback fails, preserving the original error', async () => {
    const f = fixture();
    const original = new Error('original');
    f.query.mockImplementation(async (sql: string) => { if (sql === 'ROLLBACK') throw new Error('offline'); });
    await expect(f.db.transaction(async () => { throw original; })).rejects.toBe(original);
    expect(f.release).toHaveBeenCalledWith(true);
  });

  it('uses a repeatable read snapshot for multi-query reads and closes the pool on shutdown', async () => {
    const f = fixture();
    await f.db.transaction(async () => true, true);
    expect(f.query).toHaveBeenNthCalledWith(1, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await f.db.onApplicationShutdown();
    expect(f.pool.end).toHaveBeenCalled();
  });
});

describe('migration/seed runner', () => {
  const files = [{ name: '001_initial.sql', sql: 'CREATE TABLE example (id text)', checksum: 'abc' }];

  it('records migration checksums using parameters and locks the whole transaction', async () => {
    const f = fixture();
    await expect(runMigrations(f.pool, files)).resolves.toEqual(['001_initial.sql']);
    expect(f.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [48201601]);
    expect(f.query).toHaveBeenCalledWith('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', ['001_initial.sql', 'abc']);
    expect(f.query.mock.calls.at(-1)).toEqual(['COMMIT']);
  });

  it('skips already applied migrations', async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT name, checksum') ? files : [], rowCount: 0 }));
    await expect(runMigrations(f.pool, files)).resolves.toEqual([]);
    expect(f.query).not.toHaveBeenCalledWith(files[0]!.sql);
  });

  it('rejects a modified migration and rolls back', async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT name, checksum') ? [{ name: '001_initial.sql', checksum: 'changed' }] : [], rowCount: 0 }));
    await expect(runMigrations(f.pool, files)).rejects.toThrow('changed');
    expect(f.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  });

  it('rolls back the entire batch if migration SQL fails', async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql: string) => {
      if (sql === files[0]!.sql) throw new Error('DDL failed');
      return { rows: [], rowCount: 0 };
    });
    await expect(runMigrations(f.pool, files)).rejects.toThrow('DDL failed');
    expect(f.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  });

  it('requires the schema before seeding', async () => {
    const f = fixture();
    await expect(runSeeds(f.pool, files)).rejects.toThrow('db:migrate');
    expect(f.query).not.toHaveBeenCalledWith(files[0]!.sql);
  });
});
