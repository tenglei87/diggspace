// Read the production Worker streaming crawl response from the runner so the
// ADMIN_TOKEN secret never needs to be copied to a local terminal or chat.
import { appendFileSync } from 'node:fs';

const token = process.env.DIGGSPACE_ADMIN_TOKEN || '';
if (token.length < 32) throw Error('No GitHub Actions administrator secret configured');
const endpoint = 'https://digg.space/api/admin/crawl?limit=2&favicons=0';
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token },
  signal: AbortSignal.timeout(150_000),
});
if (res.status !== 200) throw Error('Protected RSS crawl HTTP ' + res.status);
const raw = await res.text();
if (raw.length > 32_768) throw Error('Unexpectedly large crawl response');
const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const errors = lines.filter(s => s.startsWith('error:'));
if (errors.length) throw Error('Worker crawl failed: ' + errors.join(' | '));
const completed = lines.filter(x => x.startsWith('{') && x.includes('"feeds"')).at(-1);
if (!completed) throw Error('Worker crawl returned no completion summary: ' + raw.slice(-1000));
const result = JSON.parse(completed);
if (!result.feeds || result.feeds.due > 2 || result.feeds.checked > 2 ||
    result.feeds.checked < 1) {
  throw Error('RSS crawl did not respect two-feed safety limit: ' + completed.slice(0, 700));
}
const summary = {
  checked: result.feeds.checked,
  due: result.feeds.due,
  statuses: result.feeds.statuses,
  failed: result.feeds.failed,
  snapshot: result.snapshot?.blogs ?? null,
  importedCatalog: result.sync?.source,
};
console.log('RSS pilot completed: ' + JSON.stringify(summary));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\nRSS pilot (2 source limit): ' + JSON.stringify(summary) + '\n');
}
