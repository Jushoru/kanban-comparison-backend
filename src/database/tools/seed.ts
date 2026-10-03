import { runCli } from './cli';
import { runSeeds } from './runner';

void runCli(async (pool) => {
  await runSeeds(pool);
  console.log('Reference users and tags are ready');
});
