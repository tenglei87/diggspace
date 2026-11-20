// Read-only validation of the freshly deployed digg.space custom domain.
// Never inserts test records into the production D1 database.
import assert from 'node:assert/strict';

const base = process.env.DIGGSPACE_URL;
const token = process.env.DIGGSPACE_ADMIN_TOKEN;
if (base !== 'https://digg.space' || !token) {
  throw new Error('Expected https://digg.space and a configured admin token');
}

async function request(path, { authorized = false, method = 'GET', headers = {}, body } = {}) {
  const h = { ...headers };
  if (authorized) h.Authorization = 'Bearer ' + token;
  const res = await fetch(base + path, {
    method, headers: h, body, signal: AbortSignal.timeout(15000),
  });
  return res;
}

async function statusEventually(path, expected) {
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await request(path);
      last = r.status;
      if (last === expected) return r;
    } catch (err) {
      last = err.message;
    }
    await new Promise((done) => setTimeout(done, 1500));
  }
  throw new Error('Unexpected HTTP status for ' + path + ': ' + last);
}

const homepageResponse = await statusEventually('/', 200);
const homepageHtml = await homepageResponse.text();
assert.match(homepageHtml, /<nav class="tabs" aria-label="主导航">/);
assert.match(homepageHtml, /href="\/c\/sg-blogs"/);
assert.match(homepageHtml, /href="\/c\/sg-forum"/);
assert.match(homepageHtml, /href="\/c\/sg-news"/);
assert.doesNotMatch(homepageHtml, /<h2>分类<\/h2>/, 'sidebar categories must be removed');
assert.match(homepageHtml, /class="item-title"/, 'homepage must show at least one actual RSS article');
const latestAlias = await fetch(base + '/latest', { redirect: 'manual', signal: AbortSignal.timeout(15000) });
assert.equal(latestAlias.status, 301, '/latest redirects to homepage');
assert.equal(new URL(latestAlias.headers.get('location'), base).pathname, '/');
for (const path of ['/hot', '/blogs', '/c/sg-blogs', '/c/sg-forum', '/c/sg-news']) {
  assert.equal((await request(path)).status, 200, path + ' should render');
}
assert.equal((await request('/api/admin/feedspace/groups')).status, 404,
  'admin list must be protected');
const groups = await request('/api/admin/feedspace/groups', { authorized: true });
assert.equal(groups.status, 200, 'authenticated admin list must succeed');
const json = await groups.json();
assert.ok(json.groups.some((x) => x.id === 'blogs'), 'independent blogs must be available');
const sources = await request('/api/admin/feedspace/sources?limit=1', { authorized: true });
assert.equal(sources.status, 200, 'D1 source list must be accessible');
const emailForm = new URLSearchParams({ email: 'preview-check@example.com' });
const email = await request('/login', {
  method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: emailForm.toString(),
});
assert.equal(email.status, 503, 'email login must fail closed until configured');
console.log('PASS: deployed pages, own D1, authenticated admin API, disabled unsafe email login');
