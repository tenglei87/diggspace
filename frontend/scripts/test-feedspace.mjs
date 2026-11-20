import assert from 'node:assert/strict';
import { categoryName, timelinePage, directoryPage, hotPage } from '../worker/views.js';

const sourceGroups = [
  { id: 'feeds', name: '订阅源' },
  { id: 'forum', name: '论坛社区' },
  { id: 'news', name: '资讯网站' },
];
const stats = { blogs: 5, weekBlogs: 2, dayPosts: 3, stars: null, sourceGroups };
const context = { site: 'https://feedspace.example', stats, user: null, now: 1795000000 };

assert.equal(categoryName('sg-blogs', sourceGroups), undefined);
assert.equal(categoryName('sg-feeds', sourceGroups), '订阅源');
assert.equal(categoryName('sg-news', sourceGroups), '资讯网站');
assert.equal(categoryName('sg-unknown', sourceGroups), undefined);
assert.equal(categoryName('ai', sourceGroups), 'AI');

const latest = String(await timelinePage({
  ...context, voted: new Set(), posts: [], page: 1, hasMore: false, cat: 'sg-news',
}));
assert.match(latest, /<nav class="tabs" aria-label="主导航">/);
assert.match(latest, /href="\/" aria-current="page">最新<\/a>/);
assert.match(latest, /href="\/discussions">讨论<\/a>/);
assert.match(latest, /href="\/following">我的关注<\/a>/);
assert.doesNotMatch(latest, /href="\/c\/sg-blogs"/);
assert.doesNotMatch(latest, /href="\/c\/sg-forum"/);
assert.doesNotMatch(latest, /href="\/c\/sg-news"/);
assert.match(latest, /href="https:\/\/indi\.blog\/"[^>]*>Indi · 中文独立博客/);
assert.doesNotMatch(latest, /<h2>分类<\/h2>/);

const root = String(await timelinePage({
  ...context, voted: new Set(), page: 1, hasMore: true, cat: '',
  posts: [{
    id: 12, title: '新抓取的博客文章', url: 'https://example.com/posts/12',
    published_at: 1794996000, score: 0, comment_count: 0,
    blog: { id: 'example.com', num: 10, name: '测试博客' },
  }],
}));
assert.match(root, /<link rel="canonical" href="https:\/\/feedspace\.example\/"/);
assert.match(root, /新抓取的博客文章/, 'homepage displays newest article directly');
assert.match(root, /href="\/page\/2"/, 'latest pagination uses homepage URL');
assert.doesNotMatch(root, /<h2>分类<\/h2>/);

const hot = String(await hotPage({
  ...context, voted: new Set(), page: 1, hasMore: true, offset: 0, posts: [],
}));
assert.match(hot, /<link rel="canonical" href="https:\/\/feedspace\.example\/hot"/);
assert.match(hot, /href="\/hot\/page\/2"/, 'hot ranking remains available at /hot');

const directory = String(await directoryPage({
  ...context, blogs: [], following: new Set(), view: 'all',
}));
assert.match(directory, /data-cat="sg-forum"/);
assert.match(directory, /data-cat="sg-feeds"/);
assert.match(directory, /id="bloglist"/);

console.log('PASS: only latest/discussions/following tabs, Indi external link, no legacy blog category');
