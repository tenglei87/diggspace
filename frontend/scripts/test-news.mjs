import assert from 'node:assert/strict';
import { CATEGORIES, FEEDS, CATALOG_VERSION } from '../worker/catalog.js';
import { parseFeed } from '../../scripts/lib/feed.mjs';
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
console.log('PASS: 78 curated RSS feeds, 7 categories, no AIHOT, stable IDs and RSS parsing');
