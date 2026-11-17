#!/usr/bin/env node
/**
 * The check an SEO PR gets after it is merged: do the live pages say what the build said they would?
 * For each URL (one per line of the PR description's 上线自查的网址 section, `<url> 目标词：<word>`) it
 * fetches the live page, finds the page the same URL has in the build output, and reports four items:
 *
 *   status   the page opens (HTTP 200 after redirects)
 *   noindex  neither a robots meta tag (robots, googlebot, bingbot) nor the X-Robots-Tag header says noindex / none
 *   meta     the live <title> and meta description equal the build's
 *   sitemap  the live /sitemap.xml (or the child sitemaps of a sitemap index) lists the page
 *
 * A page that cannot be fetched fails status, and noindex and meta with it: nothing was checked, so
 * nothing passes. Reading HTML here does not go through seo-check.mjs's parsePage: that one assumes
 * the attribute order a build emits, and a live page may be rewritten on the way (a CDN, a proxy).
 *
 * `--wait` first waits for the deploy: once a minute (`--interval=<seconds>`) it fetches every page, and
 * the site counts as live when every page's title and description equal the build's. The wait ends after
 * SEO.md's 构建与检查 `上线等待` minutes (30 when not written); then nothing is judged failed: the verdict
 * is `not-live` and `pending` lists the pages still serving something else. (A page whose description
 * alone changed would pass a title-only test against the old deploy, so the description counts too.)
 *
 * Usage: node seo-live-check.mjs <SEO.md> <build-dir> --urls=<file|-> [--wait] [--interval=<seconds>] [--max-wait=<seconds>]
 *   → { "verdict": "pass"|"fail"|"not-live", "waitedMinutes"?, "limitMinutes"?, "pending"?: [url],
 *       "pages": [{ url, keyword, status|noindex|meta|sitemap: { ok, detail } }], "failed": [{ url, item, detail }] }
 *   (`--max-wait` overrides the wait's length in seconds, for tests; `limitMinutes` stays SEO.md's.)
 * Exit: 0 = judged (either way: read `verdict`), 1 = bad input: no SEO.md, no URL, a URL with no page in the build (reason on stderr).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSeoMd } from './seo-md.mjs';

export const ITEMS = ['status', 'noindex', 'meta', 'sitemap'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const tidy = (s) => decode(s).replace(/\s+/g, ' ').trim();

/** The attributes of one tag's text, names lower-cased; either quote style, any order. */
function attributes(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

/** noindex or none, anywhere in a robots-style value (`noindex, follow`, `googlebot: noindex`, `none`). */
const forbidsIndex = (value) => /(?:^|[,:\s])(?:noindex|none)(?=$|[,\s])/i.test(String(value ?? ''));

/** What a page says about itself: { title, description, noindex }. */
export function facts(html) {
  const metas = [...String(html).matchAll(/<meta\b([^>]*)>/gi)].map((m) => attributes(m[1]));
  const named = (re) => metas.filter((a) => re.test(a.name ?? ''));
  const title = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = named(/^description$/i)[0]?.content;
  return {
    title: title ? tidy(title[1]) : null,
    description: description === undefined ? null : tidy(description),
    noindex: named(/^(?:robots|googlebot|bingbot)$/i).some((a) => forbidsIndex(a.content)),
  };
}

/** `<url> 目标词：<word>` lines (a bullet, a checkbox or <> around the URL is fine); lines without a URL are skipped. */
export function parseUrls(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(?:[-*]\s+)?(?:\[[ xX]\]\s*)?[<`]?(https?:\/\/[^\s>`]+)[>`]?\s*(?:目标词\s*[：:]\s*(.*?))?\s*$/);
    if (m) out.push({ url: m[1], keyword: m[2] ? m[2].trim() : null });
  }
  return out;
}

/** The build's file for a live URL: `<path>/index.html`, the file itself, or `<path>.html`. Throws when the build has none. */
export function distFile(distRoot, url) {
  const path = decodeURIComponent(new URL(url).pathname).replace(/\/+$/, '');
  const root = resolve(distRoot);
  const candidates = [join(root, path, 'index.html'), join(root, path), `${join(root, path)}.html`];
  const hit = candidates.find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!hit) throw new Error(`产物目录 ${distRoot} 里找不到 ${url} 对应的页面（试过 ${candidates.map((c) => c.slice(root.length)).join('、')}）：网址写错，或这次的构建产物不对`);
  return hit;
}

const FETCH_HEADERS = { 'user-agent': 'idea-loop-seo-live-check', 'cache-control': 'no-cache' };

async function get(fetchImpl, url) {
  try {
    const res = await fetchImpl(url, { redirect: 'follow', headers: FETCH_HEADERS, signal: AbortSignal.timeout(20_000) });
    return { status: res.status, xRobots: res.headers.get('x-robots-tag') ?? '', body: await res.text() };
  } catch (e) {
    return { error: String(e?.cause?.code ?? e?.cause?.message ?? e?.message ?? e) };
  }
}

const sameUrl = (a, b) => {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    return x.origin.toLowerCase() === y.origin.toLowerCase() && x.pathname.replace(/\/+$/, '') === y.pathname.replace(/\/+$/, '') && x.search === y.search;
  } catch {
    return false;
  }
};

const locs = (xml) => [...String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decode(m[1]));

/** Every page URL the origin's sitemap.xml lists (child sitemaps of an index included), or an error text. */
async function sitemapOf(origin, fetchImpl) {
  const first = await get(fetchImpl, `${origin}/sitemap.xml`);
  if (first.error) return { error: `${origin}/sitemap.xml 连不上：${first.error}` };
  if (first.status !== 200) return { error: `${origin}/sitemap.xml 返回 ${first.status}` };
  if (!/<sitemapindex/i.test(first.body)) return { urls: locs(first.body) };
  const urls = [];
  for (const child of locs(first.body).slice(0, 50)) {
    const r = await get(fetchImpl, child);
    if (!r.error && r.status === 200) urls.push(...locs(r.body));
  }
  return { urls };
}

const fail = (detail) => ({ ok: false, detail });
const pass = (detail = '') => ({ ok: true, detail });

/** The four items for one live URL, given what the page returned, the build's facts and the origin's sitemap. */
function judgePage(entry, got, built, sitemap) {
  const base = { url: entry.url, keyword: entry.keyword };
  if (got.error) {
    const why = `没取到页面（${got.error}）`;
    return { ...base, status: fail(`连不上：${got.error}`), noindex: fail(`${why}，未核`), meta: fail(`${why}，未核`), sitemap: sitemapItem(entry.url, sitemap) };
  }
  if (got.status !== 200) {
    const why = `页面返回 ${got.status}，未核`;
    return { ...base, status: fail(`返回 ${got.status}`), noindex: fail(why), meta: fail(why), sitemap: sitemapItem(entry.url, sitemap) };
  }
  const live = facts(got.body);
  const noindex = live.noindex ? fail('meta robots 写了 noindex') : forbidsIndex(got.xRobots) ? fail(`响应头 X-Robots-Tag 是「${got.xRobots}」`) : pass();
  const diffs = [];
  if (live.title !== built.title) diffs.push(`title 线上「${live.title ?? '没有'}」，产物「${built.title ?? '没有'}」`);
  if (live.description !== built.description) diffs.push(`description 线上「${live.description ?? '没有'}」，产物「${built.description ?? '没有'}」`);
  return { ...base, status: pass('200'), noindex, meta: diffs.length ? fail(diffs.join('；')) : pass(), sitemap: sitemapItem(entry.url, sitemap) };
}

function sitemapItem(url, sitemap) {
  if (sitemap.error) return fail(sitemap.error);
  return sitemap.urls.some((u) => sameUrl(u, url)) ? pass() : fail(`${new URL(url).origin}/sitemap.xml 里没有这个网址`);
}

const builtFacts = (distRoot, url) => facts(readFileSync(distFile(distRoot, url), 'utf8'));

/** Checks every URL against the live site now. */
export async function checkAll(entries, distRoot, { fetch: fetchImpl = fetch } = {}) {
  const built = entries.map((e) => builtFacts(distRoot, e.url));
  const sitemaps = new Map();
  const pages = [];
  for (const [i, entry] of entries.entries()) {
    const origin = new URL(entry.url).origin;
    if (!sitemaps.has(origin)) sitemaps.set(origin, await sitemapOf(origin, fetchImpl));
    pages.push(judgePage(entry, await get(fetchImpl, entry.url), built[i], sitemaps.get(origin)));
  }
  const failed = pages.flatMap((p) => ITEMS.filter((k) => !p[k].ok).map((item) => ({ url: p.url, item, detail: p[item].detail })));
  return { pages, failed };
}

export const verdict = (result) => (result.failed.length ? 'fail' : 'pass');

/** Polls once a minute until every page serves the build's title and description, or `maxMs` ran out. */
export async function waitLive(entries, distRoot, { fetch: fetchImpl = fetch, intervalMs = 60_000, maxMs = 30 * 60_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const built = entries.map((e) => builtFacts(distRoot, e.url));
  const start = now();
  for (;;) {
    const pending = [];
    for (const [i, entry] of entries.entries()) {
      const got = await get(fetchImpl, entry.url);
      const f = !got.error && got.status === 200 ? facts(got.body) : null;
      if (!f || f.title !== built[i].title || f.description !== built[i].description) pending.push(entry.url);
    }
    const waitedMs = now() - start;
    if (!pending.length) return { live: true, waitedMs, pending };
    if (waitedMs >= maxMs) return { live: false, waitedMs, pending };
    await sleep(intervalMs);
  }
}

function flag(argv, name) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.includes('=') ? hit.slice(name.length + 3) : true;
}

async function main(argv) {
  const [seoMd, dist] = argv.filter((a) => !a.startsWith('--'));
  const urlsFrom = flag(argv, 'urls');
  if (!seoMd || !dist || typeof urlsFrom !== 'string') throw new Error('usage: seo-live-check.mjs <SEO.md> <产物目录> --urls=<file|-> [--wait] [--interval=<秒>]');
  const { build } = readSeoMd(seoMd);
  const entries = parseUrls(readFileSync(urlsFrom === '-' ? 0 : urlsFrom, 'utf8'));
  if (!entries.length) throw new Error('网址清单里一个网址也没读到（每行 `<网址> 目标词：<词>`）');
  for (const e of entries) distFile(dist, e.url);
  const out = {};
  if (flag(argv, 'wait')) {
    const seconds = (name, fallback) => (flag(argv, name) === undefined ? fallback : Number(flag(argv, name)));
    const w = await waitLive(entries, dist, { intervalMs: seconds('interval', 60) * 1000, maxMs: seconds('max-wait', build.liveWait * 60) * 1000 });
    out.waitedMinutes = Math.round(w.waitedMs / 60_000);
    out.limitMinutes = build.liveWait;
    if (!w.live) return { verdict: 'not-live', ...out, pending: w.pending, pages: [], failed: [] };
  }
  const r = await checkAll(entries, dist);
  return { verdict: verdict(r), ...out, ...r };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (r) => console.log(JSON.stringify(r, null, 2)),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
