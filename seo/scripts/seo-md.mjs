#!/usr/bin/env node
/**
 * Reads a project's SEO.md — the one config file every seo skill, agent and script reads. Its format
 * is defined in skills/seo/seo-setup/references/seo-md.md: seven `## ` sections, one `- key：value`
 * item per line, domains / URLs / paths / ids in backticks. Missing sections read as empty, unknown
 * lines are ignored, so a human can write notes in between. A human who answered "none" writes `无`
 * (`- 品牌词：无`, or one `- 无` line under 竞品): it reads as empty and as `confirmed`, so callers can
 * tell "confirmed empty" from "never written".
 *
 * Usage: node seo-md.mjs <SEO.md>   → JSON of the seven sections
 * Exit: 0 = parsed, 1 = unreadable file (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DIRECTIONS = ['technical', 'pages', 'keywords', 'backlinks', 'geo'];
export const PAGE_TYPES = ['对比与研究', '数据研究', '故事', '教程'];

const SECTIONS = ['站点', 'OpenSEO', '竞品', '重点页面', '构建与检查', '写作', '品牌'];

/** The section bodies by heading: lines between `## <heading>` and the next `#`/`##` heading. */
function sections(md) {
  const out = Object.fromEntries(SECTIONS.map((s) => [s, []]));
  let current = null;
  for (const line of String(md).split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = SECTIONS.includes(h[1]) ? h[1] : null;
      continue;
    }
    if (/^#\s/.test(line)) current = null;
    else if (current) out[current].push(line);
  }
  return out;
}

/** `- key：value` items of a section, in order. */
function items(lines) {
  return lines
    .map((l) => l.match(/^\s*-\s+(.+?)\s*$/))
    .filter(Boolean)
    .map((m) => m[1]);
}

/** Splits an item at its first ： or : that sits outside backticks. */
function keyValue(item) {
  let tick = false;
  for (let i = 0; i < item.length; i++) {
    const c = item[i];
    if (c === '`') tick = !tick;
    else if (!tick && (c === '：' || c === ':')) return [item.slice(0, i).trim(), item.slice(i + 1).trim()];
  }
  return [item.trim(), ''];
}

const NONE = '无';
const ticks = (s) => [...String(s).matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const firstTick = (s) => ticks(s)[0] ?? null;
const pairs = (lines) => Object.fromEntries(items(lines).map(keyValue));

function parseSite(lines) {
  const kv = pairs(lines);
  const languages = String(kv['语言'] ?? '')
    .split(/[；;]/)
    .map((part) => ticks(part))
    .filter((t) => t.length >= 2)
    .map(([code, prefix]) => ({ code, prefix }));
  return {
    domain: firstTick(kv['域名'] ?? ''),
    languages,
    searchConsole: firstTick(kv['Search Console'] ?? ''),
    bing: firstTick(kv['Bing'] ?? ''),
  };
}

function parseOpenSeo(lines) {
  const kv = pairs(lines);
  const floor = Number(String(kv['余额下限'] ?? '').match(/\d+/)?.[0] ?? NaN);
  const budgets = {};
  for (const part of String(kv['单次额度'] ?? '').split(/[，,；;]/)) {
    const m = part.trim().match(/^([a-z]+)\s+(\d+)$/);
    if (!m) continue;
    if (!DIRECTIONS.includes(m[1])) throw new Error(`SEO.md「OpenSEO」的单次额度里有不认识的方向「${m[1]}」（只认 ${DIRECTIONS.join(' / ')}）`);
    budgets[m[1]] = Number(m[2]);
  }
  return { projectId: firstTick(kv['项目'] ?? ''), floor: Number.isFinite(floor) ? floor : null, budgets };
}

/** `` - `domain`：Name，one-line positioning `` → { domain, name, notes }. */
function parseCompetitors(lines) {
  return items(lines)
    .map((it) => {
      const [key, value] = keyValue(it);
      const domain = firstTick(key);
      if (!domain) return null;
      const [name, ...rest] = value.split(/[，,]/);
      return { domain, name: name.trim(), notes: rest.join('，').trim() };
    })
    .filter(Boolean);
}

/** `` - `url`：头词 `keyword` `` → { url, keyword }. */
function parseKeyPages(lines) {
  return items(lines)
    .map((it) => {
      const [key, value] = keyValue(it);
      const url = firstTick(key);
      return url ? { url, keyword: firstTick(value) } : null;
    })
    .filter(Boolean);
}

function parseBuild(lines) {
  const kv = pairs(lines);
  return { distDir: firstTick(kv['产物目录'] ?? ''), checkArgs: ticks(kv['检查参数'] ?? '').join(' ').split(/\s+/).filter(Boolean) };
}

function parseWriting(lines) {
  const kv = pairs(lines);
  const typeMap = {};
  for (const part of String(kv['类型映射'] ?? '').split(/[；;]/)) {
    const m = part.match(/`([^`]+)`\s*(?:→|->)\s*(\S+)/);
    if (!m) continue;
    if (!PAGE_TYPES.includes(m[2])) throw new Error(`SEO.md「写作」的类型映射里「${m[2]}」不是通用类型（只认 ${PAGE_TYPES.join(' / ')}）`);
    typeMap[m[1]] = m[2];
  }
  return { voice: firstTick(kv['文风'] ?? ''), failures: firstTick(kv['失败案例'] ?? ''), typeField: firstTick(kv['类型字段'] ?? ''), typeMap };
}

/** `` - 品牌词：`a`；`b` `` → { terms: ['a', 'b'] }; no section, no key, no backticks or `无` → []. */
function parseBrand(lines) {
  return { terms: ticks(pairs(lines)['品牌词'] ?? '') };
}

/** Per item: written (a value, or an explicit `无`) vs never written. Empty-by-choice reads as confirmed. */
function parseConfirmed(s, competitors, brand) {
  const none = items(s['竞品']).some((it) => it === NONE);
  return {
    competitors: competitors.length > 0 || none,
    brandTerms: brand.terms.length > 0 || (pairs(s['品牌'])['品牌词'] ?? '').trim() === NONE,
  };
}

export function parseSeoMd(md) {
  const s = sections(md);
  const competitors = parseCompetitors(s['竞品']);
  const brand = parseBrand(s['品牌']);
  return {
    site: parseSite(s['站点']),
    openseo: parseOpenSeo(s['OpenSEO']),
    competitors,
    keyPages: parseKeyPages(s['重点页面']),
    build: parseBuild(s['构建与检查']),
    writing: parseWriting(s['写作']),
    brand,
    confirmed: parseConfirmed(s, competitors, brand),
  };
}

export const readSeoMd = (file) => parseSeoMd(readFileSync(file, 'utf8'));

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('usage: seo-md.mjs <SEO.md>');
    console.log(JSON.stringify(readSeoMd(file), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
