// Run the catalog seed through Wrangler/D1 instead of a single Worker request.
// Requires Cloudflare credentials supplied by a protected GitHub Actions job.
// Import is idempotent and writes the completion marker only after all rows
// are verified; interrupted runs resume without overwriting manual sources.
import { readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBlogsCsv } from '../../scripts/lib/feed.mjs';

const FRONTEND = fileURLToPath(new URL('../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const CHUNKS = join(FRONTEND, '.wrangler/bootstrap-sql');

function cli(...args) {
  const txt = execFileSync(process.execPath, [CLI, 'd1', 'execute', 'diggspace', '--remote', ...args], {
    cwd: FRONTEND, encoding: 'utf8', timeout: 120000, maxBuffer: 12 * 1024 * 1024,
    env: process.env,
  });
  return txt;
}

function query(statement) {
  const raw = cli('--command', statement, '--json');
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw Error('Unable to parse D1 JSON response, aborting before unsafe state change: ' + raw.slice(0, 150)); }
  if (!Array.isArray(parsed) || !parsed[0]?.success) throw Error('D1 remote query did not succeed');
  return parsed[0].results || [];
}

export function validateCatalogCount(count, expected, marked) {
  if (!Number.isSafeInteger(count) || count !== expected) {
    throw Error('D1 catalog incomplete: got ' + count + ' of ' + expected + '; do not set completion marker');
  }
  if (marked && count !== expected) throw Error('Imported marker disagrees with catalog count');
  return true;
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.DIGGSPACE_D1_ID) {
    throw Error('Missing authenticated Cloudflare account credentials or resolved D1 ID');
  }
  const expected = parseBlogsCsv(readFileSync(join(ROOT, 'data/initial-blogs.csv'), 'utf8')).length;
  const meta = query("SELECT value FROM meta WHERE key = 'initial_catalog_imported'");
  const existing = Number(query("SELECT COUNT(*) AS count FROM blogs WHERE source_origin = 'csv'")[0]?.count ?? -1);
  if (meta.length && meta[0].value === '1') {
    validateCatalogCount(existing, expected, true);
    console.log('Catalog already imported and complete: ' + existing);
  } else {
    const files = readdirSync(CHUNKS).filter(x => /^\d+\.sql$/.test(x)).sort();
    if (files.length < 2) throw Error('Catalog SQL chunks missing; run generator');
    console.log('Importing catalog via D1 CLI in ' + files.length + ' bounded chunks');
    for (const [index, file] of files.entries()) {
      cli('--file', join(CHUNKS, file));
      console.log('D1 catalog chunk ' + (index + 1) + '/' + files.length + ' complete');
    }
    const finalCount = Number(query("SELECT COUNT(*) AS count FROM blogs WHERE source_origin = 'csv'")[0]?.count ?? -1);
    validateCatalogCount(finalCount, expected, false);
    // Do not set meta until the full original catalog has been confirmed present.
    cli('--command', "INSERT OR IGNORE INTO meta (key, value, updated_at) VALUES ('initial_catalog_imported', '1', unixepoch())");
    console.log('Catalog bootstrap complete: ' + finalCount + ' independently managed blogs');
  }

  // Original project's dynamic source groups are independent of the catalog.
  cli('--command', "INSERT OR IGNORE INTO source_groups (id, name, sort_order) VALUES ('forum', '论坛社区', 10), ('news', '资讯网站', 20)");
  const groups = query('SELECT id FROM source_groups ORDER BY sort_order, id').map(x=>x.id);
  if (!['blogs','forum','news'].every(id=>groups.includes(id))) throw Error('Missing DiggSpace source groups');
  console.log('Configured top-level groups: ' + groups.join(', '));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      'Initial catalog: ' + expected + ' blogs imported into own D1; groups: blogs/forum/news.\n');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
