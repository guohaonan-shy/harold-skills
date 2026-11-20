#!/usr/bin/env node
/**
 * Reads a project's SEO.md — the one config file every seo skill, agent and script reads. Its format
 * is defined in skills/seo/seo-setup/references/seo-md.md: ten `## ` sections, one `- key：value`
 * item per line (内容原则 is the exception: one `- <principle>（出处：<source>）` per line), domains / URLs /
 * paths / ids in backticks. Missing sections read as empty, unknown
 * lines are ignored, so a human can write notes in between. A human who answered "none" writes `无`
 * (`- 品牌词：无`, or one `- 无` line under 竞品): it reads as empty and as `confirmed`, so callers can
 * tell "confirmed empty" from "never written".
 *
 * Usage: node seo-md.mjs <SEO.md>   → JSON of the ten sections
 * Exit: 0 = parsed, 1 = unreadable file (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The directions a finding can be filed under (`type:seo/<direction>`). */
export const DIRECTIONS = ['technical', 'pages', 'keywords', 'backlinks', 'geo'];
/** The directions one seo-scan run can take: the five above, plus `results` (the effect report). Its findings are filed under the direction of the change they are about, so it is not a finding direction. */
export const SCAN_DIRECTIONS = [...DIRECTIONS, 'results'];
export const PAGE_TYPES = ['对比与研究', '数据研究', '故事', '教程'];

const SECTIONS = ['站点', 'OpenSEO', '竞品', '重点页面', '构建与检查', '写作', '配图', '品牌', '内容原则', '分析'];

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
/** A key's value: the first backticked span, else the text as written; nothing written or `无` reads as null. */
const valueOf = (raw) => {
  const v = String(raw ?? '').trim();
  return v === '' || v === NONE ? null : (firstTick(v) ?? v);
};
/** Was the key written — a value, or an explicit `无`? A key never written, or written with nothing after it, is not. */
const written = (kv, key) => String(kv[key] ?? '').trim() !== '';

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

/** The weekly allocation's scan names: every direction a scan can take, `results` included. */
export const ALLOCATION_SCAN = SCAN_DIRECTIONS;
const number = (s) => Number(String(s).replace(/,/g, ''));

/** `排名追踪 300；扫描 technical 200，pages 300；起草与验证 400` → { tracking, scan: { <direction>: n }, drafting }. */
function parseWeekly(value) {
  const weekly = { tracking: 0, scan: {}, drafting: 0 };
  for (const part of String(value).split(/[；;]/).map((p) => p.trim()).filter(Boolean)) {
    const label = part.match(/^(排名追踪|扫描|起草与验证)\s*(.*)$/);
    if (!label) throw new Error(`SEO.md「OpenSEO」的每周分配里有不认识的一份「${part}」（只认 排名追踪 / 扫描 / 起草与验证）`);
    const [, name, rest] = label;
    if (name === '扫描') {
      for (const item of rest.split(/[，,]/).map((i) => i.trim()).filter(Boolean)) {
        const m = item.match(/^([a-z]+)\s+(\d[\d,]*)$/);
        if (!m) continue;
        if (!ALLOCATION_SCAN.includes(m[1])) throw new Error(`SEO.md「OpenSEO」的每周分配里扫描有不认识的方向「${m[1]}」（只认 ${ALLOCATION_SCAN.join(' / ')}）`);
        weekly.scan[m[1]] = number(m[2]);
      }
    } else {
      const n = rest.match(/^(\d[\d,]*)$/);
      if (n) weekly[name === '排名追踪' ? 'tracking' : 'drafting'] = number(n[1]);
    }
  }
  return weekly;
}

function parseOpenSeo(lines) {
  const kv = pairs(lines);
  if ('单次额度' in kv) {
    throw new Error('SEO.md「OpenSEO」写的是旧的「单次额度」：额度现在按周算，改成「套餐额度」和「每周分配」两项。跑 `/idea-loop:seo-setup` 迁移');
  }
  const floor = Number(String(kv['余额下限'] ?? '').match(/\d+/)?.[0] ?? NaN);
  const plan = String(kv['套餐额度'] ?? '');
  const monthly = plan.match(/每月\s*(\d[\d,]*)(?=\s*(?:[，,；;]|$))/);
  const reset = plan.match(/每月\s*(\d+)\s*日\s*重置/);
  if (reset && !(Number(reset[1]) >= 1 && Number(reset[1]) <= 31)) throw new Error(`SEO.md「OpenSEO」的套餐额度里，重置日「${reset[1]}」不是 1 到 31 之间的日子`);
  return {
    projectId: firstTick(kv['项目'] ?? ''),
    floor: Number.isFinite(floor) ? floor : null,
    monthly: monthly ? number(monthly[1]) : null,
    resetDay: reset ? Number(reset[1]) : null,
    weekly: kv['每周分配'] === undefined ? null : parseWeekly(kv['每周分配']),
  };
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

/** Minutes the post-deploy check waits for the live site to match the build when SEO.md does not say. */
export const DEFAULT_LIVE_WAIT = 30;

function parseBuild(lines) {
  const kv = pairs(lines);
  const wait = Number(String(kv['上线等待'] ?? '').match(/\d+/)?.[0] ?? NaN);
  return {
    distDir: firstTick(kv['产物目录'] ?? ''),
    checkArgs: ticks(kv['检查参数'] ?? '').join(' ').split(/\s+/).filter(Boolean),
    // globs of the files an SEO change may touch and still be "content only" (seo-content-scope.mjs)
    contentPaths: ticks(kv['内容路径'] ?? ''),
    // minutes the post-deploy check waits for the live site to match the build (seo-live-check.mjs)
    liveWait: wait > 0 ? wait : DEFAULT_LIVE_WAIT,
  };
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
  return {
    voice: firstTick(kv['文风'] ?? ''),
    failures: firstTick(kv['失败案例'] ?? ''),
    typeField: firstTick(kv['类型字段'] ?? ''),
    typeMap,
    // the writing loop's checks: a JSON file overriding the lint defaults, the project's own lint command, a second model's review command
    lintConfig: valueOf(kv['lint 配置']),
    extraLint: valueOf(kv['补充 lint']),
    secondJudge: valueOf(kv['第二评委']),
  };
}

/**
 * `配图`: where images go and how they are made — the image directory (inside 内容路径, which seo-setup checks when it
 * writes it), the generating tool (an MCP tool name or a command), the frontmatter fields holding the cover and the OG
 * image, and which DESIGN.md to read when the repo has several. No section, no key or `无` reads as null.
 */
function parseImages(lines) {
  const kv = pairs(lines);
  return {
    dir: valueOf(kv['图片目录']),
    tool: valueOf(kv['生图工具']),
    coverField: valueOf(kv['封面字段']),
    ogField: valueOf(kv['OG 字段']),
    designMd: valueOf(kv['DESIGN.md 路径']),
  };
}

/** `` - 品牌词：`a`；`b` `` → { terms: ['a', 'b'] }; no section, no key, no backticks or `无` → []. */
function parseBrand(lines) {
  return { terms: ticks(pairs(lines)['品牌词'] ?? '') };
}

/**
 * `- <principle>（出处：<source>）` → { text, source }, one per line, in order. A line without the 出处 part keeps
 * its whole text and an empty source; a lone `无` line is no principle; no section reads as [].
 */
function parsePrinciples(lines) {
  return items(lines)
    .filter((it) => it !== NONE)
    .map((it) => {
      const m = it.match(/^(.*?)\s*[（(]出处[：:]\s*(.+?)\s*[）)]$/);
      return m ? { text: m[1].trim(), source: m[2].trim() } : { text: it, source: '' };
    });
}

/**
 * `分析` (optional): the analytics tool the effect report may read — `- 工具：<name>`, `- 项目：<id>`, `- dashboard：<link>`.
 * No section, no key, or `无` reads as null; backticks around an id or link are dropped.
 */
function parseAnalytics(lines) {
  const kv = pairs(lines);
  return { tool: valueOf(kv['工具']), projectId: valueOf(kv['项目']), dashboard: valueOf(kv['dashboard']) };
}

/** Per item: written (a value, or an explicit `无`) vs never written. Empty-by-choice reads as confirmed. */
function parseConfirmed(s, competitors, brand) {
  const none = items(s['竞品']).some((it) => it === NONE);
  const writing = pairs(s['写作']);
  const images = pairs(s['配图']);
  return {
    competitors: competitors.length > 0 || none,
    brandTerms: brand.terms.length > 0 || (pairs(s['品牌'])['品牌词'] ?? '').trim() === NONE,
    lintConfig: written(writing, 'lint 配置'),
    extraLint: written(writing, '补充 lint'),
    secondJudge: written(writing, '第二评委'),
    imageDir: written(images, '图片目录'),
    imageTool: written(images, '生图工具'),
    coverField: written(images, '封面字段'),
    ogField: written(images, 'OG 字段'),
    designMd: written(images, 'DESIGN.md 路径'),
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
    images: parseImages(s['配图']),
    brand,
    principles: parsePrinciples(s['内容原则']),
    analytics: parseAnalytics(s['分析']),
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
