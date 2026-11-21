// The entire source catalog is code-owned, not editable through HTTP.
// Existing user/admin/blog/comment tables are intentionally not queried.
import { CATALOG_VERSION, FEEDS } from './catalog.js';
import { fetchFeed } from '../../scripts/lib/feed.mjs';

const HOUR = 3600;
const DAY = 86400;
const FETCH_LIMIT = 24;
const PER_FEED = 24;
const LAST_45_DAYS = 45 * DAY;
const MAX_BATCH = 45;

async function runStatements(db, statements) {
  for (let start = 0; start < statements.length; start += MAX_BATCH) {
    await db.batch(statements.slice(start, start + MAX_BATCH));
  }
}

export async function syncCatalog(db, now = Math.floor(Date.now() / 1000)) {
  const row = await db.prepare("SELECT value FROM news_meta WHERE key = 'catalog_version'").first();
  if (row?.value === CATALOG_VERSION) return false;
  const upsert = db.prepare(`INSERT INTO news_sources
    (id, category, name, site_url, feed_url, enabled, next_check_at)
    VALUES (?, ?, ?, ?, ?, 1, 0)
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      name = excluded.name,
      site_url = excluded.site_url,
      enabled = 1,
      next_check_at = CASE WHEN feed_url != excluded.feed_url THEN 0 ELSE next_check_at END,
      feed_url = excluded.feed_url`);
  await runStatements(db, FEEDS.map(s =>
    upsert.bind(s.id, s.category, s.name, s.site, s.feed)
  ));
  const ids = FEEDS.map(s => s.id);
  await db.prepare(`UPDATE news_sources SET enabled = 0
    WHERE id NOT IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  await db.prepare(`INSERT INTO news_meta (key, value, updated_at)
    VALUES ('catalog_version', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value,
      updated_at = excluded.updated_at`).bind(CATALOG_VERSION, now).run();
  return true;
}

export async function crawlNews(db, {
  now = Math.floor(Date.now() / 1000),
  limit = FETCH_LIMIT,
  fetchOne = fetchFeed,
} = {}) {
  await syncCatalog(db, now);
  const { results: due } = await db.prepare(`SELECT id, category,
     feed_url AS feed, etag, last_modified
     FROM news_sources WHERE enabled = 1 AND next_check_at <= ?
     ORDER BY next_check_at ASC, last_checked_at ASC LIMIT ?`).bind(now, limit).all();

  const insert = db.prepare(`INSERT OR IGNORE INTO news_items
    (source_id, url, title, published_at, first_seen_at)
    VALUES (?, ?, ?, ?, ?)`);
  const mark = db.prepare(`UPDATE news_sources
    SET last_checked_at = ?, last_ok_at = COALESCE(?, last_ok_at),
        next_check_at = ?, last_error = ?,
        etag = ?, last_modified = ?
    WHERE id = ?`);
  const statuses = {};
  let itemsAttempted = 0;

  // Workers can have limited concurrent external subrequests.
  for (let i = 0; i < due.length; i += 4) {
    const batch = due.slice(i, i + 4);
    const checks = await Promise.all(batch.map(async source => {
      try { return await fetchOne(source, now * 1000); }
      catch (err) { return { status: 'network_error', error: err.message?.slice(0, 120) }; }
    }));
    const statements = [];
    batch.forEach((source, j) => {
      const r = checks[j];
      const ok = ['ok', 'not_modified', 'no_dates'].includes(r.status);
      statuses[r.status] = (statuses[r.status] || 0) + 1;
      const interval = source.category === 'hot' ? HOUR : 2 * HOUR;
      if (r.status === 'ok') {
        const entries = (r.entries || [])
          .filter(e => e.url && e.title?.trim() && e.date instanceof Date &&
            e.date.getTime() / 1000 >= now - LAST_45_DAYS)
          .slice(0, PER_FEED);
        for (const entry of entries) {
          const published = Math.min(now, Math.floor(entry.date.getTime() / 1000));
          statements.push(insert.bind(source.id, entry.url, entry.title.slice(0, 450),
            published, now));
          itemsAttempted++;
        }
      }
      statements.push(mark.bind(
        now, ok ? now : null, now + (ok ? interval : 6 * HOUR),
        ok ? null : (r.error || r.status).slice(0, 180),
        r.status === 'not_modified' ? source.etag : ok ? (r.etag || null) : null,
        r.status === 'not_modified' ? source.last_modified : ok ? (r.lastModified || null) : null,
        source.id,
      ));
    });
    await runStatements(db, statements);
  }

  // Bound storage growth without changing the old unrelated site tables.
  await db.prepare('DELETE FROM news_items WHERE published_at < ?')
    .bind(now - 90 * DAY).run();
  console.log(JSON.stringify({ event: 'news_crawl', due: due.length,
    attempted: itemsAttempted, statuses }));
  return { checked: due.length, attempted: itemsAttempted, statuses };
}

// On a brand-new deployment, gently populate the first few feeds without
// waiting for the first hourly cron. A D1 lease prevents visitor stampedes.
export async function warmStart(db, ctx, now = Math.floor(Date.now() / 1000)) {
  const existing = await db.prepare('SELECT 1 FROM news_items LIMIT 1').first();
  if (existing) return false;
  await db.prepare("INSERT OR IGNORE INTO news_meta (key,value,updated_at) VALUES ('warmup_lock','0',0)").run();
  const lease = await db.prepare(
    "UPDATE news_meta SET value=?,updated_at=? WHERE key='warmup_lock' AND CAST(value AS INTEGER) <= ?"
  ).bind(String(now + 900), now, now).run();
  if (!lease.meta?.changes) return false;
  ctx.waitUntil(crawlNews(db, { now, limit: 4 }).catch(e =>
    console.warn('Initial RSS warm-up skipped:', e.message)));
  return true;
}

export async function latestNews(db, category, page, pageSize = 50) {
  const offset = (page - 1) * pageSize;
  const { results } = await db.prepare(`SELECT i.title, i.url, i.published_at,
     s.name AS source_name, s.category, s.site_url AS source_site FROM news_items i
     JOIN news_sources s ON s.id = i.source_id
     WHERE s.enabled = 1 AND (? = '' OR s.category = ?)
     ORDER BY i.published_at DESC, i.rowid DESC
     LIMIT ? OFFSET ?`)
    .bind(category, category, pageSize + 1, offset).all();
  return { items: results.slice(0, pageSize), hasMore: results.length > pageSize };
}

export async function sourceStats(db) {
  const [sources, items, latest] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM news_sources WHERE enabled = 1').first(),
    db.prepare(`SELECT COUNT(*) AS total FROM news_items i
       JOIN news_sources s ON s.id = i.source_id
       WHERE s.enabled = 1 AND i.published_at >= ?`)
      .bind(Math.floor(Date.now() / 1000) - DAY).first(),
    db.prepare('SELECT MAX(last_ok_at) AS last_success FROM news_sources WHERE enabled = 1').first(),
  ]);
  return { sources: sources?.total || 0, recent: items?.total || 0,
    lastSuccess: latest?.last_success || null };
}

export async function listSources(db) {
  const { results } = await db.prepare(`SELECT category, name, feed_url
     FROM news_sources WHERE enabled = 1 ORDER BY category, name`).all();
  return results;
}
