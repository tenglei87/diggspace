// Extract an HTTPS workers.dev URL from Wrangler's official JSONL output.
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function deploymentUrl(jsonl) {
  const lines = jsonl.split(/\r?\n/).filter(Boolean);
  for (const line of lines.reverse()) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type !== 'deploy' || event?.worker_name !== 'diggspace') continue;
    const urls = Array.isArray(event.targets) ? event.targets : [];
    const target = urls.find((url) => {
      if (typeof url !== 'string') return false;
      try { return new URL(url).protocol === 'https:' &&
        new URL(url).hostname.endsWith('.workers.dev'); }
      catch { return false; }
    });
    if (target) return target.replace(/\/+$/, '');
  }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const filename = process.env.WRANGLER_OUTPUT_FILE_PATH;
  const envfile = process.env.GITHUB_ENV;
  if (!filename || !envfile) throw new Error('GitHub Actions output path missing');
  const url = deploymentUrl(readFileSync(filename, 'utf8'));
  if (!url) throw new Error('No diggspace workers.dev URL in Wrangler deployment output');
  appendFileSync(envfile, 'DIGGSPACE_URL=' + url + '\n');
  console.log('DiggSpace deployed at ' + url);
}
