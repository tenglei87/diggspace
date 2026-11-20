// Cloudflare may briefly return 10007 immediately after a brand-new Worker is
// uploaded, before its account-scoped Worker record becomes readable.
// Retry ONLY that exact error. Never automatically retry authorization,
// DNS ownership, custom-domain conflict, or unrelated deployment errors.
import { spawnSync } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const frontend = fileURLToPath(new URL('../', import.meta.url));
const retryDelays = [8_000, 16_000, 30_000];

export function isTransientWorker10007(output) {
  return output.includes('This Worker does not exist on your account') &&
    /\[code:\s*10007\]/.test(output);
}

export async function deployWithRetry({
  run = () => spawnSync(process.execPath, [cli, 'deploy'], {
    cwd: frontend,
    env: process.env,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  }),
  wait = pause,
  delays = retryDelays,
} = {}) {
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    console.log('Cloudflare Worker deploy attempt ' + (attempt + 1));
    const result = await run(attempt);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status === 0) {
      console.log('Cloudflare Worker deployment succeeded');
      return;
    }
    const output = String(result.stdout || '') + '\n' + String(result.stderr || '');
    if (!isTransientWorker10007(output)) {
      throw new Error('Cloudflare deployment failed (exit ' + result.status +
        '). Not retrying an error other than Worker 10007.');
    }
    if (attempt === delays.length) {
      throw new Error('Cloudflare Worker 10007 persisted after ' +
        (attempt + 1) + ' attempts. Check that the Worker exists in the selected Cloudflare account.');
    }
    console.log('New Worker not yet visible (10007); retrying only this transient case');
    await wait(delays[attempt]);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await deployWithRetry();
}
