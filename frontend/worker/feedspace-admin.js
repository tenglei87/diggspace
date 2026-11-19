// FeedSpace: admin-only management of RSS/Atom sources and site groups.
// No changes to the public layout, styles, or browser JavaScript.
import { blogId } from '../../scripts/lib/feed.mjs';
import { categorize } from './categories.js';

const BASE = '/api/admin/feedspace';
const GROUP_ID = /^[a-z][a-z0-9_-]{1,31}$/;
const RESERVED_HOST = /(^localhost$|\.localhost$|\.local$|\.internal$|\.test$|\.invalid$|\.example$|\.onion$|\.nip\.io$|\.sslip\.io$)/i;
const owns = (c) => !!c.env.ADMIN_TOKEN && c.req.header('Authorization') === 'Bearer ' + c.env.ADMIN_TOKEN;
const denied = (c) => c.json({ error: 'Not found' }, 404);
const invalid = (c, why) => c.json({ error: why }, 400);
const validId = (id) => typeof id === 'string' && GROUP_ID.test(id);
const validName = (name, max) => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= max;
const safeSort = (n) => Number.isSafeInteger(n) && Math.abs(n) <= 1000000;

function publicUrl(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 2048) return null;
  try {
    const u = new URL(value.trim());
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    // This is an administrator-only tool, not an unrestricted public fetch API.
    // Reject literal IPs, local names, credentials and non-standard ports.
    // Do not open it to general users without DNS/redirect SSRF protection.
    if (!['https:', 'http:'].includes(u.protocol) ||
        !host.includes('.') || /^[0-9.]+$/.test(host) || host.includes(':') ||
        RESERVED_HOST.test(host) || u.username || u.password ||
        (u.port && !['80', '443'].includes(u.port))) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

async function jsonBody(c) {
  if (Number(c.req.header('content-length') || 0) > 8192) return null;
  const raw = await c.req.text().catch(() => '');
  if (raw.length > 8192) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// Only whitelisted column names are returned, so SQL updates can be composed safely.
function sourceChanges(data, partial = false) {
  if (!data) return null;
  const out = {};
  if (!partial || Object.hasOwn(data, 'name')) {
    if (!validName(data.name, 120)) return null;
    out.name = data.name.trim();
  }
  if (!partial || Object.hasOwn(data, 'url')) {
    out.url = publicUrl(data.url);
    if (!out.url) return null;
  }
  if (!partial || Object.hasOwn(data, 'feed')) {
    out.feed = publicUrl(data.feed);
    if (!out.feed) return null;
  }
  if (!partial || Object.hasOwn(data, 'groupId')) {
    if (!validId(data.groupId)) return null;
    out.source_group = data.groupId;
  }
  if (Object.hasOwn(data, 'tags')) {
    if (!Array.isArray(data.tags) || data.tags.length > 20 ||
        data.tags.some((x) => typeof x !== 'string' || x.length > 40)) return null;
    const tags = data.tags.map((x) => x.trim()).filter(Boolean);
    out.tags = JSON.stringify(tags);
    out.categories = JSON.stringify(categorize(tags));
  }
  if (Object.hasOwn(data, 'enabled')) {
    if (typeof data.enabled !== 'boolean') return null;
    out.removed = data.enabled ? 0 : 1;
  }
  return out;
}

export function registerFeedspaceAdminRoutes(app, buildSnapshot) {
  const authorized = (c) => owns(c) ? null : denied(c);
  const refresh = (c) => buildSnapshot(c.env.DB, Date.now());

  app.get(BASE + '/groups', async (c) => {
    const no = authorized(c); if (no) return no;
    const { results } = await c.env.DB.prepare('SELECT id, name, sort_order FROM source_groups ORDER BY sort_order, id').all();
    return c.json({ groups: results });
  });

  app.post(BASE + '/groups', async (c) => {
    const no = authorized(c); if (no) return no;
    const body = await jsonBody(c);
    if (!validId(body?.id) || !validName(body?.name, 40) ||
        (body.sortOrder != null && !safeSort(body.sortOrder))) return invalid(c, 'Invalid group');
    const db = c.env.DB;
    if (await db.prepare('SELECT 1 FROM source_groups WHERE id = ?').bind(body.id).first()) {
      return c.json({ error: 'Group already exists' }, 409);
    }
    await db.prepare('INSERT INTO source_groups (id, name, sort_order) VALUES (?, ?, ?)')
      .bind(body.id, body.name.trim(), body.sortOrder ?? 100).run();
    await refresh(c);
    return c.json({ id: body.id, name: body.name.trim() }, 201);
  });

  app.patch(BASE + '/groups/:id', async (c) => {
    const no = authorized(c); if (no) return no;
    const body = await jsonBody(c);
    if (!body) return invalid(c, 'Invalid JSON');
    const changes = [];
    const args = [];
    if (Object.hasOwn(body, 'name')) {
      if (!validName(body.name, 40)) return invalid(c, 'Invalid group name');
      changes.push('name = ?'); args.push(body.name.trim());
    }
    if (Object.hasOwn(body, 'sortOrder')) {
      if (!safeSort(body.sortOrder)) return invalid(c, 'Invalid sort order');
      changes.push('sort_order = ?'); args.push(body.sortOrder);
    }
    if (!changes.length) return invalid(c, 'No changes supplied');
    const db = c.env.DB;
    const id = c.req.param('id');
    if (!await db.prepare('SELECT 1 FROM source_groups WHERE id = ?').bind(id).first()) {
      return c.json({ error: 'Group not found' }, 404);
    }
    await db.prepare('UPDATE source_groups SET ' + changes.join(', ') + ' WHERE id = ?')
      .bind(...args, id).run();
    await refresh(c);
    return c.json({ ok: true });
  });

  app.delete(BASE + '/groups/:id', async (c) => {
    const no = authorized(c); if (no) return no;
    const id = c.req.param('id');
    if (id === 'blogs') return invalid(c, 'Independent blogs is the required default group');
    const db = c.env.DB;
    if (await db.prepare('SELECT 1 FROM blogs WHERE source_group = ? LIMIT 1').bind(id).first()) {
      return c.json({ error: 'Move all sources in this group before deleting it' }, 409);
    }
    const res = await db.prepare('DELETE FROM source_groups WHERE id = ?').bind(id).run();
    if (!res.meta?.changes) return c.json({ error: 'Group not found' }, 404);
    await refresh(c);
    return c.json({ ok: true });
  });

  app.get(BASE + '/sources', async (c) => {
    const no = authorized(c); if (no) return no;
    const group = c.req.query('groupId') || null;
    if (group && !validId(group)) return invalid(c, 'Invalid groupId');
    const limit = Math.min(500, Math.max(1, Number.parseInt(c.req.query('limit') || '100', 10) || 100));
    const offset = Math.max(0, Number.parseInt(c.req.query('offset') || '0', 10) || 0);
    const { results } = await c.env.DB.prepare(
      'SELECT num, id, name, url, feed, tags, source_group, source_origin, removed, status, last_checked_at, last_post_at ' +
      'FROM blogs WHERE (? IS NULL OR source_group = ?) ORDER BY position DESC, num DESC LIMIT ? OFFSET ?')
      .bind(group, group, limit, offset).all();
    return c.json({ sources: results.map((r) => ({ ...r, tags: JSON.parse(r.tags) })) });
  });

  app.post(BASE + '/sources', async (c) => {
    const no = authorized(c); if (no) return no;
    const data = sourceChanges(await jsonBody(c));
    if (!data) return invalid(c, 'name, url, feed, and groupId are required');
    const db = c.env.DB;
    if (!await db.prepare('SELECT 1 FROM source_groups WHERE id = ?').bind(data.source_group).first()) {
      return invalid(c, 'Unknown groupId');
    }
    const id = blogId(data.url);
    if (await db.prepare('SELECT 1 FROM blogs WHERE id = ? OR url = ?').bind(id, data.url).first()) {
      return c.json({ error: 'Source already exists' }, 409);
    }
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
      'INSERT INTO blogs (id, num, name, url, feed, tags, categories, position, source_group, source_origin, removed, next_check_at) ' +
      "VALUES (?, (SELECT COALESCE(MAX(num), 0) + 1 FROM blogs), ?, ?, ?, ?, ?, " +
      "(SELECT COALESCE(MAX(position), 0) + 1 FROM blogs), ?, 'manual', ?, ?)")
      .bind(id, data.name, data.url, data.feed, data.tags ?? '[]', data.categories ?? '[]',
        data.source_group, data.removed ?? 0, now).run();
    await refresh(c);
    return c.json({ created: true, id, sourceGroup: data.source_group }, 201);
  });

  app.patch(BASE + '/sources/:num', async (c) => {
    const no = authorized(c); if (no) return no;
    const num = Number(c.req.param('num'));
    if (!Number.isSafeInteger(num) || num < 1) return invalid(c, 'Invalid source number');
    const data = sourceChanges(await jsonBody(c), true);
    if (!data || !Object.keys(data).length) return invalid(c, 'Invalid changes');
    const db = c.env.DB;
    const source = await db.prepare("SELECT id, feed FROM blogs WHERE num = ? AND source_origin = 'manual'").bind(num).first();
    if (!source) return c.json({ error: 'Only manually-added sources can be edited' }, 404);
    if (data.source_group && !await db.prepare('SELECT 1 FROM source_groups WHERE id = ?').bind(data.source_group).first()) {
      return invalid(c, 'Unknown groupId');
    }
    if (data.url && await db.prepare('SELECT 1 FROM blogs WHERE url = ? AND num != ?').bind(data.url, num).first()) {
      return c.json({ error: 'URL already registered' }, 409);
    }
    const fields = Object.keys(data).map((col) => col + ' = ?');
    const args = Object.values(data);
    if (data.feed && data.feed !== source.feed) {
      fields.push('etag = NULL', 'last_modified = NULL', 'status = NULL',
        'error = NULL', 'failing_since = NULL', 'dead_since = NULL',
        'last_post_at = NULL', 'next_check_at = NULL');
    } else if (data.removed === 0) {
      fields.push('next_check_at = NULL');
    }
    await db.prepare("UPDATE blogs SET " + fields.join(', ') + " WHERE num = ? AND source_origin = 'manual'")
      .bind(...args, num).run();
    await refresh(c);
    return c.json({ ok: true, num });
  });

  // Soft delete preserves the history, follows, and post references.
  app.delete(BASE + '/sources/:num', async (c) => {
    const no = authorized(c); if (no) return no;
    const num = Number(c.req.param('num'));
    if (!Number.isSafeInteger(num) || num < 1) return invalid(c, 'Invalid source number');
    const res = await c.env.DB.prepare("UPDATE blogs SET removed = 1 WHERE num = ? AND source_origin = 'manual'")
      .bind(num).run();
    if (!res.meta?.changes) return c.json({ error: 'Manual source not found' }, 404);
    await refresh(c);
    return c.json({ ok: true });
  });
}
