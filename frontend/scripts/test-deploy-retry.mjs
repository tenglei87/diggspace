import assert from 'node:assert/strict';
import { deployWithRetry, isTransientWorker10007 } from './deploy-with-retry.mjs';

const transient = '\nThis Worker does not exist on your account. [code: 10007]\n';
const conflict = '\nCannot attach custom domain digg.space: DNS record exists [code: 10021]\n';
const permission = '\nAuthentication error [code: 10000]\n';
assert.equal(isTransientWorker10007(transient), true);
assert.equal(isTransientWorker10007(permission), false);
assert.equal(isTransientWorker10007(conflict), false);
assert.equal(isTransientWorker10007('Other Worker missing [code: 10007]'), false);

const result = (code, logs='') => ({ status: code, stdout: logs, stderr: '' });
let tries = 0;
const sleeps = [];
await deployWithRetry({
  run: async () => (++tries < 3 ? result(1, transient) : result(0, 'Uploaded diggspace')),
  wait: async (ms) => sleeps.push(ms),
  delays: [8000, 16000],
});
assert.equal(tries, 3, 'retries 10007 and stops once deploy succeeds');
assert.deepEqual(sleeps, [8000, 16000]);

let otherTries = 0;
await assert.rejects(
  deployWithRetry({
    run: () => { otherTries++; return result(1, conflict); },
    wait: async () => { throw Error('should not wait'); },
  }),
  /Not retrying/,
);
assert.equal(otherTries, 1, 'never retries domain conflict');

await assert.rejects(
  deployWithRetry({
    run: () => result(1, transient),
    wait: async () => {},
    delays: [0],
  }),
  /persisted after 2 attempts/,
);

await assert.rejects(
  deployWithRetry({
    run: () => result(1, permission),
    wait: async () => { throw Error('should not wait'); },
  }),
  /Not retrying/,
);
console.log('PASS: bounded 10007 retry, success, conflict and permission fail-fast');
