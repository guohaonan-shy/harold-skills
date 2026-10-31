#!/usr/bin/env node
/**
 * Which project facts the directions of one seo-scan run need but nobody has written down yet. The
 * list of what each direction needs is the 「每个方向要用的信息」 table in
 * skills/seo/seo-setup/references/seo-md.md; this is that table as code, so a scan never judges "is
 * anything missing" by reading rules.
 *
 * Missing means: an SEO.md item that was never written (`无` counts as written), or an empty field in
 * the project context (a field the human answered `无` is not empty: asked and not needed). Without a readable project context only the SEO.md items are checked, so an
 * unreachable OpenSEO never blocks a scan.
 *
 * The project context is get_project_context's raw return. A typed section (business_overview,
 * current_goal, positioning) counts as present when it holds non-blank text, found as a string or as
 * `{ content }`, at the top level or under `structuredContent` / `sections`, or as a `{ section |
 * key | name, content }` row of a `sections` array. It counts as missing when it is blank, absent, or
 * listed in `missingSections`.
 *
 * Usage: node seo-gaps.mjs <SEO.md> <context.json | -> <direction>...
 *   → { "directions": [...], "contextChecked": bool,
 *       "gaps": [{ "item", "label", "store", "directions": [...] }] }
 * Exit: 0 = checked (gaps may be empty), 1 = bad arguments or unreadable SEO.md (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DIRECTIONS, readSeoMd } from './seo-md.mjs';

const SEO_MD = 'SEO.md';
const CONTEXT = 'OpenSEO 项目上下文';

/** The 「每个方向要用的信息」 table, one row per item, in the order gaps are reported. */
export const NEEDS = [
  { item: 'competitors', label: '竞品', store: SEO_MD, directions: ['pages', 'backlinks'] },
  { item: 'brand_terms', label: '品牌词', store: SEO_MD, directions: ['pages'] },
  { item: 'business_overview', label: '业务概述', store: CONTEXT, directions: ['technical', 'keywords'] },
  { item: 'current_goal', label: '当前目标', store: CONTEXT, directions: ['keywords'] },
  { item: 'positioning', label: '定位', store: CONTEXT, directions: ['backlinks'] },
];

const text = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.content === 'string' ? v.content : '');

function contextSection(context, key) {
  const places = [context, context.structuredContent, context.sections, context.structuredContent?.sections];
  for (const place of places) {
    if (!place || typeof place !== 'object') continue;
    if (Array.isArray(place)) {
      const row = place.find((r) => r && [r.section, r.key, r.name].includes(key));
      if (row && text(row).trim()) return text(row);
    } else if (text(place[key]).trim()) return text(place[key]);
  }
  return '';
}

const listedMissing = (context, key) =>
  [context.missingSections, context.structuredContent?.missingSections].some((l) => Array.isArray(l) && l.includes(key));

export function gaps(seo, context, directions) {
  for (const d of directions) if (!DIRECTIONS.includes(d)) throw new Error(`不认识的方向「${d}」（只认 ${DIRECTIONS.join(' / ')}）`);
  const readable = context !== null && typeof context === 'object' && !Array.isArray(context);
  const written = { competitors: seo.confirmed.competitors, brand_terms: seo.confirmed.brandTerms };
  const out = [];
  for (const need of NEEDS) {
    const wanted = need.directions.filter((d) => directions.includes(d));
    if (!wanted.length) continue;
    const fromSeoMd = need.store === SEO_MD;
    if (!fromSeoMd && !readable) continue;
    const missing = fromSeoMd ? !written[need.item] : listedMissing(context, need.item) || !contextSection(context, need.item).trim();
    if (missing) out.push({ item: need.item, label: need.label, store: need.store, directions: wanted });
  }
  return { directions, contextChecked: readable, gaps: out };
}

function readContext(file) {
  if (!file || file === '-') return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [seoFile, contextFile, ...directions] = process.argv.slice(2);
    if (!seoFile || contextFile === undefined) throw new Error('usage: seo-gaps.mjs <SEO.md> <context.json | -> <方向>...');
    console.log(JSON.stringify(gaps(readSeoMd(seoFile), readContext(contextFile), directions), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
