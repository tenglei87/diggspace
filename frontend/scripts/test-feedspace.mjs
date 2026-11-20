import assert from 'node:assert/strict';
import { categoryName, timelinePage, directoryPage, hotPage } from '../worker/views.js';

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
assert.doesNotMatch(latest, /class="side-cats"/, 'sidebar category module is removed');
assert.doesNotMatch(latest, /<h2>分类<\/h2>/, 'no sidebar heading');
assert.match(latest, /<nav class="tabs" aria-label="主导航">/);
assert.match(latest, /href="\/c\/sg-blogs"/);
assert.match(latest, /href="\/c\/sg-forum"/);
assert.match(latest, /href="\/c\/sg-news"/);
assert.match(latest, /href="\/c\/sg-news" aria-current="page">资讯<\/a>/,
  'active top category must be highlighted');

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
assert.match(directory, /data-cat="sg-blogs"/);
assert.match(directory, /id="bloglist"/);

console.log('PASS: root latest posts, top blog/forum/news tabs, no sidebar categories, preserved /hot and source directory');
