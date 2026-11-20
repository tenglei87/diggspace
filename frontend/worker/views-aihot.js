// DiggSpace native AIHOT UI, reusing the original Indi page layout.
import { html, raw } from 'hono/html';
import { layout } from './views.js';

const INFO = {
 hot: { name: 'AI 热点', original: 'https://aihot.news/hot' },
 daily: { name: 'AI 日报', original: 'https://aihot.news/daily' },
 weekly: { name: 'AI 周报', original: 'https://aihot.news/weekly' },
};
const toAIHOT = url => /^https:\/\/aihot\.news(?:\/|$)/.test(url || '')
  ? url : 'https://aihot.news/';
const toOriginal = url => /^https?:\/\/[a-z0-9-]+\.[a-z0-9.-]+(?:\/|$)/i.test(url || '')
  ? url : '#';

function entries(items, ranked) {
  return `<ol class="aihot-list">${items.slice(0, 25).map(item => html`<li class="aihot-entry">
    ${ranked ? html`<span class="aihot-rank">${item.rank}</span>` : ''}
    <div class="aihot-copy">
      <a class="aihot-heading" href="${toAIHOT(item.url)}" target="_blank" rel="noopener noreferrer">${item.title}</a>
      ${item.summary ? html`<p>${item.summary}</p>` : ''}
      <div class="aihot-meta">${item.source || 'AIHOT'}
        ${item.count ? html` · ${item.count} 个来源` : ''}
        ${item.original && item.original !== item.url ? html` · <a href="${toOriginal(item.original)}" target="_blank" rel="noopener noreferrer">原文</a>` : ''}
      </div>
    </div>
  </li>`)}</ol>`;
}

export function aihotPage({ kind, status, payload, site, path, stats, user }) {
  const config = INFO[kind];
  if (!config) throw Error('Unknown AIHOT channel');

  let contents;
  if (status === 'unlicensed') {
    contents = html`<div class="aihot-permission">
      <h2>AIHOT 阅读入口</h2>
      <p>此栏目已接入 AIHOT 官方 API v1 的数据格式。按照 AIHOT 的公开使用规则，面向公众展示其持续更新的热点、日报或周报前需要取得书面授权，因此本站暂不复制其内容。</p>
      <p><a href="${config.original}" target="_blank" rel="noopener noreferrer">前往 AIHOT 阅读${config.name} →</a></p>
      <p class="aihot-muted">取得授权后，可通过现有 Cloudflare 部署设置启用本地阅读视图。</p>
    </div>`;
  } else if (!payload) {
    contents = html`<p class="empty-note">当前数据暂不可用，请通过 <a href="${config.original}" target="_blank" rel="noopener noreferrer">AIHOT 原站</a>阅读。</p>`;
  } else if (kind === 'hot') {
    contents = html`<p class="aihot-muted">AIHOT 当前热点榜，按事件讨论热度排序</p>
      ${raw(entries(payload.entries, true))}`;
  } else {
    contents = html`<div class="aihot-report-head">
      <span class="aihot-muted">${payload.issue}</span>
      <h2>${payload.headline}</h2>
      ${payload.overview ? html`<p class="aihot-overview">${payload.overview}</p>` : ''}
      <a href="${toAIHOT(payload.url)}" target="_blank" rel="noopener noreferrer">在 AIHOT 阅读完整${config.name} →</a>
    </div>
    ${payload.sections.map(section => html`<section class="aihot-section">
      <h3>${section.label}</h3>
      ${section.intro ? html`<p class="aihot-muted">${section.intro}</p>` : ''}
      ${raw(entries(section.entries, false))}
    </section>`)}`;
  }

  return layout({
    site, path, title: config.name + ' · DiggSpace',
    description: 'DiggSpace 的' + config.name + '阅读入口，来源 AIHOT。',
    nav: 'ai-' + kind, stats, user,
    body: html`<div class="aihot-page">
      <div class="aihot-page-head"><h1>${config.name}</h1>
        <a href="${config.original}" target="_blank" rel="noopener noreferrer">来源：AIHOT ↗</a></div>
      ${contents}
      <p class="aihot-credit">数据来源：<a href="https://aihot.news/" target="_blank" rel="noopener noreferrer">AIHOT</a>。DiggSpace 非 AIHOT 官方网站或合作伙伴。详见 <a href="https://aihot.news/terms" target="_blank" rel="noopener noreferrer">AIHOT 公开使用规则</a>。</p>
    </div>`,
  });
}
