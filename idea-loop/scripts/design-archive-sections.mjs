#!/usr/bin/env node
/**
 * The deterministic half of shooting a long page for the design archive (references/design-archive.md §4).
 *
 * A long entry state declares `sections` (design-archive.mjs). Writing it into the archive takes a
 * browser for the measuring and the full-page shot, and plain logic for everything else; this file is
 * the plain logic, split off the way `ui-measure.mjs` (browser) and `ui-compare.mjs` (pure) are:
 *
 *   measure    prints the code the headless Playwright MCP runs (`browser_run_code_unsafe`): scroll the
 *              page through once, back to the top, freeze motion, locate each section with the
 *              accessibility tree, box the top-level blocks and every clickable element, shoot the full page.
 *   attribute  measurement JSON → each section's range, which section each clickable element belongs to,
 *              the ones that fall in none ("落空"), the sections that could not be located. Exit 1 when either exists.
 *   slice      the full-page PNG + the ranges → one PNG per section, `<entry state id>@<section id>.png`.
 *              A tall section is one tall picture, never cut.
 *
 * The browser side has no unit test (like `ui-measure.mjs`); a real run covers it. `attribute` and `slice`
 * are pure functions over data and bytes. PNGs go through node's own zlib, the way `ui-png-compare.mjs`
 * reads them — no third-party dependency.
 *
 *   node design-archive-sections.mjs measure <repo-root> <entry-state> [--delta <spec-slug>] [--out <full.png>] [settings]
 *   node design-archive-sections.mjs measure <repo-root> --state <entry-state> --page <page>
 *        (--sections '<json list>' | --sections-file <file>) [--out <full.png>] [settings]
 *   node design-archive-sections.mjs attribute <measurement.json>
 *   node design-archive-sections.mjs slice <attribution.json> <full.png> --out <dir> [--state <entry-state>]
 *   settings: --viewport 1440x900 --theme light|dark --locale zh-CN --motion default|reduce
 *             (default: the frontmatter of docs/design/prod/index.md)
 *
 * Exit: 0 = done / nothing orphaned, 1 = `attribute` found orphans, unlocated or misordered sections,
 *       2 = usage error or unreadable input.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { loadArchive, pageOfState, sectionLocate, sectionsOfState } from './design-archive.mjs';
import { decodePng } from './ui-png-compare.mjs';

// ---------- the browser side: the code handed to Playwright ----------

/** Motion off, so a screenshot is a function of the DOM — the same text `ui-measure.mjs` injects. */
const FREEZE_CSS = `*, *::before, *::after {
  animation: none !important; transition: none !important;
  caret-color: transparent !important; scroll-behavior: auto !important;
}`;

/**
 * Runs inside the Playwright MCP's `browser_run_code_unsafe`, serialised with `toString()`, so it has
 * to stand alone: everything it needs arrives in `C` (the config) or is created inside. Returns the
 * measurement `attribute` reads. Positions are page coordinates in CSS pixels, taken at scroll 0.
 */
async function measurePage(page, C) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });

  // 1 scroll the page through once so lazy islands hydrate and scroll-triggered entrances finish
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await sleep(150);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(300);
  });
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch (e) {
    // a page that never goes quiet is shot as it stands
  }
  // 2 back to the top, motion frozen, fonts ready
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.addStyleTag({ content: C.freezeCss });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  // 3 mark what the accessibility tree calls banner / contentinfo, then box the top-level blocks
  for (const role of ['banner', 'contentinfo']) {
    await page.getByRole(role).evaluateAll((els, r) => els.forEach((el) => el.setAttribute('data-ds-lm', r)), role);
  }
  const base = await page.evaluate(() => {
    const px = (v) => Math.round(v * 100) / 100;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: px(r.top + window.scrollY), bottom: px(r.bottom + window.scrollY) };
    };
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const main = document.querySelector('main, [role="main"]');
    const kids = main
      ? [...main.children]
      : [...document.body.children].filter((el) => !el.hasAttribute('data-ds-lm') && !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName));
    const blocks = kids.filter(shown);
    blocks.forEach((el, i) => el.setAttribute('data-ds-block', String(i)));

    const implicitRole = (el) => {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName;
      if (tag === 'A') return 'link';
      if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
      if (tag === 'SELECT') return 'combobox';
      if (tag === 'TEXTAREA') return 'textbox';
      if (tag === 'INPUT') {
        const t = (el.getAttribute('type') || 'text').toLowerCase();
        return t === 'checkbox' || t === 'radio' ? t : /^(button|submit|reset|image)$/.test(t) ? 'button' : 'textbox';
      }
      return 'generic';
    };
    const nameOf = (el) => {
      const labelled = el.getAttribute('aria-labelledby');
      const parts = [
        el.getAttribute('aria-label'),
        labelled && labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '),
        el.labels && el.labels[0] && el.labels[0].textContent,
        el.innerText,
        el.getAttribute('alt') || el.querySelector('img[alt]')?.getAttribute('alt'),
        el.getAttribute('title'),
        el.getAttribute('placeholder'),
        el.value,
      ];
      return (parts.find((p) => p && p.trim()) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    };
    const clickSelector = [
      'a[href]', 'button', 'summary', 'input:not([type="hidden"])', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const clickables = [...document.querySelectorAll(clickSelector)]
      .filter(shown)
      .map((el) => ({ role: implicitRole(el), name: nameOf(el), ...box(el), landmark: el.closest('[data-ds-lm]')?.getAttribute('data-ds-lm') || null }));

    const info = document.querySelector('[data-ds-lm="contentinfo"]');
    return {
      pageSize: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      blocks: blocks.map(box),
      contentinfo: info ? box(info) : null,
      clickables,
      env: {
        language: navigator.language,
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        dpr: window.devicePixelRatio,
      },
    };
  });

  // 4 locate each declared section through the accessibility tree
  const sections = [];
  for (const sec of C.sections) {
    const entry = { id: sec.id, locate: sec.locate };
    if (sec.locate.position !== undefined) {
      const b = base.blocks[sec.locate.position - 1];
      sections.push(b
        ? { ...entry, found: true, top: b.top, bottom: b.bottom, block: sec.locate.position - 1 }
        : { ...entry, found: false, reason: `第 ${sec.locate.position} 个顶层分块不存在（页面共 ${base.blocks.length} 个）` });
      continue;
    }
    const where = sec.locate.role === 'heading' ? page.getByRole('heading', { name: sec.locate.name, exact: true }) : page.getByRole(sec.locate.role);
    const n = await where.count();
    if (n !== 1) {
      sections.push({ ...entry, found: false, reason: n === 0 ? '页面上没有这个定位对应的元素（标题改名了？）' : `这个定位匹配到 ${n} 个元素，不唯一` });
      continue;
    }
    const r = await where.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const px = (v) => Math.round(v * 100) / 100;
      const block = el.closest('[data-ds-block]');
      return { top: px(rect.top + window.scrollY), bottom: px(rect.bottom + window.scrollY), block: block ? Number(block.getAttribute('data-ds-block')) : -1 };
    });
    sections.push({ ...entry, found: true, ...r });
  }

  // 5 clean the marks off, shoot the whole page
  await page.evaluate(() => document.querySelectorAll('[data-ds-block],[data-ds-lm]').forEach((el) => {
    el.removeAttribute('data-ds-block');
    el.removeAttribute('data-ds-lm');
  }));
  let image = null;
  if (C.out) {
    await page.screenshot({ path: C.out, fullPage: true, animations: 'disabled' });
    image = { path: C.out };
  }
  return {
    state: C.state, page: C.page, viewport: C.viewport, theme: C.theme, motion: C.motion,
    pageSize: base.pageSize, blocks: base.blocks, contentinfo: base.contentinfo,
    sections, clickables: base.clickables, env: base.env, image,
  };
}

/**
 * The text of the function `browser_run_code_unsafe` takes (`async (page) => …`).
 * @param {{ state?: string, page?: string, sections: {id, locate}[], viewport: {width, height}, theme: string,
 *   motion?: string, out?: string }} config
 */
export function buildMeasureCode(config) {
  const C = {
    state: config.state ?? null,
    page: config.page ?? null,
    sections: config.sections.map((s) => ({ id: s.id, locate: s.locate })),
    viewport: config.viewport,
    theme: config.theme,
    motion: config.motion ?? 'default',
    out: config.out ?? null,
    freezeCss: FREEZE_CSS,
  };
  return `async (page) => (${measurePage.toString()})(page, ${JSON.stringify(C)})`;
}

// ---------- ranges and ownership ----------

const roundPx = (v) => Math.round(v);

/**
 * Measurement → ranges, the section each clickable element belongs to, and what does not fit.
 *
 * Ranges (references/design-archive.md §4): a section found by heading starts at the top of the
 * top-level block that holds the heading — at the heading itself when that block holds another declared
 * heading — and runs to where the next declared section starts (the last one: the top of the page's
 * first contentinfo, declared or not, else the page bottom). A landmark or `position` section is that
 * element's own box. Ownership: a clickable inside a banner / contentinfo belongs to the section that
 * declares that landmark; any other one belongs to the section whose range holds its vertical centre.
 *
 * @returns {{ ok: boolean, ranges: object[], clickables: object[], orphans: object[], notFound: object[],
 *   outOfOrder: object[], coverage: { gaps: object[], overlaps: object[] }, pageHeight: number }}
 */
export function attribute(m) {
  const ref = (id) => (m.page ? `${m.page}#${id}` : id);
  const blocks = m.blocks ?? [];
  const pageHeight = m.pageSize?.height ?? 0;
  const secs = m.sections ?? [];
  const found = secs.filter((s) => s.found);
  const notFound = secs.filter((s) => !s.found).map((s) => ({ id: s.id, ref: ref(s.id), locate: s.locate, reason: s.reason ?? '没有定位到' }));

  const kindOf = (s) => (s.locate?.position !== undefined ? 'position' : s.locate?.role === 'heading' ? 'heading' : 'landmark');
  const headingsInBlock = (block) => found.filter((x) => kindOf(x) === 'heading' && x.block === block).length;
  const startOf = (s) => (kindOf(s) === 'heading' && s.block >= 0 && headingsInBlock(s.block) === 1 && blocks[s.block] ? blocks[s.block].top : s.top);

  const ranges = found.map((s, i) => {
    const kind = kindOf(s);
    const start = startOf(s);
    const next = found[i + 1];
    const end = kind === 'heading' ? (next ? startOf(next) : m.contentinfo?.top ?? pageHeight) : s.bottom;
    return { id: s.id, ref: ref(s.id), by: kind, role: s.locate?.role ?? null, start: roundPx(start), end: roundPx(end), height: roundPx(end) - roundPx(start) };
  });

  const outOfOrder = [];
  ranges.forEach((r, i) => {
    if (r.end < r.start) outOfOrder.push({ id: r.id, ref: r.ref, reason: `范围倒过来了（${r.start} → ${r.end}）：它在页面上的位置比后一段还靠下` });
    else if (i > 0 && r.start < ranges[i - 1].start) outOfOrder.push({ id: r.id, ref: r.ref, reason: `起点 ${r.start} 比前一段（${ranges[i - 1].id}）的起点 ${ranges[i - 1].start} 还靠上：sections 的顺序要和页面一致` });
  });

  const gaps = [];
  const overlaps = [];
  const sorted = [...ranges].filter((r) => r.height > 0).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const r of sorted) {
    if (r.start > cursor) gaps.push({ from: cursor, to: r.start });
    else if (r.start < cursor) overlaps.push({ at: r.id, from: r.start, to: cursor });
    cursor = Math.max(cursor, r.end);
  }
  if (pageHeight > cursor) gaps.push({ from: cursor, to: pageHeight });

  const landmarkOwner = (role) => ranges.find((r) => r.by === 'landmark' && r.role === role);
  const clickables = [];
  const orphans = [];
  for (const c of m.clickables ?? []) {
    const y = roundPx((c.top + c.bottom) / 2);
    let owner = null;
    let why = null;
    if (c.landmark) {
      owner = landmarkOwner(c.landmark);
      if (!owner) why = `在${c.landmark === 'banner' ? '顶栏（banner）' : '页脚（contentinfo）'}里，而 sections 里没有声明 ${c.landmark} 段`;
    } else {
      owner = ranges.find((r) => y >= r.start && y < r.end);
      if (!owner) {
        const first = ranges[0];
        const last = ranges[ranges.length - 1];
        why = !ranges.length ? '没有任何定位到的段'
          : y < first.start ? `在第一段（${first.id}）之前`
          : y >= last.end ? `在最后一段（${last.id}）之后`
          : '落在相邻两段之间的空隙里';
      }
    }
    const item = { role: c.role, name: c.name, y, section: owner ? owner.id : null, ref: owner ? owner.ref : null };
    clickables.push(item);
    if (!owner) orphans.push({ ...item, landmark: c.landmark ?? null, reason: why });
  }

  return {
    ok: orphans.length === 0 && notFound.length === 0 && outOfOrder.length === 0,
    state: m.state ?? null,
    page: m.page ?? null,
    pageHeight,
    pageWidth: m.pageSize?.width ?? null,
    ranges,
    clickables,
    orphans,
    notFound,
    outOfOrder,
    coverage: { gaps, overlaps },
  };
}

// ---------- PNG out ----------

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};

/** RGBA pixels → PNG bytes (8-bit RGBA, each row Sub-filtered), with node's zlib. */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dst = y * (stride + 1);
    const src = y * stride;
    raw[dst] = 1;
    for (let i = 0; i < stride; i += 1) raw[dst + 1 + i] = (data[src + i] - (i >= 4 ? data[src + i - 4] : 0)) & 0xff;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The full-page picture cut along the ranges: one picture per section, full width, as tall as the range.
 * `scale` is image pixels per CSS pixel (default: the picture's width over the measured page width, 1 at DPR 1).
 * A range with no height, or lying wholly outside the picture, is skipped and named in `skipped`.
 * @returns {{ id, ref, file, y0, y1, width, height, png: Buffer }[] & { skipped?: object[] }}
 */
export function sliceImage(pngBytes, attribution, { state, scale } = {}) {
  const img = decodePng(pngBytes, '整页长图');
  const k = scale ?? (attribution.pageWidth ? img.width / attribution.pageWidth : 1);
  const stateId = state ?? attribution.state;
  if (!stateId) throw new Error('不知道入口状态 id：测量结果里没有 state，也没给 --state');
  const out = [];
  const skipped = [];
  for (const r of attribution.ranges) {
    const y0 = Math.max(0, Math.round(r.start * k));
    const y1 = Math.min(img.height, Math.round(r.end * k));
    if (y1 <= y0) {
      skipped.push({ id: r.id, reason: `范围 ${r.start}–${r.end} 没有高度，或在图（高 ${img.height}）之外` });
      continue;
    }
    const rows = img.data.subarray(y0 * img.width * 4, y1 * img.width * 4);
    out.push({
      id: r.id,
      ref: r.ref,
      file: `${stateId}@${r.id}.png`,
      y0,
      y1,
      width: img.width,
      height: y1 - y0,
      png: encodePng({ width: img.width, height: y1 - y0, data: rows }),
    });
  }
  out.skipped = skipped;
  return out;
}

// ---------- the command line ----------

/** The subcommands and the options each one takes — the docs' command lines are checked against this. */
export const COMMAND_FLAGS = {
  measure: ['--delta', '--out', '--state', '--page', '--sections', '--sections-file', '--viewport', '--theme', '--locale', '--motion'],
  attribute: [],
  slice: ['--out', '--state'],
};

const USAGE = `用法：
  node design-archive-sections.mjs measure <仓库根> <入口状态 id> [--delta <spec-slug>] [--out <整页长图.png>] [设置]
  node design-archive-sections.mjs measure <仓库根> --state <入口状态 id> --page <页面> (--sections '<JSON 列表>' | --sections-file <文件>) [--out <整页长图.png>] [设置]
  node design-archive-sections.mjs attribute <测量结果.json>
  node design-archive-sections.mjs slice <归属结果.json> <整页长图.png> --out <目录> [--state <入口状态 id>]
设置：--viewport 1440x900 --theme light|dark --locale zh-CN --motion default|reduce（默认取 docs/design/prod/index.md 的 frontmatter）
measure 打印交给 Playwright MCP「执行一段代码」的代码；attribute 有落空、定位失败或顺序不对时退出码 1。`;

class UsageError extends Error {}

function parseArgs(command, argv) {
  const flags = {};
  const positional = [];
  const valued = new Set(COMMAND_FLAGS[command] ?? []);
  for (let i = 0; i < argv.length; i += 1) {
    if (valued.has(argv[i])) {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new UsageError(`${argv[i]} 后面要跟一个值`);
      flags[argv[i].slice(2)] = argv[(i += 1)];
    } else if (argv[i].startsWith('--')) throw new UsageError(`不认识的选项 ${argv[i]}`);
    else positional.push(argv[i]);
  }
  return { flags, positional };
}

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new UsageError(`${what} ${file} 读不出来：${e.code === 'ENOENT' ? '文件不存在' : e.message}`);
  }
}

/** Settings from flags over the `prod/index.md` frontmatter. A missing one is an error: no silent default. */
function settingsOf(archive, flags) {
  const idx = archive.index ?? {};
  const viewport = flags.viewport ?? idx.viewport;
  const m = String(viewport ?? '').match(/^(\d+)x(\d+)$/);
  if (!m) throw new UsageError('没有视口：prod/index.md 的 frontmatter 没写 viewport，也没给 --viewport 1440x900');
  const theme = flags.theme ?? idx.theme;
  if (theme !== 'light' && theme !== 'dark') throw new UsageError('没有主题：prod/index.md 的 frontmatter 没写 theme（light 或 dark），也没给 --theme');
  const motion = flags.motion ?? idx.motion ?? 'default';
  if (motion !== 'default' && motion !== 'reduce') throw new UsageError(`motion 只能是 default 或 reduce（现在是 ${motion}）`);
  return { viewport: { width: Number(m[1]), height: Number(m[2]) }, theme, motion, locale: flags.locale ?? idx.locale ?? null };
}

function measureCommand(positional, flags) {
  if (!positional.length) throw new UsageError('缺少仓库根');
  const root = resolve(positional[0]);
  if (!existsSync(join(root, 'docs'))) throw new UsageError(`${root} 下没有 docs/：这不是目标仓库的根`);
  let archive;
  try {
    archive = loadArchive(root, { delta: flags.delta ?? null });
  } catch (e) {
    throw new UsageError(e.message);
  }
  const stateId = positional[1] ?? flags.state;
  if (!stateId) throw new UsageError('缺少入口状态 id');
  let sections;
  let page = flags.page ?? null;
  if (flags.sections || flags['sections-file']) {
    const raw = flags.sections ? safeParse(flags.sections) : readJson(flags['sections-file'], '分段列表');
    if (!Array.isArray(raw) || !raw.length) throw new UsageError('分段列表要是一个非空的 JSON 数组：[{ "id": "hero", "locate": { … } }, …]');
    sections = raw;
  } else {
    const state = archive.objects.get(stateId);
    if (!state || state.kind !== 'state') throw new UsageError(`档案里没有状态「${stateId}」；档案里还没有这个状态时（初扫）用 --sections 给分段列表`);
    if (!state.fm.entry) throw new UsageError(`${stateId} 不是入口状态：只有入口状态声明 sections`);
    sections = sectionsOfState(state);
    if (!sections.length) throw new UsageError(`${stateId} 没有 sections`);
    page = page ?? pageOfState(state);
  }
  sections = sections.map((s, i) => {
    const by = sectionLocate(s?.locate);
    if (typeof s?.id !== 'string' || !by) throw new UsageError(`第 ${i + 1} 段的 id 或 locate 不对（locate 只能是 heading + name、banner / contentinfo、position 三种之一）`);
    return { id: s.id, locate: s.locate };
  });
  const settings = settingsOf(archive, flags);
  const out = flags.out ? resolve(flags.out) : join(tmpdir(), `${stateId}.full.png`);
  const code = buildMeasureCode({ state: stateId, page, sections, ...settings, out });
  console.log(code);
  console.error(`measure: ${sections.length} 段，视口 ${settings.viewport.width}×${settings.viewport.height}，${settings.theme}，motion ${settings.motion}${settings.locale ? `，语言 ${settings.locale}（浏览器要先按这个语言打开页面）` : ''}；整页长图写到 ${out}`);
  return 0;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UsageError(`--sections 不是 JSON：${e.message}`);
  }
}

function attributeCommand(positional) {
  if (positional.length !== 1) throw new UsageError('attribute 要一个测量结果文件');
  const result = attribute(readJson(positional[0], '测量结果'));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(`attribute: 落空 ${result.orphans.length} 个，定位失败 ${result.notFound.length} 段，顺序不对 ${result.outOfOrder.length} 段——补分段或改定位后重测，清零再写档案`);
    return 1;
  }
  return 0;
}

function sliceCommand(positional, flags) {
  if (positional.length !== 2) throw new UsageError('slice 要一个归属结果文件和一张整页长图');
  if (!flags.out) throw new UsageError('slice 要 --out <目录>');
  const attribution = readJson(positional[0], '归属结果');
  if (!Array.isArray(attribution.ranges)) throw new UsageError('归属结果里没有 ranges：先跑 attribute，把它的输出存成文件');
  let bytes;
  try {
    bytes = readFileSync(positional[1]);
  } catch (e) {
    throw new UsageError(`整页长图 ${positional[1]} 读不出来：${e.code === 'ENOENT' ? '文件不存在' : e.message}`);
  }
  let pieces;
  try {
    pieces = sliceImage(bytes, attribution, { state: flags.state });
  } catch (e) {
    throw new UsageError(e.message);
  }
  const dir = resolve(flags.out);
  mkdirSync(dir, { recursive: true });
  for (const p of pieces) writeFileSync(join(dir, p.file), p.png);
  console.log(JSON.stringify({ out: dir, slices: pieces.map(({ png: _png, ...rest }) => rest), skipped: pieces.skipped }, null, 2));
  return 0;
}

function main(argv) {
  const [command, ...rest] = argv.slice(2);
  try {
    if (!Object.hasOwn(COMMAND_FLAGS, command ?? '')) throw new UsageError(command ? `没有「${command}」这个子命令` : '缺少子命令');
    const { flags, positional } = parseArgs(command, rest);
    if (command === 'measure') return measureCommand(positional, flags);
    if (command === 'attribute') return attributeCommand(positional);
    if (command === 'slice') return sliceCommand(positional, flags);
    return 2;
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    console.error(USAGE);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv));
