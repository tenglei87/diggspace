// End-to-end smoke tests with a real local Wrangler Worker + D1 database.
// This is not a production network test; no external feeds are fetched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const origin = 'http://127.0.0.1:18787';
const token = 'ci-local-admin-token-0123456789abcdef0123456789';
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
  const homepage = await get('/');
  assert.equal(homepage.status, 200, 'homepage must render directly');
  const homepageHtml = await homepage.text();
  assert.match(homepageHtml, /本地测试文章：屏蔽前应显示在最新和最热/,
    'root displays latest articles already in D1');
  assert.match(homepageHtml, /<nav class="tabs" aria-label="主导航">/,
    'blog/forum/news navigation stays in the header');
  assert.match(homepageHtml, /href="\/discussions"/);
  assert.match(homepageHtml, /href="\/following"/);
  assert.match(homepageHtml, /https:\/\/indi\.blog\//);
  assert.doesNotMatch(homepageHtml, /href="\/c\/sg-blogs"/);
  assert.doesNotMatch(homepageHtml, /href="\/c\/sg-forum"/);
  assert.doesNotMatch(homepageHtml, /href="\/c\/sg-news"/);
  assert.doesNotMatch(homepageHtml, /<h2>分类<\/h2>/,
    'sidebar category module has been removed');
  const legacyLatest = await get('/latest', { redirect: 'manual' });
  assert.equal(legacyLatest.status, 301, '/latest redirects to canonical homepage');
  assert.equal(legacyLatest.headers.get('location'), '/', '/latest points to homepage');
  assert.equal((await get('/hot')).status, 200, 'legacy hot ranking remains available');
  for (const [path, label] of [
    ['/ai-hot', 'AI 热点'],
    ['/ai-daily', 'AI 日报'],
    ['/ai-weekly', 'AI 周报'],
  ]) {
    const res = await get(path);
    assert.equal(res.status, 200, path + ' native AIHOT page must render');
    const html = await res.text();
    assert.match(html, new RegExp(label));
    assert.match(html, /书面授权/, 'third-party data cannot be republished without permission');
    assert.match(html, /href="https:\/\/aihot\.news\//);
  }

  assert.equal((await get('/blogs')).status, 200, 'source directory must render');
  assert.equal((await get('/c/sg-blogs')).status, 404, 'retired blog category is gone');
  assert.equal((await get('/c/sg-feeds')).status, 200, 'default RSS source category still resolves');

  const unauthorized = await api('GET', '/api/admin/feedspace/groups', null, false);
  assert.equal(unauthorized.status, 404, 'admin API must not be publicly accessible');

  const groups = await api('GET', '/api/admin/feedspace/groups');
  assert.equal(groups.status, 200);
  assert.ok(groups.data.groups.some((g) => g.id === 'feeds'));
  assert.ok(!groups.data.groups.some((g) => g.id === 'blogs'));

  const anon = await get('/admin', { redirect: 'manual' });
  assert.equal(anon.status, 302, 'admin requires an authenticated session');
  assert.equal(anon.headers.get('location'), '/admin/login');
  assert.equal((await get('/admin/login')).status, 200);
  const wrong = await get('/admin/login', { method: 'POST',
    body: new URLSearchParams({ password: 'a'.repeat(40) }),
    headers: { Origin: origin } });
  assert.equal(wrong.status, 401);
  const login = await get('/admin/login', { method: 'POST',
    body: new URLSearchParams({ password: token }),
    headers: { Origin: origin }, redirect: 'manual' });
  assert.equal(login.status, 303);
  const setCookie = login.headers.get('set-cookie') || '';
  assert.match(setCookie, /digg_admin=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(';')[0];
  const dashboard = await get('/admin', { headers: { Cookie: cookie } });
  assert.equal(dashboard.status, 200);
  const dashboardHTML = await dashboard.text();
  assert.match(dashboardHTML, /订阅源管理/);
  assert.doesNotMatch(dashboardHTML, /ci-local-admin-token-0123456789abcdef0123456789/);
  const readByCookie = await get('/api/admin/feedspace/groups', { headers: { Cookie: cookie } });
  assert.equal(readByCookie.status, 200, 'browser session can read management API');
  const crossSite = await get('/api/admin/feedspace/groups', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://attacker.example.com' },
    body: JSON.stringify({ id: 'crosssite', name: '攻击' }) });
  assert.equal(crossSite.status, 404, 'cross-origin cookie writes are blocked');
  const missingOrigin = await get('/api/admin/feedspace/groups', { method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'noorigin', name: '无来源' }) });
  assert.equal(missingOrigin.status, 404, 'cookie mutations without Origin are blocked');

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
