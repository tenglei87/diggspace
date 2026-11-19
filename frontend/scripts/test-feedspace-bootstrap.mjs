// Test the exact first-import function without loading Cloudflare Worker modules
// (which import a CSV asset only supported by Wrangler).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
const start = worker.indexOf('async function ensureInitialCatalog(db) {');
const end = worker.indexOf('\nasync function crawl(env,', start);
assert.ok(start >= 0 && end > start, 'one-time import function must exist');
const source = worker.slice(start, end);
const build = new Function('syncBlogs', 'initialBlogsCsv', source + '; return ensureInitialCatalog;');

const marks = new Map();
let importCalls = 0;
let markerWrites = 0;
const db = {
  prepare(sql) {
    if (sql.includes("SELECT 1 FROM meta WHERE key = 'initial_catalog_imported'")) {
      return { first: async () => marks.has('initial_catalog_imported') ? { value: 1 } : null };
    }
    if (sql.includes('INSERT OR IGNORE INTO meta')) {
      return { bind: (...args) => ({ run: async () => {
        marks.set(args[0], args[1]);
        markerWrites += 1;
      } }) };
    }
    throw Error('Unexpected D1 SQL: ' + sql);
  },
};
const catalog = 'seed catalog in own repository';
const sync = async (_, csv) => {
  assert.equal(csv, catalog);
  importCalls += 1;
  return { blogs: 1, removed: 0, added: [{ id: 'blog' }] };
};
const bootstrap = build(sync, catalog);
const first = await bootstrap(db);
assert.equal(first.source, 'bundled-once');
assert.equal(first.skipped, false);
assert.equal(first.added.length, 1);
const second = await bootstrap(db);
assert.equal(second.source, 'database');
assert.equal(second.skipped, true);
assert.equal(second.added.length, 0);
assert.equal(importCalls, 1);
assert.equal(markerWrites, 1);

const broken = build(async () => { throw new Error('source import failure'); }, catalog);
const uninitializedDB = {
  prepare(sql) {
    if (sql.includes('SELECT 1 FROM meta')) return { first: async () => null };
    throw Error('Marker must never be written after a failed import');
  },
};
await assert.rejects(broken(uninitializedDB), /source import failure/);

console.log('PASS: bundled initial catalog imports only once and never records a failed import as complete');
