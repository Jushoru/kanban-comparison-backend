const assert = require('node:assert/strict');
const console = require('node:console');
const process = require('node:process');
const { spawn, spawnSync } = require('node:child_process');
const { createServer } = require('node:net');
const { setTimeout: sleep } = require('node:timers/promises');

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function smoke(development) {
  const port = await freePort();
  const windows = process.platform === 'win32';
  const command = development ? (windows ? process.env.ComSpec || 'cmd.exe' : 'npm') : process.execPath;
  const args = development
    ? (windows ? ['/d', '/s', '/c', 'npm run start:dev'] : ['run', 'start:dev'])
    : ['dist/main.js'];
  const child = spawn(command, args, {
    cwd: process.cwd(), windowsHide: true, detached: !windows, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // A deliberately unreachable non-secret fixture: no PostgreSQL is created or used.
      DATABASE_URL: 'postgres://smoke:smoke@database.invalid:5432/smoke?sslmode=require',
      DB_SSL_CA: '', DB_POOL_MAX: '2', CORS_ORIGINS: '',
      PORT: String(port), NODE_ENV: development ? 'development' : 'production',
    },
  });
  let output = '', startupError;
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  child.on('error', (error) => { startupError = error; });
  try {
    const base = `http://127.0.0.1:${port}`;
    let spec;
    for (let attempt = 0; attempt < 160; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Server exited before startup: ${output}`);
      try {
        const response = await globalThis.fetch(`${base}/docs-json`);
        if (response.ok) { spec = await response.json(); break; }
      } catch { /* Startup is still in progress. */ }
      await sleep(250);
    }
    assert.ok(spec, `Startup timed out: ${output}`);
    assert.equal(spec.info.title, 'Kanban Comparison API');
    assert.ok(spec.paths['/api/cards/{id}'].patch);
    assert.equal((await globalThis.fetch(`${base}/docs`)).status, 200);
    const health = await globalThis.fetch(`${base}/api/health`);
    assert.equal(health.status, 503);
    assert.equal((await health.json()).message, 'Database is unavailable');
    const invalid = await globalThis.fetch(`${base}/api/cards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '' }),
    });
    assert.equal(invalid.status, 400);
    console.log(`${development ? 'npm run start:dev' : 'node dist/main.js'}: PORT=${port}, Swagger 200, validation 400, unavailable DB 503 — passed`);
  } finally {
    // Terminate only the process tree created by this smoke test (including the watch child).
    if (child.pid) {
      if (windows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ } }
    }
  }
}

void (async () => { await smoke(false); await smoke(true); })().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
