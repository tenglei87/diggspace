// RSS/Atom parser shared by the Cloudflare Worker and Node tests.
// Only Web-standard APIs; no extra dependencies.

export const USER_AGENT =
  'Mozilla/5.0 (compatible; DiggSpaceBot/1.0; +https://github.com/tenglei87/diggspace)';
const TIMEOUT_MS = 20_000;
// A feed bigger than this is skipped, so one huge (or hostile) response can't
// exhaust a Worker's 128 MB of memory
const MAX_FEED_BYTES = 8 * 1024 * 1024;

// Read a response body as UTF-8 text, giving up past `maxBytes`
export async function readTextCapped(res, maxBytes) {
  if (+res.headers.get('content-length') > maxBytes) {
    res.body?.cancel();
    throw Object.assign(new Error(`response larger than ${maxBytes} bytes`), { code: 'TOO_LARGE' });
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel();
      throw Object.assign(new Error(`response larger than ${maxBytes} bytes`), { code: 'TOO_LARGE' });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
const DAY = 24 * 60 * 60 * 1000;
// Earlier dates are placeholders like 1970-01-01, not real posts
const MIN_DATE = Date.UTC(1995, 0, 1);

function safeCodePoint(raw, radix) {
  const value = Number.parseInt(raw, radix);
  // Untrusted XML can contain impossible Unicode points or control characters.
  if (!Number.isInteger(value) || value < 1 || value > 0x10ffff ||
      (value >= 0xd800 && value <= 0xdfff) ||
      (value < 32 && ![9, 10, 13].includes(value))) return '\uFFFD';
  return String.fromCodePoint(value);
}

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(h, 16))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(d, 10))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// Text content of an XML element (titles, dates, links)
export function decodeText(raw) {
  return decodeEntities(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// Plain text from an element that holds (usually escaped) HTML, e.g. <description>
function htmlToText(raw) {
  let html = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  if (!/<[a-z]/i.test(html)) html = decodeEntities(html);
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw, now) {
  const text = decodeText(raw);
  if (!text) return null;
  let d = new Date(text);
  if (Number.isNaN(d.getTime())) {
    const m = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (!m) return null;
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  // Ignore obviously bogus dates
  if (d.getTime() > now + 2 * DAY || d.getTime() < MIN_DATE) return null;
  return d;
}

function entryLink(entry, feedType, baseUrl) {
  let link;
  if (feedType === 'sitemap') {
    link = entry.match(/<loc[^>]*>([\s\S]*?)<\/loc>/)?.[1];
  } else {
    // Atom style: <link rel="alternate" href="..."/>; skip rel="self" / "edit" etc.
    for (const [tag] of entry.matchAll(/<link\b[^>]*>/g)) {
      const href = tag.match(/href=["']([^"']+)["']/)?.[1];
      const rel = tag.match(/rel=["']([^"']+)["']/)?.[1];
      if (href && (!rel || rel === 'alternate')) {
        link = href;
        break;
      }
    }
    // RSS style: <link>...</link>
    link ??= entry.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1];
  }
  if (!link) return undefined;
  try {
    const url = new URL(decodeText(link), baseUrl);
    // Feeds are untrusted: a javascript: or data: link would run script on our site
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

// Returns { feedType, entryCount, entries } or null if the body isn't a feed.
// `entries` only includes dated entries, newest first.
export function parseFeed(text, baseUrl, now = Date.now()) {
  const head = text.slice(0, 3000);
  let feedType;
  if (/<feed[\s>]/.test(head)) feedType = 'atom';
  else if (/<(rss|rdf:RDF)[\s>]/.test(head)) feedType = 'rss';
  else if (/<urlset[\s>]/.test(head)) feedType = 'sitemap';
  else return null;

  const entryTag = { atom: 'entry', rss: 'item', sitemap: 'url' }[feedType];
  const raw = text.match(new RegExp(`<${entryTag}[\\s>][\\s\\S]*?</${entryTag}>`, 'g')) ?? [];

  // Only look at dates inside entries; channel-level dates are often build times.
  // Prefer publish dates: generators like Hexo set <updated> to the build time.
  const latestDate = (entry, tags) => {
    let date = null;
    for (const [, d] of entry.matchAll(new RegExp(`<(?:${tags})[^>]*>([\\s\\S]*?)<\\/`, 'g'))) {
      const parsed = parseDate(d, now);
      if (parsed && (!date || parsed > date)) date = parsed;
    }
    return date;
  };
  const entries = [];
  for (const entry of raw) {
    const date = latestDate(entry, 'pubDate|published|dc:date|dc:created|issued') ?? latestDate(entry, 'updated|modified|lastmod');
    if (!date) continue;
    const title = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
    const body = entry.match(/<(description|summary|content:encoded|content)\b[^>]*>([\s\S]*?)<\/\1>/)?.[2];
    entries.push({
      date,
      title: title ? decodeText(title) : undefined,
      url: entryLink(entry, feedType, baseUrl),
      summary: body ? htmlToText(body).slice(0, 200) : undefined,
    });
  }
  entries.sort((a, b) => b.date - a.date);
  return { feedType, entryCount: raw.length, entries };
}

function classifyError(err) {
  if (err.name === 'TimeoutError') return ['network_error', 'timeout'];
  const code = err.cause?.code ?? err.code ?? '';
  const message = err.cause?.message ?? err.message;
  if (/CERT|SSL|TLS/.test(code)) return ['ssl_error', `${code}: ${message}`];
  return ['network_error', code ? `${code}: ${message}` : message];
}

// External feeds are fixed in the checked-in catalog, but redirects may still
// be untrusted. Reject raw IPs, private-looking hosts and URL credentials.
const MAX_REDIRECTS = 4;
function safeFeedUrl(raw) {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username ||
        url.password || (url.port && !['80', '443'].includes(url.port)) ||
        !hostname.includes('.') || hostname.startsWith('[') ||
        /^[0-9.]+$/.test(hostname) ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)) return null;
    return url.href;
  } catch { return null; }
}

// Fetch one of the curated RSS sources. No user-supplied URL is accepted.
// Handle redirects ourselves so a feed cannot silently redirect to an IP or
// internal host. A single deadline covers the entire redirect chain.
export async function fetchFeed(source, now = Date.now()) {
  if (!source.feed) return { status: 'no_rss' };
  let url = safeFeedUrl(source.feed);
  if (!url) return { status: 'network_error', error: 'invalid feed URL' };
  let res, text;
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const sameFeed = url === source.feed;
      res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          ...(sameFeed && source.etag && { 'If-None-Match': source.etag }),
          ...(sameFeed && source.last_modified && { 'If-Modified-Since': source.last_modified }),
        },
        redirect: 'manual',
        signal,
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        res.body?.cancel();
        if (!location || hop === MAX_REDIRECTS)
          return { status: 'http_error', error: 'invalid or excessive feed redirects' };
        const target = safeFeedUrl(new URL(location, url).href);
        if (!target || (url.startsWith('https:') && target.startsWith('http:')))
          return { status: 'http_error', error: 'unsafe feed redirect' };
        url = target;
        continue;
      }
      if (res.status === 304) {
        res.body?.cancel();
        return { status: 'not_modified' };
      }
      if (!res.ok) {
        res.body?.cancel();
        return { status: 'http_error', error: `HTTP ${res.status}` };
      }
      text = await readTextCapped(res, MAX_FEED_BYTES);
      break;
    }
  } catch (err) {
    if (err?.code === 'TOO_LARGE')
      return { status: 'not_a_feed', error: 'feed larger than 8 MB' };
    const [status, error] = classifyError(err);
    return { status, error: String(error || 'network error').slice(0, 200) };
  }

  let feed;
  try { feed = parseFeed(text.trimStart(), url, now); }
  catch { return { status: 'not_a_feed', error: 'malformed feed document' }; }
  if (!feed) return { status: 'not_a_feed', error: 'response is not RSS/Atom' };
  return {
    status: feed.entries.length ? 'ok' : 'no_dates',
    feedType: feed.feedType,
    entryCount: feed.entryCount,
    entries: feed.entries,
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    ...(url !== source.feed && { redirectedTo: url }),
  };
}
