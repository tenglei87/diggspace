import assert from 'node:assert/strict';
import { CATEGORIES, FEEDS, CATALOG_VERSION } from '../worker/catalog.js';
import { parseFeed, fetchFeed } from '../../scripts/lib/feed.mjs';
assert.deepEqual(CATEGORIES.map(c => c.name), ['热搜','资讯','软件','技术','奇趣','财富','英文']);
assert.equal(FEEDS.length, 78, 'curated source count');
assert.equal(new Set(FEEDS.map(s=>s.id)).size, FEEDS.length, 'unique source IDs');
assert.equal(new Set(FEEDS.map(s=>s.feed)).size, FEEDS.length, 'unique URLs');
assert.ok(FEEDS.every(s=>CATEGORIES.some(c=>c.id===s.category)));
assert.ok(FEEDS.every(s=>/^https?:\/\//.test(s.feed) && /^r-[0-9a-f]{8}$/.test(s.id)));
assert.ok(!FEEDS.some(s=>/aihot\.news/i.test(s.feed+s.name)));
assert.ok(CATALOG_VERSION.length > 10);
const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>测试 &amp; RSS</title><link>https://example.org/a</link>
<pubDate>Fri, 20 Nov 2026 02:00:00 GMT</pubDate><description>RSS 文章摘要</description></item>
</channel></rss>`;
const parsed = parseFeed(rss, 'https://example.org/feed.xml',
  Date.parse('2026-11-20T03:00:00Z'));
assert.equal(parsed.feedType, 'rss');
assert.equal(parsed.entries[0].title, '测试 & RSS');
assert.equal(parsed.entries[0].url, 'https://example.org/a');
// Malicious numeric entities must not crash an entire crawl.
const broken = rss.replace('测试 &amp; RSS', '&#x110000; &#55296; 正常');
const parsedBroken = parseFeed(broken, 'https://example.org/feed.xml');
assert.equal(parsedBroken.entries[0].title, '� � 正常');

// Each fetch must validate redirects; never silently fetch private IPs or
// forward conditional headers to a different host.
const originalFetch = globalThis.fetch;
try {
  let calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/internal' } });
  };
  const blocked = await fetchFeed({ feed: 'https://example.org/feed.xml' });
  assert.equal(blocked.status, 'http_error');
  assert.match(blocked.error, /unsafe feed redirect/);
  assert.equal(calls.length, 1, 'must not follow private IP redirect');
  assert.equal(calls[0].options.redirect, 'manual');

  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? new Response(null, { status: 301, headers: { location: 'https://example.net/feed.xml' } })
      : new Response(rss, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
  };
  const redirected = await fetchFeed({
    feed: 'https://example.org/feed.xml', etag: '"old-revision"',
  }, Date.parse('2026-11-20T03:00:00Z'));
  assert.equal(redirected.status, 'ok');
  assert.equal(redirected.redirectedTo, 'https://example.net/feed.xml');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['If-None-Match'], '"old-revision"');
  assert.equal(calls[1].options.headers['If-None-Match'], undefined);

  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 302, headers: { location: '/again' } });
  };
  const loop = await fetchFeed({ feed: 'https://example.org/feed.xml' });
  assert.equal(loop.status, 'http_error');
  assert.match(loop.error, /excessive/);
  assert.equal(calls.length, 5, 'redirect chain must be bounded');

  calls = [];
  const invalid = await fetchFeed({ feed: 'http://localhost/feed.xml' });
  assert.equal(invalid.status, 'network_error');
  assert.equal(calls.length, 0);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS: 78 curated RSS feeds, XML hardening, safe redirect limits and conditional headers');
