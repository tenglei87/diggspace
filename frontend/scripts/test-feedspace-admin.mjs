// Execute the real FeedSpace admin route handlers through Hono with a D1-compatible
// in-memory stub. This does not make network requests or need Cloudflare credentials.
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { registerFeedspaceAdminRoutes } from '../worker/feedspace-admin.js';

class FakeD1 {
  constructor() {
    this.groups = new Map([['blogs', { id: 'blogs', name: '独立博客', sort_order: 0 }]]);
    this.sources = new Map([
      [1, { num: 1, id: 'existing.example', name: 'Existing blog', url: 'https://existing.example.com/',
        feed: 'https://existing.example.com/feed.xml', tags: '[]', categories: '[]',
        source_group: 'blogs', source_origin: 'csv', removed: 0 }],
    ]);
    this.nextNum = 2;
  }
  prepare(sql) {
    const run = (args) => ({
      first: async () => this.execute(sql, args),
      all: async () => this.execute(sql, args),
      run: async () => this.execute(sql, args),
    });
    return { bind: (...args) => run(args), ...run([]) };
  }
  execute(sql, args) {
    if (sql.startsWith('SELECT id, name, sort_order FROM source_groups')) {
      return { results: [...this.groups.values()].sort((a, b) => a.sort_order - b.sort_order) };
    }
    if (sql.startsWith('SELECT 1 FROM source_groups WHERE id = ?')) {
      return this.groups.has(args[0]) ? { one: 1 } : null;
    }
    if (sql.startsWith('INSERT INTO source_groups')) {
      this.groups.set(args[0], { id: args[0], name: args[1], sort_order: args[2] });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE source_groups SET ')) {
      const row = this.groups.get(args.at(-1));
      if (!row) return { meta: { changes: 0 } };
      let i = 0;
      for (const assignment of sql.slice('UPDATE source_groups SET '.length).split(' WHERE ')[0].split(', ')) {
        row[assignment.split(' = ')[0]] = args[i++];
      }
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('DELETE FROM source_groups WHERE id = ?')) {
      const existed = this.groups.delete(args[0]);
      return { meta: { changes: existed ? 1 : 0 } };
    }
    if (sql.startsWith('SELECT 1 FROM blogs WHERE source_group = ?')) {
      return [...this.sources.values()].some((row) => row.source_group === args[0]) ? { one: 1 } : null;
    }
    if (sql.startsWith('SELECT 1 FROM blogs WHERE id = ? OR feed = ?')) {
      return [...this.sources.values()].some((row) => row.id === args[0] || row.feed === args[1]) ? { one: 1 } : null;
    }
    if (sql.startsWith('SELECT 1 FROM blogs WHERE feed = ? AND num != ?')) {
      return [...this.sources.values()].some((row) => row.feed === args[0] && row.num !== args[1]) ? { one: 1 } : null;
    }
    if (sql.startsWith('SELECT num, id, name, url, feed, tags')) {
      const group = args[0];
      const limit = args[2];
      const offset = args[3];
      const sources = [...this.sources.values()]
        .filter((row) => !group || row.source_group === group)
        .sort((a, b) => b.num - a.num);
      return { results: sources.slice(offset, offset + limit).map((r) => ({ ...r })) };
    }
    if (sql.startsWith('SELECT id, feed FROM blogs WHERE num = ?')) {
      const row = this.sources.get(args[0]);
      return row ? { id: row.id, feed: row.feed } : null;
    }
    if (sql.startsWith('INSERT INTO blogs (id, num')) {
      const num = this.nextNum++;
      this.sources.set(num, {
        num, id: args[0], name: args[1], url: args[2], feed: args[3],
        tags: args[4], categories: args[5], source_group: args[6],
        source_origin: 'manual', removed: args[7],
      });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE blogs SET ')) {
      const row = this.sources.get(args.at(-1));
      if (!row) return { meta: { changes: 0 } };
      const assignments = sql.slice('UPDATE blogs SET '.length).split(' WHERE ')[0].split(', ');
      let i = 0;
      for (const part of assignments) {
        const [column, value] = part.split(' = ');
        if (value === '?') row[column] = args[i++];
        else if (value === 'NULL') row[column] = null;
        else if (value === "'manual'") row[column] = 'manual';
        else if (value === '1') row[column] = 1;
        else if (value === '0') row[column] = 0;
        else throw new Error('Unhandled SQL assignment: ' + part);
      }
      return { meta: { changes: 1 } };
    }
    throw new Error('Unhandled D1 statement in test: ' + sql);
  }
}

const app = new Hono();
const db = new FakeD1();
const ADMIN_TOKEN = 'unit-test-only-token';
let snapshots = 0;
registerFeedspaceAdminRoutes(app, async () => { snapshots += 1; });

async function call(method, path, body, token = ADMIN_TOKEN) {
  const headers = { Authorization: 'Bearer ' + token };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await app.request('https://diggspace.example/api/admin/feedspace' + path, {
    method, headers, ...(body && { body: JSON.stringify(body) }),
  }, { ADMIN_TOKEN, DB: db });
  return { status: response.status, body: await response.json() };
}

assert.equal((await call('GET', '/groups', null, 'wrong')).status, 404);
assert.equal((await call('GET', '/groups')).body.groups.length, 1);
assert.equal((await call('POST', '/groups', { id: 'forum', name: '论坛社区' })).status, 201);
assert.equal((await call('POST', '/groups', { id: 'forum', name: '重复' })).status, 409);
assert.equal((await call('POST', '/groups', { id: '!bad', name: '错误' })).status, 400);
assert.equal((await call('PATCH', '/groups/forum', { name: '独立论坛' })).status, 200);
assert.equal(db.groups.get('forum').name, '独立论坛');

const feed = { name: '论坛', url: 'https://forum.example.com/', feed: 'https://forum.example.com/index.xml', groupId: 'forum' };
assert.equal((await call('POST', '/sources', feed)).status, 201);
assert.equal((await call('POST', '/sources', feed)).status, 409);
assert.equal((await call('POST', '/sources', { ...feed, feed: 'http://127.0.0.1/rss' })).status, 400);
assert.equal((await call('POST', '/sources', { ...feed, feed: 'https://forum.example/rss' })).status, 400,
  'reserved .example test domains must never be accepted as feed hosts');
assert.equal((await call('POST', '/sources', { ...feed, feed: 'https://forum.example.com/other.xml' })).status, 201,
  'same website can have multiple distinct RSSHub feeds');
assert.equal((await call('GET', '/sources')).body.sources.length, 3);

assert.equal((await call('PATCH', '/sources/1', { groupId: 'forum', name: '旧博客已接管' })).status, 200);
assert.equal(db.sources.get(1).source_origin, 'manual',
  'imported source must become independently managed on edit');
assert.equal(db.sources.get(1).source_group, 'forum');

assert.equal((await call('DELETE', '/sources/2')).status, 200);
assert.equal(db.sources.get(2).removed, 1);
assert.equal((await call('PATCH', '/sources/2', { enabled: true })).status, 200);
assert.equal(db.sources.get(2).removed, 0);
assert.equal((await call('DELETE', '/groups/forum')).status, 409,
  'nonempty groups must not be removed');
assert.equal((await call('DELETE', '/groups/blogs')).status, 400,
  'default blog group must not be removed');
assert.ok(snapshots >= 6, 'successful mutations must refresh public snapshot');

console.log('PASS: real Hono routes, D1-compatible mock, authentication, categories, RSS feeds, duplicate detection, initial blog adoption, enable/disable');
