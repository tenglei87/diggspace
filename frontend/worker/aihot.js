// AIHOT public API 2.0.0: https://aihot.news/openapi-v1.json
// Read-only; no API key. Usage rights are independent of technical access.
// External public reuse is disabled until written permission is obtained.
// This module never exposes a raw API proxy or stores AIHOT data as RSS posts.
import { aihotPage } from './views.js';

export const CHANNELS = Object.freeze({
  hot: {
    path: '/ai-hot',
    title: 'AI 热点',
    endpoint: '/api/v1/hot-topics',
    source: 'https://aihot.news/hot',
    seconds: 300,
  },
  daily: {
    path: '/ai-daily',
    title: 'AI 日报',
    endpoint: '/api/v1/dailies/latest',
    source: 'https://aihot.news/daily',
    seconds: 86400,
  },
  weekly: {
    path: '/ai-weekly',
    title: 'AI 周报',
    endpoint: '/api/v1/weeklies/latest',
    source: 'https://aihot.news/weekly',
    seconds: 604800,
  },
});

export const publicDisplayAllowed = env => env.AIHOT_PUBLIC_DISPLAY_ALLOWED === 'true';

// In seconds: next Beijing (UTC+8, no DST) publication opportunity.
export function nextCheck(kind, now) {
  if (kind === 'hot') return now + 300;
  const utc = new Date((now + 8 * 3600) * 1000);
  const sec = utc.getUTCHours() * 3600 + utc.getUTCMinutes() * 60 + utc.getUTCSeconds();
  const day = utc.getUTCDay();
  if (kind === 'daily') {
    const due = 8 * 3600 + 10 * 60;
    return now + (sec < due ? due - sec : 86400 - sec + due);
  }
  if (kind === 'weekly') {
    const due = 10 * 3600 + 10 * 60;
    const mondayOffset = (8 - day) % 7;
    let days = mondayOffset;
    if (!days && sec >= due) days = 7;
    return now + days * 86400 + due - sec;
  }
  throw Error('Unknown AIHOT channel');
}

export function parseAIHOT(kind, data) {
  if (!data || data.schemaVersion !== 1) throw Error('Unexpected AIHOT schemaVersion');
  if (kind === 'hot') {
    if (!Array.isArray(data.items) || data.items.length > 10 ||
      data.items.some(x => typeof x.title !== 'string' || !Number.isInteger(x.rank) ||
        !x.links || typeof x.links.aihot !== 'string')) throw Error('Invalid hot topics');
    return { type: 'hot', entries: data.items.map(x => ({
      title: x.title, rank: x.rank, url: x.links.aihot, original: x.links.original,
      source: x.source?.name || '', count: x.sourceCount || 0,
    })) };
  }
  const report = data.report;
  if (!report || !Array.isArray(report.sections) || report.sections.length > 25 ||
      typeof report.links?.aihot !== 'string') throw Error('Invalid report');
  if (kind === 'daily') {
    if (typeof report.date !== 'string') throw Error('Missing daily date');
    return {
      type: 'daily', issue: report.date, url: report.links.aihot,
      headline: report.lead?.title || 'AI 日报', overview: report.lead?.leadParagraph || '',
      sections: report.sections.map(section => ({
        label: section.label,
        entries: (section.items || []).slice(0, 25).map(x => ({
          title: x.title, summary: x.summary, source: x.source?.name || '',
          url: x.links?.aihot || x.links?.original || '', original: x.links?.original || '',
        })),
      })),
    };
  }
  if (kind === 'weekly') {
    if (typeof report.week !== 'string') throw Error('Missing weekly issue');
    return {
      type: 'weekly', issue: report.week, url: report.links.aihot,
      headline: report.headline || 'AI 周报', overview: report.overview || '',
      sections: report.sections.map(section => ({
        label: section.label, intro: section.summary || '',
        entries: (section.items || []).slice(0, 25).map(x => ({
          title: x.title, summary: x.summary, source: x.source?.name || '',
          url: x.links?.aihot || x.links?.original || '', original: x.links?.original || '',
        })),
      })),
    };
  }
  throw Error('Unknown channel');
}

const safeCache = row => {
  if (!row?.payload) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
};

// Multi-PoP coordination uses a D1 lease. At most one request for an
// endpoint contacts AIHOT per refresh interval.
export async function loadAIHOT(db, kind, env, {
  now = Math.floor(Date.now() / 1000), fetcher = fetch,
} = {}) {
  if (!CHANNELS[kind]) throw Error('Unknown channel');
  if (!publicDisplayAllowed(env)) return { status: 'unlicensed', payload: null };
  const def = CHANNELS[kind];

  await db.prepare('INSERT OR IGNORE INTO aihot_cache (kind) VALUES (?)').bind(kind).run();
  let row = await db.prepare(
    'SELECT payload, etag, next_at, lock_until FROM aihot_cache WHERE kind = ?'
  ).bind(kind).first();
  const cached = safeCache(row);
  if (row.next_at > now) return { status: cached ? 'cached' : 'unavailable', payload: cached };

  const lease = await db.prepare(
    'UPDATE aihot_cache SET lock_until = ? WHERE kind = ? AND next_at <= ? AND lock_until <= ?'
  ).bind(now + 30, kind, now, now).run();
  if (!lease.meta?.changes) return { status: cached ? 'cached' : 'unavailable', payload: cached };

  try {
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'DiggSpace-AIHOT-Reader/1.0',
    };
    if (row.etag) headers['If-None-Match'] = row.etag;
    const response = await fetcher('https://aihot.news' + def.endpoint, {
      method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(9000),
    });
    let checkAt = nextCheck(kind, now);
    if (response.status === 304 && cached) {
      await db.prepare(
        'UPDATE aihot_cache SET checked_at = ?, next_at = ?, lock_until = 0 WHERE kind = ?'
      ).bind(now, checkAt, kind).run();
      return { status: 'cached', payload: cached };
    }
    if (response.status === 200) {
      const declared = Number(response.headers.get('content-length') || 0);
      if (declared > 400_000) throw Error('AIHOT response too large');
      const text = await response.text();
      if (text.length > 400_000) throw Error('AIHOT response too large');
      const next = parseAIHOT(kind, JSON.parse(text));
      const etag = response.headers.get('ETag') || null;
      await db.prepare(
        'UPDATE aihot_cache SET payload = ?, etag = ?, checked_at = ?, next_at = ?, lock_until = 0 WHERE kind = ?'
      ).bind(JSON.stringify(next), etag, now, checkAt, kind).run();
      return { status: 'fresh', payload: next };
    }
    if (response.status === 429 || response.status === 503) {
      const retryAfter = Math.min(3600, Math.max(60, Number(response.headers.get('Retry-After') || 300) || 300));
      checkAt = now + retryAfter;
    } else {
      checkAt = now + 600;
    }
    await db.prepare(
      'UPDATE aihot_cache SET next_at = ?, lock_until = 0 WHERE kind = ?'
    ).bind(checkAt, kind).run();
    return { status: cached ? 'stale' : 'unavailable', payload: cached };
  } catch (error) {
    console.warn('AIHOT fetch skipped: ' + error.message);
    await db.prepare(
      'UPDATE aihot_cache SET next_at = ?, lock_until = 0 WHERE kind = ?'
    ).bind(now + 300, kind).run();
    return { status: cached ? 'stale' : 'unavailable', payload: cached };
  }
}

export function registerAIHOTRoutes(app, getMeta, siteUrl) {
  for (const [kind, channel] of Object.entries(CHANNELS)) {
    app.get(channel.path, async c => {
      const [stats, item] = await Promise.all([
        getMeta(c.env.DB, 'stats'),
        loadAIHOT(c.env.DB, kind, c.env),
      ]);
      const page = aihotPage({
        kind, ...item, site: siteUrl(c), path: channel.path,
        stats, user: c.get('user'),
      });
      c.header('Cache-Control', 'private, no-store');
      return c.html(page);
    });
  }
}
