const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = 3187;
let child;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}${pathname}`, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8')}));
    });
    request.on('error', reject);
  });
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try { await get('/manus-routes.json'); return; } catch { await new Promise(resolve => setTimeout(resolve, 25)); }
  }
  throw new Error('preview server did not start');
}

test.before(async () => {
  child = spawn(process.execPath, ['server.mjs'], {cwd: root, env: {...process.env, PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']});
  await waitForServer();
});

test.after(() => child?.kill());

test('serves the app and route manifest with safe headers', async () => {
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.match(page.body, /Yourself/);

  const manifest = await get('/manus-routes.json');
  assert.equal(manifest.status, 200);
  assert.deepEqual(JSON.parse(manifest.body), {routes: [{path: '/', title: 'Yourself'}]});
});

test('does not expose private project files or traversal paths', async () => {
  for (const pathname of ['/supabase.sql', '/database/supabase.sql', '/tests/source-contracts.test.cjs', '/delete-account.ts', '/../supabase.sql']) {
    const response = await get(pathname);
    assert.equal(response.status, 404, pathname);
  }
});
