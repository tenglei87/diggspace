import assert from 'node:assert/strict';
import { categoryName, timelinePage, directoryPage } from '../worker/views.js';

const sourceGroups = [
  { id: 'blogs', name: '独立博客' },
  { id: 'forum', name: '论坛社区' },
  { id: 'news', name: '资讯网站' },
];
const stats = { blogs: 5, weekBlogs: 2, dayPosts: 3, stars: null, sourceGroups };
const context = { site: 'https://feedspace.example', stats, user: null, now: 1795000000 };

assert.equal(categoryName('sg-blogs', sourceGroups), '独立博客');
assert.equal(categoryName('sg-news', sourceGroups), '资讯网站');
assert.equal(categoryName('sg-unknown', sourceGroups), undefined);
assert.equal(categoryName('ai', sourceGroups), 'AI');

const latest = String(await timelinePage({
  ...context, voted: new Set(), posts: [], page: 1, hasMore: false, cat: 'sg-news',
}));
assert.match(latest, /\/c\/sg-blogs/);
assert.match(latest, /\/c\/sg-news/);
assert.match(latest, /资讯网站/);
assert.match(latest, /class="side-cats"/);

const directory = String(await directoryPage({
  ...context, blogs: [], following: new Set(), view: 'all',
}));
assert.match(directory, /data-cat="sg-forum"/);
assert.match(directory, /data-cat="sg-blogs"/);
assert.match(directory, /id="bloglist"/);

console.log('PASS: source-group categories render in original Indi layout; legacy categories resolve');
