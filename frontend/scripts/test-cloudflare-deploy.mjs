// Pure pre-deployment safety tests; no Cloudflare credentials are required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareCustomDomainConfig } from './prepare-cloudflare-deployment.mjs';
import { resolveDiggspaceD1 } from './resolve-cloudflare-d1.mjs';
import { deploymentUrl } from './read-deployment-output.mjs';

const original = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const UUID = '11111111-2222-3333-4444-555555555555';

assert.equal(resolveDiggspaceD1([]), null);
assert.equal(resolveDiggspaceD1([{ name: 'other', uuid: UUID }]), null);
assert.equal(resolveDiggspaceD1([{ name: 'diggspace', uuid: UUID }]), UUID);
assert.equal(resolveDiggspaceD1([{ name: 'diggspace', id: UUID }]), UUID);
assert.equal(resolveDiggspaceD1([{}]), null, 'unrelated databases must be ignored');
assert.throws(() => resolveDiggspaceD1([{ name: 'diggspace', uuid: 'not-a-uuid' }]));
assert.throws(() => resolveDiggspaceD1([
  { name: 'diggspace', uuid: UUID }, { name: 'diggspace', uuid: UUID },
]));

assert.throws(() => prepareCustomDomainConfig(original, '00000000-0000-0000-0000-000000000000'));
assert.throws(() => prepareCustomDomainConfig(original, 'bad-d1-id'));
assert.throws(() => prepareCustomDomainConfig(original, 'b1261162-994b-429e-8447-3a3554a96e9c'));
const next = prepareCustomDomainConfig(original, UUID);
assert.ok(next.includes('"database_id": "' + UUID + '"'));
assert.ok(next.includes('"workers_dev": false'));
assert.ok(next.includes('"routes": [{ "pattern": "digg.space", "custom_domain": true }]'));
assert.ok(next.includes('"SITE_URL": "https://digg.space"'));
assert.ok(next.includes('"crons": []'));
assert.ok(!next.includes('"cpu_ms": 300000'));
assert.ok(!next.includes('"subrequests": 20000'));
assert.ok(!next.includes('"send_email":'));
assert.ok(!/"routes"\s*:/.test(original));
assert.ok(original.includes('00000000-0000-0000-0000-000000000000'), 'must not mutate repository source config');
assert.throws(() => prepareCustomDomainConfig(next, UUID), 'preparation is one-time');

const output = [
  JSON.stringify({ type: 'other', worker_name: 'diggspace', targets: ['https://wrong.workers.dev'] }),
  JSON.stringify({ type: 'deploy', worker_name: 'unrelated', targets: ['https://wrong.workers.dev'] }),
  JSON.stringify({ type: 'deploy', worker_name: 'diggspace',
    targets: ['https://diggspace.preview-account.workers.dev'] }),
].join('\n');
assert.equal(deploymentUrl(output), 'https://diggspace.preview-account.workers.dev');
assert.equal(deploymentUrl('invalid json'), null);
assert.equal(deploymentUrl(JSON.stringify({
  type: 'deploy', worker_name: 'diggspace', targets: ['https://example.org'],
})), null);

console.log('PASS: D1 ownership selection, digg.space custom domain, disabled cron/email, and URL extraction');
