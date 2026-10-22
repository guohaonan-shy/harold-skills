#!/usr/bin/env node
/**
 * Two-platform (Google + Bing) SEO check over a built site: scans every `index.html` under the build
 * output — exactly what a non-JS crawler sees — and reports per-route findings, each tagged with the
 * platform that cares: [Bing], [Google] or [Both]. The standards behind each check live in
 * skills/seo/seo-check/SKILL.md; this file only encodes them.
 *
 * Width, not character count: Bing counts raw characters and its recommendations assume Latin text,
 * so a visually full CJK title trips "too short". Correctness is judged on width (a CJK / full-width
 * glyph counts 2), which is language-agnostic, and an [info] line marks where Bing will likely
 * false-positive on a CJK page.
 *
 * Everything is a command-line argument, so a project's CI can call this file as-is; the post-build
 * hook passes SEO.md's「构建与检查」arguments.
 *
 * Usage: node seo-check.mjs <dist-dir> [--strict] [--filter=<route substring>]
 *          [--title-min=N] [--title-max=N] [--desc-min=N] [--desc-max=N]
 *   --filter narrows which routes are REPORTED, not the scan: hreflang reciprocity still checks
 *   against the full site, and the exit code reflects only the reported routes.
 * Exit: 0 = no error (warnings too under --strict), 1 = errors, 2 = bad arguments / no such dir.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Width units (CJK glyph = 2). Bing recommends ~50-60 (title) / ~150-160 (description) raw chars and
// truncates titles near 70; Google has no length rule. The floors sit a little under Bing's.
export const DEFAULTS = { titleMin: 48, titleMax: 70, descMin: 145, descMax: 160 };
// Bing counts raw characters: a full-width CJK page can clear the width floor and still trip Bing's
// raw-character floor, so that gets an [info] (a known false positive), never a warning.
const BING_TITLE_CHAR_FLOOR = 50;
const BING_DESC_CHAR_FLOOR = 150;

// JSON-LD types that no longer produce Google rich results.
const DEAD_FOR_GOOGLE = {
  FAQPage: 'FAQ rich results are gone for Google; harmless, still fine for a visible FAQ Bing and answer engines read.',
  HowTo: 'HowTo rich results were removed; inert for Google.',
};

const CJK_RE = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

/** Pixel-equivalent width: CJK/full-width glyphs count double. */
export function visualWidth(str) {
  let w = 0;
  for (const ch of str) w += CJK_RE.test(ch) ? 2 : 1;
  return w;
}
function hasCJK(str) {
  return CJK_RE.test(str || '');
}
function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ── HTML extraction (regex — dist HTML is machine-generated, so this is safe) ─
export function parsePage(html) {
  const pick = (re) => { const m = html.match(re); return m ? decodeEntities(m[1].trim()) : null; };
  const title = pick(/<title>([\s\S]*?)<\/title>/i);
  const description = pick(/<meta\s+name="description"\s+content="([\s\S]*?)"/i);
  const htmlLang = pick(/<html[^>]*\slang="([^"]*)"/i);
  const robots = pick(/<meta\s+name="robots"\s+content="([^"]*)"/i);
  const noindex = /noindex/i.test(robots || '');

  const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"/gi)].map((m) => m[1]);

  const hreflangs = {};
  for (const m of html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"/gi)) {
    hreflangs[m[1]] = m[2];
  }

  // Body snapshot: H1s and imgs inside <body>, only when the build ships static markup.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : '';
  const hasSnapshot = body.trim().length > 0;
  const h1Count = (body.match(/<h1[\s>]/gi) || []).length;
  const imgs = body.match(/<img\b[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter((t) => !/\salt=/i.test(t)).length;

  // JSON-LD @types (flatten @graph).
  const types = new Set();
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      const json = JSON.parse(m[1]);
      const nodes = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
      for (const n of nodes) {
        const t = n && n['@type'];
        if (Array.isArray(t)) t.forEach((x) => types.add(x));
        else if (t) types.add(t);
      }
    } catch { /* ignore malformed — reported separately below */ }
  }
  const jsonLdMalformed = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
    .some((m) => { try { JSON.parse(m[1]); return false; } catch { return true; } });

  return { title, description, htmlLang, noindex, canonicals, hreflangs, hasSnapshot, h1Count, imgsNoAlt, types, jsonLdMalformed };
}

// ── Walk dist for every index.html ──────────────────────────────────────────
export function findIndexHtml(dir, distRoot, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) findIndexHtml(full, distRoot, out);
    else if (name === 'index.html') {
      const rel = relative(distRoot, dir);
      out.push({ routePath: rel === '' ? '/' : '/' + rel.split('\\').join('/'), file: full });
    }
  }
  return out;
}

// ── Lint one page; returns findings [{sev, platform, msg}] ────────────────────
export function lintPage(p, byCanonical, t = DEFAULTS) {
  const { titleMin: TITLE_WIDTH_MIN, titleMax: TITLE_WIDTH_MAX, descMin: DESC_WIDTH_MIN, descMax: DESC_WIDTH_MAX } = t;
  const f = [];
  const add = (sev, platform, msg) => f.push({ sev, platform, msg });
  const isCJK = (p.htmlLang && /^(zh|ja|ko)/i.test(p.htmlLang)) || hasCJK(p.title) || hasCJK(p.description);

  // noindex pages never appear in SERP — skip title/description/SERP-facing
  // checks (legal, etc.), but still validate structural integrity below.
  if (p.noindex) {
    add('notice', 'Both', 'noindex — SERP checks (title/description length, H1) skipped.');
    if (p.canonicals.length > 1) add('error', 'Both', `Multiple rel=canonical (${p.canonicals.length}).`);
    if (p.jsonLdMalformed) add('error', 'Both', 'Malformed JSON-LD (failed to parse).');
    return f;
  }

  // — Title —
  if (!p.title) add('error', 'Both', 'Missing <title>.');
  else {
    const w = visualWidth(p.title), c = [...p.title].length;
    if (w < TITLE_WIDTH_MIN) add('warn', 'Bing', `Title thin (width ${w} < ${TITLE_WIDTH_MIN}). Google ignores length.`);
    else if (w > TITLE_WIDTH_MAX) add('warn', 'Both', `Title wide (width ${w} > ${TITLE_WIDTH_MAX}); will truncate in SERP.`);
    if (isCJK && c < BING_TITLE_CHAR_FLOOR && w >= TITLE_WIDTH_MIN)
      add('info', 'Bing', `Bing may flag "title too short" (raw chars ${c} < ~${BING_TITLE_CHAR_FLOOR}); pixel width ${w} is fine — CJK false positive, safe to ignore.`);
  }

  // — Description —
  if (!p.description) add('error', 'Bing', 'Missing meta description. (Google tolerates it; Bing flags it.)');
  else {
    const w = visualWidth(p.description), c = [...p.description].length;
    if (w < DESC_WIDTH_MIN) add('warn', 'Bing', `Description thin (width ${w} < ${DESC_WIDTH_MIN}). Google rewrites snippets, ignores length.`);
    // An over-long description is an error, not a warning: CI usually runs without --strict, so a
    // warning here would never be enforced.
    else if (w > DESC_WIDTH_MAX) add('error', 'Both', `Description wide (width ${w} > ${DESC_WIDTH_MAX}); will truncate.`);
    if (isCJK && c < BING_DESC_CHAR_FLOOR && w >= DESC_WIDTH_MIN)
      add('info', 'Bing', `Bing may flag "description too short" (raw chars ${c} < ~${BING_DESC_CHAR_FLOOR}); pixel width ${w} is fine — CJK false positive, safe to ignore.`);
  }

  // — Canonical —
  if (p.canonicals.length === 0) add('warn', 'Both', 'No rel=canonical.');
  else if (p.canonicals.length > 1) add('error', 'Both', `Multiple rel=canonical (${p.canonicals.length}) — Google ignores all of them.`);

  // — html lang —
  if (!p.htmlLang) add('notice', 'Bing', 'Missing <html lang>.');

  // — hreflang reciprocity + self-reference + x-default —
  const self = p.canonicals[0];
  const alts = Object.entries(p.hreflangs).filter(([k]) => k !== 'x-default');
  if (alts.length > 0) {
    if (self && !Object.values(p.hreflangs).includes(self))
      add('notice', 'Google', 'hreflang set has no self-referential entry.');
    if (!p.hreflangs['x-default']) add('notice', 'Google', 'hreflang set has no x-default fallback.');
    for (const [lang, url] of alts) {
      const target = byCanonical.get(url.replace(/\/$/, ''));
      if (!target) add('warn', 'Google', `hreflang "${lang}" → ${url} has no matching page in dist.`);
      else if (self && !Object.values(target.hreflangs).includes(self))
        add('warn', 'Google', `hreflang "${lang}" → ${url} is not reciprocal (target doesn't link back).`);
    }
  }

  // — H1 / alt (only where a static body snapshot exists) —
  if (p.hasSnapshot) {
    if (p.h1Count === 0) add('notice', 'Bing', 'No <h1> in page body.');
    else if (p.h1Count > 1) add('warn', 'Bing', `Multiple <h1> (${p.h1Count}) in page body.`);
    if (p.imgsNoAlt > 0) add('warn', 'Both', `${p.imgsNoAlt} <img> without alt in page body.`);
  }

  // — JSON-LD —
  if (p.jsonLdMalformed) add('error', 'Both', 'Malformed JSON-LD (failed to parse).');
  for (const t of p.types) {
    if (DEAD_FOR_GOOGLE[t]) add('info', 'Google', `JSON-LD ${t}: ${DEAD_FOR_GOOGLE[t]}`);
  }

  return f;
}


/** Lints every route under distRoot; returns { pages, report: [{ routePath, findings }] }. */
export function check(distRoot, { filter = null, thresholds = DEFAULTS } = {}) {
  const pages = findIndexHtml(distRoot, distRoot).map((e) => ({ ...e, parsed: parsePage(readFileSync(e.file, 'utf-8')) }));
  pages.sort((a, b) => a.routePath.localeCompare(b.routePath));
  // Indexed by canonical over the FULL site, so a filtered run still validates hreflang reciprocity.
  const byCanonical = new Map();
  for (const pg of pages) {
    const c = pg.parsed.canonicals[0];
    if (c) byCanonical.set(c.replace(/\/$/, ''), pg.parsed);
  }
  const reported = filter ? pages.filter((pg) => pg.routePath.includes(filter)) : pages;
  return { pages, reported, report: reported.map((pg) => ({ routePath: pg.routePath, findings: lintPage(pg.parsed, byCanonical, thresholds) })) };
}

const NUM_FLAGS = { '--title-min': 'titleMin', '--title-max': 'titleMax', '--desc-min': 'descMin', '--desc-max': 'descMax' };

export function parseArgs(argv) {
  const opts = { dist: null, strict: false, filter: null, thresholds: { ...DEFAULTS } };
  for (const a of argv) {
    if (a === '--strict') opts.strict = true;
    else if (a.startsWith('--filter=')) opts.filter = a.slice('--filter='.length);
    else if (a.startsWith('--')) {
      const [flag, value] = a.split('=');
      if (!NUM_FLAGS[flag] || !/^\d+$/.test(value ?? '')) throw new Error(`不认识的参数「${a}」`);
      opts.thresholds[NUM_FLAGS[flag]] = Number(value);
    } else if (!opts.dist) opts.dist = a;
    else throw new Error(`多余的参数「${a}」`);
  }
  if (!opts.dist) throw new Error('usage: seo-check.mjs <产物目录> [--strict] [--filter=<路由片段>] [--title-min=N --title-max=N --desc-min=N --desc-max=N]');
  return opts;
}

const TAG = { error: 'ERROR', warn: 'WARN ', notice: 'NOTE ', info: 'INFO ' };

/** The human-readable report and the exit code. */
export function render(distRoot, result, { strict = false, filter = null } = {}) {
  const lines = [filter ? `seo-check · ${result.reported.length} routes (filter "${filter}" of ${result.pages.length}) · ${distRoot}` : `seo-check · ${result.pages.length} routes · ${distRoot}`, ''];
  const n = { error: 0, warn: 0, notice: 0, info: 0 };
  let withIssues = 0;
  for (const { routePath, findings } of result.report) {
    if (!findings.length) continue;
    withIssues++;
    lines.push(`  ${routePath}`);
    for (const { sev, platform, msg } of findings) {
      n[sev]++;
      lines.push(`    [${TAG[sev]}] [${platform}] ${msg}`);
    }
    lines.push('');
  }
  lines.push(`Summary: ${n.error} error · ${n.warn} warn · ${n.notice} notice · ${n.info} info  (across ${withIssues}/${result.pages.length} routes)`);
  if (!n.error && !n.warn) lines.push('✓ clean (errors + warnings)');
  return { text: lines.join('\n'), code: n.error > 0 || (strict && n.warn > 0) ? 1 : 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const distRoot = resolve(opts.dist);
  if (!existsSync(distRoot)) {
    console.error(`✗ 产物目录不存在：${distRoot}（先构建）`);
    process.exit(2);
  }
  const result = check(distRoot, opts);
  if (opts.filter && !result.reported.length) {
    console.error(`✗ --filter=${opts.filter} 在 ${distRoot} 下没匹配到任何路由`);
    process.exit(2);
  }
  const { text, code } = render(distRoot, result, opts);
  console.log(text);
  process.exit(code);
}
