// Read-only production verification after retiring the original Indi catalog.
// The deployment workflow refreshes the snapshot with bearer auth separately.
import assert from 'node:assert/strict';

const base = process.env.DIGGSPACE_URL;
const token = process.env.DIGGSPACE_ADMIN_TOKEN;
if (base !== 'https://digg.space' || !token) throw Error('Invalid production verification target');

async function request(path, opts = {}) {
  const headers = { ...opts.headers };
  if (opts.authorized) headers.Authorization = 'Bearer ' + token;
  return fetch(base + path, {
    method: opts.method || 'GET', headers, redirect: opts.redirect || 'follow',
    signal: AbortSignal.timeout(15000),
  });
}

let homepage;
for (let i = 0; i < 6; i++) {
  try {
    homepage = await request('/?verify=admin-redesign-20261120');
    if (homepage.status === 200) break;
  } catch { /* rollout propagation */ }
  await new Promise(r => setTimeout(r, 1400));
}
assert.equal(homepage?.status, 200, 'homepage responds');
const html = await homepage.text();
assert.match(html, /<nav class="tabs" aria-label="主导航">/);
assert.match(html, /href="\/discussions"/);
assert.match(html, /href="\/following"/);
assert.match(html, /href="https:\/\/indi\.blog\/"[^>]*>Indi · 中文独立博客/);
assert.doesNotMatch(html, /href="\/c\/sg-blogs"/);
assert.doesNotMatch(html, /href="\/c\/sg-forum"/);
assert.doesNotMatch(html, /href="\/c\/sg-news"/);
assert.doesNotMatch(html, /收录 <b>1,609<\/b>/, 'retired blog count is not displayed');
for (const path of ['/ai-hot', '/ai-daily', '/ai-weekly']) {
  const response = await request(path + '?removed=20261120');
  assert.equal(response.status, 404, 'removed third-party content route ' + path);
}
assert.doesNotMatch(html, /href="\/ai-(?:hot|daily|weekly)"/,
  'removed sections must not appear in the header');
// New independent administrator sources may already have articles.
 // Do not enforce an empty homepage after migration.

for (const path of ['/hot', '/blogs', '/discussions', '/admin/login', '/admin.js', '/admin.css']) {
  assert.equal((await request(path)).status, 200, path);
}
assert.equal((await request('/c/sg-blogs')).status, 404);
const admin = await request('/admin', { redirect: 'manual' });
assert.equal(admin.status, 302);
assert.equal(admin.headers.get('location'), '/admin/login');

assert.equal((await request('/api/admin/feedspace/sources')).status, 404);
assert.equal((await request('/api/admin/snapshot')).status, 404);
const groups = await request('/api/admin/feedspace/groups', { authorized: true });
assert.equal(groups.status, 200);
const body = await groups.json();
assert.ok(body.groups.some(group => group.id === 'feeds'));
assert.ok(!body.groups.some(group => group.id === 'blogs'));
const sources = await request('/api/admin/feedspace/sources?limit=100', { authorized: true });
assert.equal(sources.status, 200);
const sourceData = await sources.json();
assert.ok(sourceData.sources.every(s => s.source_origin !== 'retired_catalog'));
assert.ok(sourceData.sources.every(s => s.source_origin === 'manual'),
  'only independently managed subscriptions may remain');
console.log('Preserved manual RSS subscriptions:', sourceData.sources.length);
const email = await fetch(base + '/login', {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: 'preview-check@example.com' }).toString(),
});
assert.equal(email.status, 503, 'unconfigured email login must remain disabled');
console.log('PASS: Indi subscriptions retired; original 3 tabs, external Indi link, authenticated admin API and login page');
