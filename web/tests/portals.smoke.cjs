// Run after build:all-modes. Starts temporary production servers and stops them afterward.
const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
const children = [];

async function check(mode, port, forbidden, title) {
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: path.join(root, 'apps', mode), stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`${mode} failed to start: ${output}`);
    try { response = await fetch(`${base}/login`); break; } catch { await delay(250); }
  }
  assert.ok(response, `${mode} did not start: ${output}`);
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(title), `${mode} has incorrect portal metadata`);
  assert.equal((await fetch(`${base}/app-icon.png`)).status, 200, `${mode} public assets`);
  assert.equal((await fetch(`${base}${forbidden}`)).status, 404, `${mode} route isolation`);
  const dashboard = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  assert.ok([200, 307].includes(dashboard.status), `${mode} dashboard route`);
  if (mode === 'farmers') {
    // A statically generated Next redirect can use a refresh tag instead of HTTP 307.
    const body = await dashboard.text();
    assert.ok(dashboard.headers.get('location') === '/dashboard/farmer' || body.includes('/dashboard/farmer'));
  }
  console.log(`${mode}: login, assets, dashboard and route isolation passed`);
}

(async () => {
  try {
    // Test ports avoid disrupting development servers on 3101–3103.
    await check('farmers', 33101, '/dashboard/users', 'Farmer Portal');
    await check('cooperatives', 33102, '/dashboard/roles', 'Cooperative Portal');
    await check('admin', 33103, '/dashboard/farmer', 'Admin Portal');
  } finally {
    for (const child of children) child.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
