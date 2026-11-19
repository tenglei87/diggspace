// End-to-end smoke tests with a real local Wrangler Worker + D1 database.
// This is not a production network test; no external feeds are fetched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const origin = 'http://127.0.0.1:18787';
const token = 'ci-local-test-token';
const child = spawn(process.execPath, [wrangler, 'dev', '--local', '--port', '18787'], {
  cwd: frontend,
  env: { ...process.env, CI: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
const append = (chunk) => { output = (output + chunk.toString()).slice(-16000); };
child.stdout.on('data', append);
child.stderr.on('data', append);
let exited = false;
child.on('exit', () => { exited = true; });

async function get(path, options) {
  return fetch(origin + path, { signal: AbortSignal.timeout(5000), ...options });
}

async function api(method, path, body, authorized = true) {
  const headers = { ...(authorized ? { Authorization: 'Bearer ' + token } : {}) };
  if (body != null) headers['Content-Type'] = 'application/json';
  const response = await get(path, {
    method,
    headers,
    ...(body != null && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { text: text.slice(0, 300) }; }
  return { status: response.status, data };
}

async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (exited) throw Error('Wrangler exited before becoming ready: ' + output);
    try {
      const response = await get('/latest');
      if (response.status === 200) return;
    } catch { /* worker is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw Error('Wrangler did not respond with HTTP 200: ' + output);
}

try {
  await ready();
  assert.equal((await get('/')).status, 200, 'homepage must render');
  assert.equal((await get('/blogs')).status, 200, 'source directory must render');
  assert.equal((await get('/c/sg-blogs')).status, 200, 'initial blog category must render');

  const unauthorized = await api('GET', '/api/admin/feedspace/groups', null, false);
  assert.equal(unauthorized.status, 404, 'admin API must not be publicly accessible');

  const groups = await api('GET', '/api/admin/feedspace/groups');
  assert.equal(groups.status, 200);
  assert.ok(groups.data.groups.some((g) => g.id === 'blogs'));

  const createGroup = await api('POST', '/api/admin/feedspace/groups', {
    id: 'forum', name: '论坛社区',
  });
  assert.equal(createGroup.status, 201, JSON.stringify(createGroup.data));

  const source = await api('POST', '/api/admin/feedspace/sources', {
    name: '本地接口测试订阅源',
    url: 'https://forum.example.com/',
    feed: 'https://forum.example.com/rss.xml',
    groupId: 'forum',
  });
  assert.equal(source.status, 201, JSON.stringify(source.data));

  assert.equal((await get('/c/sg-forum')).status, 200, 'custom group must render');

  const sources = await api('GET', '/api/admin/feedspace/sources?groupId=forum');
  assert.equal(sources.status, 200, JSON.stringify(sources.data));
  assert.equal(sources.data.sources.length, 1);
  const num = sources.data.sources[0].num;

  const renamed = await api('PATCH', '/api/admin/feedspace/sources/' + num, {
    name: '已编辑的测试订阅源',
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));

  const disabled = await api('DELETE', '/api/admin/feedspace/sources/' + num);
  assert.equal(disabled.status, 200, JSON.stringify(disabled.data));

  const enabled = await api('PATCH', '/api/admin/feedspace/sources/' + num, {
    enabled: true,
  });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.data));

  const finalSources = await api('GET', '/api/admin/feedspace/sources?groupId=forum');
  assert.equal(finalSources.data.sources[0].removed, 0);
  assert.equal(finalSources.data.sources[0].name, '已编辑的测试订阅源');

  console.log('PASS: local Wrangler Worker/D1 routes, HTML, authorization, category creation, RSS source CRUD, and snapshot refresh');
} catch (error) {
  console.error('Worker/D1 smoke test failed:', error);
  console.error('Wrangler output:\n', output);
  process.exitCode = 1;
} finally {
  if (!exited) child.kill('SIGTERM');
}
