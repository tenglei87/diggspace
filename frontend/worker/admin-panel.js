// Independent DiggSpace administrator sign-in. No third-party login,
// JavaScript-visible token, or password stored in D1. Admin sessions are
// HMAC-signed cookies derived from the existing ADMIN_TOKEN Worker secret.
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
const COOKIE = 'digg_admin';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();

async function hmac(keyText, message) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
}

async function sameTextSecret(a, b) {
  // Compare fixed-length digests instead of early-ending on a common prefix.
  const hash = async t => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(t)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function hasAdminSession(c) {
  const secret = c.env.ADMIN_TOKEN;
  if (!secret || secret.length < 32) return false;
  const cookie = getCookie(c, COOKIE) ?? '';
  const m = /^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(cookie);
  if (!m) return false;
  const expires = Number(m[1]);
  if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) ||
      expires > Math.floor(Date.now() / 1000) + SESSION_SECONDS) return false;
  const body = m[1] + '.' + m[2];
  const expected = await hmac(secret, body);
  return sameTextSecret(m[3], expected);
}

function page(title, body, script = false) {
  return \`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>\${title} · DiggSpace</title>
<link rel="stylesheet" href="/admin.css"></head>
<body><header class="admin-header"><a href="/" class="brand">DiggSpace</a><span>RSS 管理后台</span></header>
<main class="admin-main">\${body}</main>
\${script ? '<script src="/admin.js" defer></script>' : ''}</body></html>\`;
}

const loginHtml = (invalid = false) => page('管理员登录',
  \`<section class="panel login"><h1>管理员登录</h1><p class="hint">使用你设置的 DIGGSPACE_ADMIN_TOKEN 管理员密钥登录。</p>
   \${invalid ? '<p class="error" role="alert">密钥错误，请重试。</p>' : ''}
   <form action="/admin/login" method="post" autocomplete="off">
   <label for="password">管理员密钥</label>
   <input id="password" type="password" name="password" required minlength="32" autocomplete="current-password" spellcheck="false" />
   <button type="submit">登录后台</button></form>
   <p class="hint">密钥只用于一次登录校验，不会出现在浏览器脚本中；会话 8 小时后失效。</p></section>\`);

const dashboardHtml = page('订阅源管理', \`
<section class="admin-toolbar">
  <div><h1>订阅源管理</h1><p class="hint">管理本站自己的 RSS / Atom 来源，不再自动导入 Indi 博客目录。</p></div>
  <form method="post" action="/admin/logout"><button class="secondary" type="submit">退出登录</button></form>
</section>
<section class="panel">
  <h2 id="form-title">新增订阅源</h2>
  <form id="source-form">
    <input type="hidden" id="editing" value="">
    <div class="fields">
      <label>来源名称<input id="feed-name" name="name" required maxlength="120" placeholder="例如：设计观察" /></label>
      <label>网站地址<input id="site-url" name="url" type="url" required placeholder="https://example.com/" /></label>
      <label>RSS / Atom 地址<input id="feed-url" name="feed" type="url" required placeholder="https://example.com/feed.xml" /></label>
      <label>内容类型<select id="group-id" name="groupId"><option value="feeds">普通订阅</option></select></label>
    </div>
    <div class="controls"><button type="submit" id="save">保存来源</button><button type="button" id="cancel" class="secondary" hidden>取消编辑</button></div>
    <p id="form-message" class="message" aria-live="polite"></p>
  </form>
</section>
<section class="panel"><div class="list-title"><h2>已添加的来源</h2>
<button class="secondary" id="refresh" type="button">刷新列表</button></div>
<p class="hint">停用后不再抓取；删除会隐藏来源和文章，并保留数据以便恢复。</p>
<div class="table-wrap"><table><thead><tr><th>名称 / 网址</th><th>类型</th><th>状态</th><th>操作</th></tr></thead><tbody id="sources"><tr><td colspan="4">正在加载…</td></tr></tbody></table></div>
<div class="controls"><button class="secondary" id="more" hidden type="button">加载更多</button><button id="crawl" type="button" class="secondary">抓取到期 RSS（最多 5 个）</button></div>
<p id="crawl-message" class="message" aria-live="polite"></p>
</section>\`, true);

export function registerAdminPanelRoutes(app) {
  app.get('/admin/login', async c => {
    if (await hasAdminSession(c)) return c.redirect('/admin', 302);
    return c.html(loginHtml(), 200, { 'Cache-Control': 'no-store' });
  });

  app.post('/admin/login', async c => {
    const length = Number(c.req.header('Content-Length') || 0);
    if (length > 2048) return c.text('Too large', 413);
    const raw = await c.req.text();
    if (raw.length > 2048) return c.text('Too large', 413);
    const password = new URLSearchParams(raw).get('password') || '';
    const secret = c.env.ADMIN_TOKEN || '';
    if (secret.length < 32 || password.length < 32 || password.length > 512 ||
        !await sameTextSecret(password, secret)) {
      return c.html(loginHtml(true), 401, { 'Cache-Control': 'no-store' });
    }
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      x => x.toString(16).padStart(2, '0')).join('');
    const body = expires + '.' + nonce;
    setCookie(c, COOKIE, body + '.' + await hmac(secret, body), {
      httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: SESSION_SECONDS,
    });
    c.header('Cache-Control', 'no-store');
    return c.redirect('/admin', 303);
  });

  app.get('/admin', async c => {
    if (!await hasAdminSession(c)) return c.redirect('/admin/login', 302);
    return c.html(dashboardHtml, 200, { 'Cache-Control': 'private, no-store' });
  });

  app.post('/admin/logout', async c => {
    deleteCookie(c, COOKIE, { path: '/', secure: true, sameSite: 'Strict' });
    c.header('Cache-Control', 'no-store');
    return c.redirect('/admin/login', 303);
  });
}
