// DiggSpace: a read-only, code-curated RSS newspaper.
// No users, logins, discussion, follows, admin endpoints or live catalog API.
import { Hono } from 'hono';
import { html } from 'hono/html';
import { CATEGORIES } from './catalog.js';
import { crawlNews, latestNews, listSources, sourceStats, syncCatalog } from './news.js';

const app = new Hono();
const PAGE_SIZE = 50;
const NAV = [{ id: '', name: '最新', href: '/' },
  ...CATEGORIES.map(c => ({ ...c, href: '/c/' + c.id }))];
const labelFor = id => id ? CATEGORIES.find(c => c.id === id)?.name : '最新';
const shortTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const validHttp = raw => {
  try { const u = new URL(raw); return ['https:', 'http:'].includes(u.protocol) ? u.href : '#'; }
  catch { return '#'; }
};
const siteUrl = c => c.env.SITE_URL || new URL(c.req.url).origin;
const pageNumber = c => {
  const value = Number(c.req.query('page') || 1);
  return Number.isSafeInteger(value) && value > 0 && value <= 100 ? value : null;
};

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Content-Security-Policy',
    "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
});

function shell({ title, category = '', base, content, stats, canonical = '/' }) {
  const fullTitle = title === '最新' ? 'DiggSpace · RSS 新闻聚合' : title + ' · DiggSpace';
  const description = '精选 RSS 新闻：热搜、资讯、软件、奇趣、财富、英文、技术，按时间聚合，直接阅读原文。';
  return html`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>${fullTitle}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${base + canonical}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/style.css">
</head>
<body><div class="wrap">
<header class="top">
  <a class="brand" href="/">DiggSpace</a>
  <nav class="tabs" aria-label="主导航">
  ${NAV.map(tab => html`<a href="${tab.href}"${tab.id === category ? html` aria-current="page"` : ''}>${tab.name}</a>`)}
  </nav>
</header>
<div class="page">
 <main id="content">${content}</main>
 <aside class="side">
   <h2>RSS 聚合</h2>
   <p class="stats">订阅 <strong>${stats.sources}</strong> 个来源<br>
   24 小时收录 <strong>${stats.recent}</strong> 篇文章</p>
   <p class="side-links"><a href="/sources">查看全部订阅源</a><br>
   <a href="https://indi.blog/" target="_blank" rel="noopener noreferrer">Indi · 中文独立博客</a><br>
   <a href="https://github.com/weekend-project-space/top-rss-list" target="_blank" rel="noopener noreferrer">RSS 来源参考</a></p>
   <p class="about">所有订阅源由本站代码维护，按固定频率抓取。
    点击标题直达原文；不设登录、评论或关注功能。</p>
   ${stats.lastSuccess ? html`<p class="about">上次成功抓取：${shortTime.format(stats.lastSuccess * 1000)}</p>` : ''}
 </aside>
</div>
<footer class="footer">DiggSpace · 独立 RSS 内容聚合 · 内容版权归原站所有</footer>
</div></body></html>`;
}

async function renderTimeline(c, category = '') {
  if (labelFor(category) == null) return c.notFound();
  const page = pageNumber(c);
  if (!page) return c.notFound();
  await syncCatalog(c.env.DB);
  const [data, stats] = await Promise.all([
    latestNews(c.env.DB, category, page, PAGE_SIZE),
    sourceStats(c.env.DB),
  ]);
  const basePath = category ? '/c/' + category : '/';
  const hrefFor = p => basePath + (p > 1 ? '?page=' + p : '');
  const title = labelFor(category);
  const content = html`<section class="stream">
    <div class="section-head">
      <h1>${title}</h1>
      <span>${category ? '分类资讯' : '全部新闻 · 按发布时间排序'}</span>
    </div>
    ${data.items.length ? html`<ol class="items">${data.items.map(item => html`<li class="item">
      <span class="av" aria-hidden="true">${Array.from(item.source_name)[0] || '·'}</span>
      <div class="item-main">
        <a class="item-title" href="${validHttp(item.url)}"
           rel="noopener noreferrer" target="_blank">${item.title}</a>
        <div class="meta"><span>${item.source_name}</span>
          <time datetime="${new Date(item.published_at * 1000).toISOString()}">${shortTime.format(item.published_at * 1000)}</time>
          ${!category ? html`<a href="/c/${item.category}">${labelFor(item.category)}</a>` : ''}
        </div>
      </div>
    </li>`)}</ol>` :
      html`<p class="empty-note">暂无文章，已配置的 RSS 来源将在定时抓取成功后显示内容。</p>`}
    ${page > 1 || data.hasMore ? html`<nav class="pager" aria-label="分页">
      ${page > 1 ? html`<a href="${hrefFor(page - 1)}">← 上一页</a>` : html`<span></span>`}
      <span>第 ${page} 页</span>
      ${data.hasMore ? html`<a href="${hrefFor(page + 1)}">下一页 →</a>` : html`<span></span>`}
    </nav>` : ''}
  </section>`;
  c.header('Cache-Control', 'public, max-age=30');
  return c.html(shell({
    title, category, base: siteUrl(c), content, stats,
    canonical: hrefFor(page),
  }));
}

app.get('/', c => renderTimeline(c));
app.get('/c/:category', c => renderTimeline(c, c.req.param('category')));
app.get('/latest', c => c.redirect('/', 301));
app.get('/hot', c => c.redirect('/c/hot', 301));
app.get('/page/:page', c => c.redirect('/?page=' + c.req.param('page'), 301));

app.get('/sources', async c => {
  await syncCatalog(c.env.DB);
  const [sources, stats] = await Promise.all([listSources(c.env.DB), sourceStats(c.env.DB)]);
  const content = html`<section class="stream"><div class="section-head">
    <h1>订阅来源</h1><span>${sources.length} 个 · 在代码中管理</span></div>
    ${CATEGORIES.map(category => html`<section class="source-group" id="${category.id}">
      <h2><a href="/c/${category.id}">${category.name}</a></h2>
      <ul>${sources.filter(s => s.category === category.id).map(source => html`<li>
        <span>${source.name}</span><a href="${validHttp(source.feed_url)}"
          rel="nofollow noopener noreferrer" target="_blank">RSS</a>
      </li>`)}</ul>
    </section>`)}</section>`;
  return c.html(shell({ title: '订阅来源', category: 'none', base: siteUrl(c),
    canonical: '/sources', content, stats }));
});

app.get('/robots.txt', c => c.text('User-agent: *\nAllow: /\nSitemap: https://digg.space/sitemap.xml\n'));
app.get('/sitemap.xml', c => {
  const site = siteUrl(c);
  const urls = ['/', ...CATEGORIES.map(x => '/c/' + x.id), '/sources'];
  return c.body('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(path => '<url><loc>' + site + path + '</loc></url>').join('') + '</urlset>', 200,
    { 'Content-Type': 'application/xml; charset=utf-8' });
});

app.notFound(c => c.html('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>404 · DiggSpace</title><body><p>页面不存在 · <a href="/">返回最新</a></p></body></html>', 404));
app.onError((err, c) => { console.error(err); return c.text('服务暂不可用', 500); });

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(crawlNews(env.DB).catch(error => console.error('RSS crawl failed', error)));
  },
};
