import assert from 'node:assert/strict';
import { aihotPage } from '../worker/views-aihot.js';
import { CHANNELS, loadAIHOT, parseAIHOT, publicDisplayAllowed, nextCheck } from '../worker/aihot.js';

const hot = { schemaVersion: 1, count: 1, items: [{
  rank: 1, id: 'story-1', title: '测试热点', source: { name: '官方来源' },
  links: { aihot: 'https://aihot.news/stories/test', original: 'https://example.com/story' },
  sourceCount: 3, signalCount: 2, sourceNames: ['A', 'B'], latestAt: '2026-11-20T02:00:00+08:00',
}] };
const daily = { schemaVersion: 1, report: {
  date: '2026-11-20', links: { aihot: 'https://aihot.news/daily/2026-11-20' },
  lead: { title: '测试日报', leadParagraph: '今日概览' },
  sections: [{ label: '模型发布', items: [{
    title: '测试模型', summary: '摘要', source: { name: '原作者' },
    links: { aihot: 'https://aihot.news/articles/123', original: 'https://example.com/source' }
  }] }],
}};
const weekly = { schemaVersion: 1, report: {
  week: '2026-W47', links: { aihot: 'https://aihot.news/weekly/2026-W47' },
  headline: '测试周报', overview: '本周概览',
  sections: [{ label: '一周重点', summary: '小结', items: [{
    title: '测试事件', summary: '摘要', source: { name: '新闻源' },
    links: { aihot: 'https://aihot.news/articles/456', original: 'https://example.com/news' },
  }] }],
}};

assert.equal(CHANNELS.hot.endpoint, '/api/v1/hot-topics');
assert.equal(CHANNELS.daily.endpoint, '/api/v1/dailies/latest');
assert.equal(CHANNELS.weekly.endpoint, '/api/v1/weeklies/latest');
assert.equal(publicDisplayAllowed({}), false);
assert.equal(publicDisplayAllowed({ AIHOT_PUBLIC_DISPLAY_ALLOWED: 'false' }), false);
assert.equal(publicDisplayAllowed({ AIHOT_PUBLIC_DISPLAY_ALLOWED: 'true' }), true);

assert.equal(nextCheck('hot', 1000), 1300);
assert.equal(nextCheck('daily', Date.parse('2026-11-20T00:00:00+08:00') / 1000),
  Date.parse('2026-11-20T08:10:00+08:00') / 1000);
assert.equal(nextCheck('weekly', Date.parse('2026-11-20T00:00:00+08:00') / 1000),
  Date.parse('2026-11-23T10:10:00+08:00') / 1000);

assert.equal(parseAIHOT('hot', hot).entries[0].title, '测试热点');
assert.equal(parseAIHOT('daily', daily).sections[0].entries[0].title, '测试模型');
assert.equal(parseAIHOT('weekly', weekly).sections[0].entries[0].title, '测试事件');
assert.throws(() => parseAIHOT('hot', { schemaVersion: 2, items: [] }), /schemaVersion/);

class FakeDB {
  constructor() { this.data = new Map(); this.operations = 0; }
  prepare(sql) {
    return {
      bind: (...params) => ({
        first: async () => {
          this.operations++;
          const row = this.data.get(params[0]);
          return row ? structuredClone(row) : null;
        },
        run: async () => {
          this.operations++;
          const kind = sql.includes('AND next_at <= ?') ? params[1] : params.at(-1);
          if (sql.startsWith('INSERT OR IGNORE')) {
            if (!this.data.has(params[0])) this.data.set(params[0],
              { payload: null, etag: null, next_at: 0, lock_until: 0, checked_at: 0 });
            return { meta: { changes: 1 } };
          }
          const row = this.data.get(kind);
          if (sql.includes('AND next_at <= ?')) {
            if (row.next_at > params[2] || row.lock_until > params[3]) return { meta: { changes: 0 } };
            row.lock_until = params[0];
          } else if (sql.includes('SET payload = ?')) {
            [row.payload, row.etag, row.checked_at, row.next_at, row.lock_until] =
              [params[0], params[1], params[2], params[3], 0];
          } else if (sql.includes('SET checked_at = ?')) {
            row.checked_at = params[0]; row.next_at = params[1]; row.lock_until = 0;
          } else if (sql.includes('SET next_at = ?')) {
            row.next_at = params[0]; row.lock_until = 0;
          } else throw Error('Unknown fake D1 update: ' + sql);
          return { meta: { changes: 1 } };
        },
      }),
    };
  }
}

const db = new FakeDB();
const noLicense = await loadAIHOT(db, 'hot', {}, { fetcher: () => { throw Error('must not call AIHOT'); } });
assert.equal(noLicense.status, 'unlicensed');
assert.equal(db.operations, 0, 'no private or public requests without written permission');

const env = { AIHOT_PUBLIC_DISPLAY_ALLOWED: 'true' };
let calls = 0, seenETag = '';
const one = await loadAIHOT(db, 'hot', env, {
  now: 1000,
  fetcher: async (url, options) => {
    calls++; assert.equal(url, 'https://aihot.news/api/v1/hot-topics');
    seenETag = options.headers['If-None-Match'] || '';
    return new Response(JSON.stringify(hot), { status: 200, headers: { ETag: '"hot-v1"' } });
  },
});
assert.equal(one.status, 'fresh');
assert.equal(one.payload.entries.length, 1);
assert.equal(calls, 1);
assert.equal(seenETag, '');
const cached = await loadAIHOT(db, 'hot', env, { now: 1100,
  fetcher: () => { throw Error('must use D1 cache'); } });
assert.equal(cached.status, 'cached');
assert.equal(calls, 1);

const unchanged = await loadAIHOT(db, 'hot', env, {
  now: 1301,
  fetcher: async (url, options) => {
    calls++; assert.equal(options.headers['If-None-Match'], '"hot-v1"');
    return new Response(null, { status: 304 });
  },
});
assert.equal(unchanged.status, 'cached');
assert.equal(calls, 2);

const throttled = await loadAIHOT(db, 'hot', env, {
  now: 1700,
  fetcher: async () => new Response('429', {
    status: 429, headers: { 'Retry-After': '240' },
  }),
});
assert.equal(throttled.status, 'stale');
assert.equal(db.data.get('hot').next_at, 1940);

const page = String(await aihotPage({
  kind: 'hot', status: 'fresh', payload: one.payload,
  site: 'https://digg.space', path: '/ai-hot', stats: null, user: null,
}));
assert.match(page, /测试热点/);
assert.match(page, /href="https:\/\/aihot\.news\/stories\/test"/);
assert.match(page, /AI热点/);
assert.match(page, /AI日报/);
assert.match(page, /AI周报/);
const lockedPage = String(await aihotPage({
  kind: 'daily', status: 'unlicensed', payload: null,
  site: 'https://digg.space', path: '/ai-daily', stats: null, user: null,
}));
assert.match(lockedPage, /书面授权/);
assert.doesNotMatch(lockedPage, /测试模型|测试日报/);

console.log('PASS: AIHOT v1 adapter, 3 views, gated fetch, ETag 304, 429 Retry-After and publication cadence');
