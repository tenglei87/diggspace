// Prevent accidental reintroduction of upstream runtime or deployment settings.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = [
  'frontend/wrangler.jsonc',
  'frontend/worker/index.js',
  'frontend/worker/crawl.js',
  'frontend/worker/views.js',
  'frontend/worker/telegram.js',
  'frontend/worker/auth.js',
  'scripts/lib/feed.mjs',
  'scripts/lint.mjs',
  'frontend/package.json',
  'frontend/package-lock.json',
  '.github/workflows/pr_lint.yml',
];
const forbidden = [
  /indi\.blog/i,
  /timqian\/chinese-independent-blogs/i,
  /BLOGS_CSV_URL/,
  /b1261162-994b-429e-8447-3a3554a96e9c/i,
  /Ov23liY7dAOcgcazIn2k/,
  /-1001423354945/,
];
for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8');
  for (const re of forbidden) {
    if (re.test(text)) {
      throw new Error(`Upstream dependency ${re} found in ${file}`);
    }
  }
}
if (!existsSync(resolve(root, 'data/initial-blogs.csv'))) throw new Error('Missing bundled one-time catalog');
for (const obsolete of [
  'blogs-original.csv',
  '.github/FUNDING.yml',
  '.github/workflows/updateInfo.yml',
  'scripts/render-readme.mjs',
  'scripts/generate-opml.mjs',
]) {
  if (existsSync(resolve(root, obsolete))) throw new Error(`Obsolete upstream file: ${obsolete}`);
}

const worker = readFileSync(resolve(root, 'frontend/worker/index.js'), 'utf8');
const settings = readFileSync(resolve(root, 'frontend/wrangler.jsonc'), 'utf8');
if (!worker.includes('ensureInitialCatalog') || !worker.includes('initial_catalog_imported')) {
  throw new Error('One-time catalog import guard missing');
}
if (!worker.includes("import initialBlogsCsv from '../../data/initial-blogs.csv'")) {
  throw new Error('Bundled catalog reference missing');
}
if (!settings.includes('00000000-0000-0000-0000-000000000000')) {
  throw new Error('Default config must not contain an already-provisioned D1 ID');
}
if (settings.includes('"routes"')) {
  throw new Error('Default config must not claim a custom domain');
}
console.log('PASS: DiggSpace runtime, seed, CI and Cloudflare deployment settings are independent');
