// Prepare the independently-owned digg.space custom-domain release without changing checked-in config.
// The workflow operates on an ephemeral GitHub Actions checkout only.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFIG = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url));
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function replaceOnce(text, pattern, replacement, description) {
  const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'));
  if (matches?.length !== 1) throw new Error('Expected exactly one ' + description + ' in Wrangler config');
  return text.replace(pattern, replacement);
}

export function prepareCustomDomainConfig(source, databaseId) {
  if (!UUID.test(databaseId) || databaseId === PLACEHOLDER ||
      databaseId.toLowerCase() === 'b1261162-994b-429e-8447-3a3554a96e9c') {
    throw new Error('Refusing to use a placeholder or upstream D1 database');
  }
  if (!source.includes('"name": "diggspace"') ||
      !source.includes('"database_name": "diggspace"') ||
      /"routes"\s*:/.test(source)) {
    throw new Error('Unexpected Worker name, database name, or custom-domain route');
  }
  let next = replaceOnce(source,
    /"database_id"\s*:\s*"00000000-0000-0000-0000-000000000000"/,
    '"database_id": "' + databaseId + '"',
    'placeholder database_id',
  );
  next = replaceOnce(next,
    /"crons"\s*:\s*\[[^\]]*\]/,
    '"crons": []',
    'cron triggers',
  );
  // Do not start 1609 RSS feed checks until a human has opted in to the schedule.
  // Free Workers plans cannot use this project's production-level CPU and
  // external subrequest limits. Omit limits in the first preview deployment.
  next = replaceOnce(next,
    /\n  "limits": \{\s*"cpu_ms": \d+,\s*"subrequests": \d+\s*\},/,
    '',
    'paid-plan limits',
  );
  // Email sending needs the owner's verified sending domain, which is not ready
  // during bootstrap. auth.js explicitly returns 503 instead of logging OTPs.
  next = replaceOnce(next,
    /\n  "send_email": \[\{ "name": "EMAIL" \}\],/,
    '',
    'unconfigured production email binding',
  );
  next = replaceOnce(next,
    /"name": "diggspace",/,
    '"name": "diggspace",\n  "workers_dev": false,\n  "routes": [{ "pattern": "digg.space", "custom_domain": true }],',
    'Worker name',
  );
  next = replaceOnce(next,
    /"SITE_URL"\s*:\s*""/,
    '"SITE_URL": "https://digg.space"',
    'canonical site URL',
  );
  if (!next.includes('"pattern": "digg.space", "custom_domain": true') ||
      !next.includes('"SITE_URL": "https://digg.space"') ||
      /indi\.blog|timqian|chinese-independent-blogs/i.test(next)) {
    throw new Error('Invalid custom domain or upstream dependency');
  }
  return next;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const id = process.env.DIGGSPACE_D1_ID || '';
  const preview = prepareCustomDomainConfig(readFileSync(CONFIG, 'utf8'), id);

  writeFileSync(CONFIG, preview);
  console.log('Prepared digg.space custom-domain deployment; RSS cron and email sending are disabled');
}
