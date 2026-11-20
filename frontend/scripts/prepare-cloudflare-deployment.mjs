// Cloudflare digg.space deployment configuration is ephemeral in Actions.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const CONFIG = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function prepareCustomDomainConfig(source, databaseId) {
  if (!UUID.test(databaseId) || databaseId === PLACEHOLDER ||
      databaseId.toLowerCase() === 'b1261162-994b-429e-8447-3a3554a96e9c')
    throw Error('Unsafe D1 ID');
  if (!source.includes('"name": "diggspace"') || source.includes('"routes"') ||
      !source.includes('"crons": ["7 * * * *"]'))
    throw Error('Unexpected Worker name, routes or missing hourly news schedule');
  const next = source
    .replace('"database_id": "' + PLACEHOLDER + '"', '"database_id": "' + databaseId + '"')
    .replace('"name": "diggspace",', '"name": "diggspace",\n  "workers_dev": false,\n  "routes": [{ "pattern": "digg.space", "custom_domain": true }],')
    .replace('"SITE_URL": ""', '"SITE_URL": "https://digg.space"');
  if (next === source || next.includes('"database_id": "' + PLACEHOLDER + '"') ||
      !next.includes('"pattern": "digg.space"') ||
      !next.includes('"crons": ["7 * * * *"]') ||
      /indi\\.blog|timqian|chinese-independent-blogs/i.test(next))
    throw Error('Invalid prepared deployment');
  return next;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ready = prepareCustomDomainConfig(readFileSync(CONFIG, 'utf8'),
    process.env.DIGGSPACE_D1_ID || '');
  writeFileSync(CONFIG, ready);
  console.log('Prepared digg.space read-only RSS news Worker with hourly cron');
}
