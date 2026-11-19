// Fail closed: never deploy DiggSpace against the inherited or placeholder D1.
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const dbId = config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
const dbName = config.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1];
const worker = config.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
const url = config.match(/"SITE_URL"\s*:\s*"([^"]*)"/)?.[1] ?? '';
const forbidden = /indi\.blog|chinese-independent-blogs|timqian|b1261162-994b-429e-8447-3a3554a96e9c/i;

if (worker !== 'diggspace' || dbName !== 'diggspace' ||
    !dbId || dbId === '00000000-0000-0000-0000-000000000000' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(dbId)) {
  console.error('Deploy blocked: set the ID of your own diggspace D1 database in wrangler.jsonc.');
  process.exit(1);
}
if (forbidden.test(config)) {
  console.error('Deploy blocked: a setting still references the upstream project or its services.');
  process.exit(1);
}
if (url && (!url.startsWith('https://') || !URL.canParse(url))) {
  console.error('Deploy blocked: SITE_URL must be a valid HTTPS URL or empty.');
  process.exit(1);
}
console.log('Deployment configuration checked. Remember to create your own ADMIN_TOKEN secret.');
