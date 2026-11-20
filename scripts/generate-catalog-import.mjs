// Turn the bundled 1609-row local catalog into rerunnable, bounded D1 SQL files.
// Unlike importing from a Worker HTTP request, this does not consume a single
// Worker invocation's CPU or internal-subrequest budgets.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBlogsCsv } from './lib/feed.mjs';
import { categorize } from '../frontend/worker/categories.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUT = resolve(ROOT, 'frontend/.wrangler/bootstrap-sql');
const CHUNK_SIZE = 40;
const literal = (value) => value == null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";

export function catalogStatements(csv) {
  const blogs = parseBlogsCsv(csv);
  const seen = new Set();
  const statements = [];
  for (const [position, blog] of blogs.entries()) {
    if (seen.has(blog.id)) throw Error('Duplicate blog ID in initial catalog: ' + blog.id);
    seen.add(blog.id);
    const vals = [
      blog.id, blog.name, blog.url, blog.feed || null,
      JSON.stringify(blog.tags), JSON.stringify(categorize(blog.tags)), position,
    ];
    // Use the next available num, even if another admin source was already
    // added. Existing IDs are skipped so rerunning a partial import is safe.
    statements.push(
      'INSERT INTO blogs (id, name, url, feed, tags, categories, position, removed, num, source_group, source_origin)\n' +
      'SELECT ' + vals.map(literal).join(', ') +
      ", 0, (SELECT COALESCE(MAX(num), 0) + 1 FROM blogs), 'blogs', 'csv'\n" +
      'WHERE NOT EXISTS (SELECT 1 FROM blogs WHERE id = ' + literal(blog.id) + ');\n',
    );
  }
  return statements;
}

export function createCatalogChunks(csv, maxChunk = CHUNK_SIZE) {
  if (!Number.isInteger(maxChunk) || maxChunk < 1 || maxChunk > 100) throw Error('Unsafe SQL chunk size');
  const statements = catalogStatements(csv);
  return Array.from({ length: Math.ceil(statements.length / maxChunk) }, (_, i) =>
    '-- Bundled DiggSpace blog catalog, chunk ' + (i + 1) + '\n' +
    statements.slice(i * maxChunk, (i + 1) * maxChunk).join('\n'),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const csv = readFileSync(join(ROOT, 'data/initial-blogs.csv'), 'utf8');
  const chunks = createCatalogChunks(csv);
  mkdirSync(DEFAULT_OUT, { recursive: true });
  for (let i = 0; i < chunks.length; i++) {
    writeFileSync(join(DEFAULT_OUT, String(i + 1).padStart(3, '0') + '.sql'), chunks[i]);
  }
  console.log('Prepared ' + chunks.length + ' D1 SQL chunks for ' +
    catalogStatements(csv).length + ' blogs; no Cloudflare requests were made');
}
