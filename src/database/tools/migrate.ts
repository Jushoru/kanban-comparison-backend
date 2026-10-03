import { runCli } from './cli';
import { runMigrations } from './runner';

void runCli(async (pool) => {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Schema is up to date');
});
