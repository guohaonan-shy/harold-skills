#!/usr/bin/env node
/**
 * Key-page regressions between two OpenSEO site audits. OpenSEO keeps every audit it ran, so the
 * previous one is the baseline and nothing has to be stored in the project. An audit's per-page data
 * carries status code, title, description, indexability and sitemap membership — not canonical,
 * hreflang or JSON-LD, which seo-check covers before release.
 *
 *   severe  — status is not 200, the page became non-indexable, left the sitemap, or is missing from
 *             this audit while the previous one had it
 *   warning — title or description changed (may well be on purpose; the issue session decides)
 *
 * Input: SEO.md and two files holding the raw JSON `get_audit_pages` returned (`{ pages: [...] }`),
 * previous first. Each file may also carry `auditId` / `completedAt` (copied from
 * `list_site_audits`) — they go into the evidence and the repro steps.
 *
 * Usage: node seo-baseline.mjs <SEO.md> <previous.json> <current.json>   → findings (direction technical)
 * Exit: 0 = compared, 1 = unreadable input (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readSeoMd } from './seo-md.mjs';

const key = (u) => String(u ?? '').trim().replace(/\/+$/, '');
const day = (iso) => (iso ? String(iso).slice(0, 10) : new Date().toISOString().slice(0, 10));

/** What regressed on one page: { severe: [...], warning: [...] }, each a short line. */
export function pageChanges(prev, cur) {
  const severe = [];
  const warning = [];
  if (!cur) return { severe: prev ? ['本次审计里没有这个页面'] : [], warning };
  if (cur.statusCode !== 200) severe.push(`状态码 ${prev?.statusCode ?? '?'} → ${cur.statusCode}`);
  if (prev?.isIndexable && cur.isIndexable === false) severe.push('可索引 → 不可索引');
  if (prev?.inSitemap && cur.inSitemap === false) severe.push('从 sitemap 里消失');
  if (prev && prev.title !== cur.title) warning.push(`title「${prev.title ?? ''}」→「${cur.title ?? ''}」`);
  if (prev && prev.metaDescription !== cur.metaDescription) warning.push('description 变了');
  return { severe, warning };
}

const auditRef = (a) => (a.auditId ? `auditId ${a.auditId}` : '最近一次审计');

export function regressions(seo, previous, current) {
  const prev = new Map((previous.pages ?? []).map((p) => [key(p.url), p]));
  const cur = new Map((current.pages ?? []).map((p) => [key(p.url), p]));
  const severe = [];
  const warning = [];
  for (const { url } of seo.keyPages) {
    const k = key(url);
    const c = pageChanges(prev.get(k), cur.get(k));
    if (c.severe.length) severe.push({ url: k, lines: c.severe });
    if (c.warning.length) warning.push({ url: k, lines: c.warning });
  }
  const when = day(current.completedAt);
  const repro = (urls) =>
    `list_site_audits 找到两次审计（上一次 ${auditRef(previous)}，本次 ${auditRef(current)}），各调 get_audit_pages（limit 1000），按网址对比：${urls.join('、')}；再用 curl -sI 和 curl -s 看线上页面的状态码与 <title>、meta robots`;
  const values = (rows) => rows.map((r) => `${r.url}：${r.lines.join('，')}`).join('；');
  const out = [];
  if (severe.length)
    out.push({
      direction: 'technical',
      kind: 'key-page-regression',
      title: `${severe.length} 个重点页面相对上一次审计出现了会影响收录的回退`,
      targets: severe.map((r) => r.url),
      evidence: { what: `get_audit_pages：${auditRef(previous)} 对 ${auditRef(current)}`, when, values: values(severe) },
      repro: repro(severe.map((r) => r.url)),
      fix: '需要诊断：先确认是不是有意的下线或改版，不是就恢复',
      acceptance: severe.map((r) => `${r.url} 返回 200、可索引、在 sitemap 里`),
    });
  if (warning.length)
    out.push({
      direction: 'technical',
      kind: 'key-page-meta-changed',
      title: `${warning.length} 个重点页面的 title 或 description 和上一次审计不同`,
      targets: warning.map((r) => r.url),
      evidence: { what: `get_audit_pages：${auditRef(previous)} 对 ${auditRef(current)}`, when, values: values(warning) },
      repro: repro(warning.map((r) => r.url)),
      fix: '需要决定：确认改动是有意的；不是就改回',
      acceptance: warning.map((r) => `${r.url} 的 title 和 description 是有意写下的版本`),
    });
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [file, a, b] = process.argv.slice(2);
    if (!file || !a || !b) throw new Error('usage: seo-baseline.mjs <SEO.md> <上一次.json> <本次.json>');
    const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
    console.log(JSON.stringify(regressions(readSeoMd(file), read(a), read(b)), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
