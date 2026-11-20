// Resolve ONLY an existing "diggspace" D1 database in the selected account.
// Never provision a new empty database during production deployment.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function resolveDiggspaceD1(databases) {
  if (!Array.isArray(databases)) throw new Error('Invalid D1 list output');
  const matches = databases.filter((row) => row && row.name === 'diggspace');
  if (matches.length > 1) throw new Error('Multiple D1 databases named diggspace; choose one manually');
  if (!matches.length) return null;
  const uuid = matches[0].uuid ?? matches[0].id;
  if (typeof uuid !== 'string' || !UUID.test(uuid) ||
      uuid.toLowerCase() === 'b1261162-994b-429e-8447-3a3554a96e9c') {
    throw new Error('Unexpected or inherited D1 database ID');
  }
  return uuid;
}

function listD1() {
  const result = execFileSync(process.execPath, [cli, 'd1', 'list', '--json'], {
    encoding: 'utf8', timeout: 90_000, maxBuffer: 5 * 1024 * 1024,
  });
  try {
    return JSON.parse(result);
  } catch {
    throw new Error('Could not parse Wrangler D1 JSON list; no resources were changed');
  }
}

function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID ||
      !process.env.GITHUB_ENV) {
    throw new Error('Missing GitHub Actions Cloudflare credentials or GITHUB_ENV');
  }
  const id = resolveDiggspaceD1(listD1());
  if (!id) {
    throw new Error('Existing diggspace D1 not found; aborting deployment. ' +
      'Check Cloudflare account and restore the original D1 binding before publishing.');
  }
  console.log('Using the existing diggspace D1 in the selected Cloudflare account');
  appendFileSync(process.env.GITHUB_ENV, 'DIGGSPACE_D1_ID=' + id + '\n');
  console.log('D1 binding prepared for this Actions run (no ID committed to GitHub)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
