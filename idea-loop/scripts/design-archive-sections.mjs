#!/usr/bin/env node
/**
 * The deterministic half of shooting a long page for the design archive (references/design-archive.md §4).
 *
 * A long entry state declares `sections` (design-archive.mjs). Writing it into the archive takes a
 * browser for the measuring and the full-page shot, and plain logic for everything else; this file is
 * the plain logic, split off the way `ui-measure.mjs` (browser) and `ui-compare.mjs` (pure) are:
 *
 *   measure    prints the code the headless Playwright MCP runs (`browser_run_code_unsafe`): scroll the
 *              page through once, back to the top, freeze motion (in the page and in each same-origin embedded page), locate each section with the
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

/** How long after the picture the second look is taken: longer than the pause of a typical loop, short enough not to drag the run. */
const SETTLE_MS = 1000;

/**
 * Which elements are the page's top-level blocks. Pure over an adapter, so it is unit-tested over a fake
 * tree and also serialised (`toString()`) into the page, where the adapter is the real DOM. It has to
 * stand alone: no reference to anything outside it.
 *
 *   - the start is the children of `<main>`, or of `<body>` when there is no main; the ones the adapter
 *     says to skip (landmarks, script, style) are left out
 *   - an element that takes no space (`display: contents`, e.g. a component framework's island) is
 *     replaced by its children, however deep
 *   - with no `<main>`, when exactly one visible candidate is left (the whole page wrapped in one element)
 *     go down into it, again and again, until a level has more than one — or nothing visible is below
 *   - the blocks are the visible ones (height > 0) of the level that was reached
 *
 * @param {*} root `<main>` or `<body>`
 * @param {{ display(e): string, children(e): any[], shown(e): boolean, skip(e): boolean }} a
 * @param {{ hasMain: boolean }} opts
 */
export function selectBlocks(root, a, opts) {
  const flat = (els) => els.flatMap((e) => (a.display(e) === 'contents' ? flat(a.children(e)) : [e]));
  const level = (e) => flat(a.children(e)).filter((x) => !a.skip(x));
  let kids = level(root);
  if (!opts.hasMain) {
    for (;;) {
      const visible = kids.filter(a.shown);
      if (visible.length !== 1) break;
      const next = level(visible[0]);
      if (!next.some(a.shown)) break;
      kids = next;
    }
  }
  return kids.filter(a.shown);
}

/**
 * The first look at the page, inside the page: top-level blocks (by `selectBlocks`), every visible
 * heading, every clickable element with its box, link address and landmark. Handed to `page.evaluate`
 * as text, with `selectBlocks` written in; it stands alone like `measurePage`. Marks the blocks with
 * `data-ds-block` (the caller cleans them off).
 */
function collectInPage(selectBlocks) {
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
  const blocks = selectBlocks(main ?? document.body, {
    display: (e) => getComputedStyle(e).display,
    children: (e) => [...e.children],
    shown,
    skip: (e) => e.hasAttribute('data-ds-lm') || /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(e.tagName),
  }, { hasMain: Boolean(main) });
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
  // the link address as the page wrote it; a same-site one as path + query + hash
  const hrefOf = (el) => {
    const raw = el.getAttribute('href');
    if (!raw) return null;
    try {
      const u = new URL(raw, location.href);
      return u.origin === location.origin ? u.pathname + u.search + u.hash : u.href;
    } catch (e) {
      return raw;
    }
  };
  const clickSelector = [
    'a[href]', 'button', 'summary', 'input:not([type="hidden"])', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  const landmarkOf = (el) => el.closest('[data-ds-lm]')?.getAttribute('data-ds-lm') || null;
  const clickables = [...document.querySelectorAll(clickSelector)]
    .filter(shown)
    .map((el) => {
      const href = hrefOf(el);
      return { role: implicitRole(el), name: nameOf(el), ...box(el), landmark: landmarkOf(el), ...(href ? { href } : {}) };
    });
  const levelOf = (el) => Number(el.getAttribute('aria-level')) || Number((/^H([1-6])$/.exec(el.tagName) || [])[1]) || 2;
  // each heading gets an identity (its place in this list, also written on the element as `data-ds-h`) and
  // the top-level block it sits in, so the caller can tell "the heading a section is located by" from
  // "another heading at the same coordinates" without comparing coordinates
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')]
    .filter(shown)
    .map((el, i) => {
      el.setAttribute('data-ds-h', String(i));
      const block = el.closest('[data-ds-block]');
      return { id: i, level: levelOf(el), name: nameOf(el), ...box(el), block: block ? Number(block.getAttribute('data-ds-block')) : -1, landmark: landmarkOf(el) };
    });

  // the embedded pages, where they sit: what the second look says moved is matched to them
  const iframes = [...document.querySelectorAll('iframe')].filter(shown).map((el) => {
    const r = el.getBoundingClientRect();
    return { src: el.getAttribute('src') || '', left: px(r.left + window.scrollX), right: px(r.right + window.scrollX), ...box(el) };
  });

  const info = document.querySelector('[data-ds-lm="contentinfo"]');
  return {
    pageSize: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    iframes,
    blocks: blocks.map(box),
    contentinfo: info ? box(info) : null,
    clickables,
    headings,
    env: {
      language: navigator.language,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      dpr: window.devicePixelRatio,
    },
  };
}

/**
 * Puts the motion-off style into the page and into every embedded page (iframe) that shares its origin,
 * the loop-animated product demos on a marketing page being the case that matters: a style added to the
 * outer document does not reach into them, so two shots of one entry differ. Runs in the Playwright
 * process (serialised into the generated function, so it stands alone; the fake page in the unit tests is
 * the boundary). A cross-origin embedded page cannot be reached and is reported, not retried; neither is
 * one the browser refuses (gone, navigating away). `watch` also freezes a frame the moment it navigates, for
 * the ones that load after this pass; call it again later for the ones that slipped in between.
 * The style goes in once per document (an element with a fixed id), whatever number of passes.
 * `injected` says only that the style went in. It does not say the page holds still: a loop driven by a
 * script ignores the style, and what actually stands still is found by looking twice (`movingSections`).
 * @returns {Promise<{ url: string, injected: boolean, why?: string }[]>} one entry per frame, the page first
 */
export async function freezeFrames(page, css, { watch = false } = {}) {
  const originOf = (u) => {
    try {
      return new URL(u).origin;
    } catch (e) {
      return null;
    }
  };
  const inject = (c) => {
    if (document.getElementById('__ds-freeze')) return;
    const style = document.createElement('style');
    style.id = '__ds-freeze';
    style.textContent = c;
    (document.head || document.documentElement).append(style);
  };
  const one = async (frame) => {
    const url = frame.url();
    const here = originOf(page.url());
    const same = frame === page.mainFrame() || url.startsWith('about:') || (here !== null && originOf(url) === here);
    if (!same) return { url, injected: false, why: '跨域的内嵌页面，样式注入不进去' };
    try {
      await frame.evaluate(inject, css);
      return { url, injected: true };
    } catch (e) {
      return { url, injected: false, why: String((e && e.message) || e).split('\n')[0].slice(0, 120) };
    }
  };
  if (watch) page.on('framenavigated', (f) => { if (f !== page.mainFrame()) one(f); });
  const report = [];
  for (const frame of page.frames()) report.push(await one(frame));
  return report;
}

/**
 * Which sections still change between two shots of the whole page taken a beat apart, with motion switched
 * off. Switching animations off does not make a page hold still (a loop driven by a script, a carousel on
 * a timer), so this is what says whether a section can be compared pixel for pixel later.
 *
 * `a` and `b` are decoded pictures `{ width, height, data }` (RGBA); `ranges` are `computeRanges`' (CSS
 * pixels); `scale` is picture pixels per CSS pixel. A pixel counts as changed when some channel differs by
 * more than `channel`; a section is moving when at least `minPixels` of its pixels changed. Rows only one
 * of the two pictures has (the page grew) count as changed; pictures of different widths make every
 * section moving.
 *
 * Stands alone: unit-tested here, and written into the page-side code, where the pictures come from a canvas.
 *
 * @returns {{ id: string, ref: string, changedPixels: number|null, ratio: number|null, box: {x0, y0, x1, y1}|null, reason?: string }[]}
 *   `box` is the bounding box of what changed, in CSS pixels of the page
 */
export function movingSections(a, b, ranges, opts = {}) {
  const channel = opts.channel ?? 16;
  const minPixels = opts.minPixels ?? 100;
  const scale = opts.scale ?? 1;
  if (a.width !== b.width) {
    return ranges.map((r) => ({ id: r.id, ref: r.ref, changedPixels: null, ratio: null, box: null, reason: `两张图的尺寸不同（宽 ${a.width} 与 ${b.width}）` }));
  }
  const w = a.width;
  const shared = Math.min(a.height, b.height);
  const rows = Math.max(a.height, b.height);
  const out = [];
  for (const r of ranges) {
    const y0 = Math.max(0, Math.round(r.start * scale));
    const y1 = Math.min(rows, Math.round(r.end * scale));
    if (y1 <= y0) continue;
    let n = 0;
    let minX = Infinity;
    let maxX = -1;
    let minY = Infinity;
    let maxY = -1;
    for (let y = y0; y < y1; y += 1) {
      if (y >= shared) {
        n += w;
        minX = 0;
        maxX = w - 1;
        minY = Math.min(minY, y);
        maxY = y;
        continue;
      }
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        if (Math.abs(a.data[i] - b.data[i]) > channel || Math.abs(a.data[i + 1] - b.data[i + 1]) > channel || Math.abs(a.data[i + 2] - b.data[i + 2]) > channel) {
          n += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (n < minPixels) continue;
    out.push({
      id: r.id,
      ref: r.ref,
      changedPixels: n,
      ratio: n / ((y1 - y0) * w),
      box: { x0: Math.floor(minX / scale), y0: Math.floor(minY / scale), x1: Math.ceil((maxX + 1) / scale), y1: Math.ceil((maxY + 1) / scale) },
    });
  }
  return out;
}

/**
 * Which embedded pages (iframes) sit under what moved: the measured answer to "which embedded page did
 * not freeze". `moving` is `movingSections`' result, `iframes` the boxes of the page's iframes
 * (`{ src, left, right, top, bottom }`, page coordinates), `frames` is `freezeFrames`' report (to say
 * whether the style got in), `pageUrl` resolves a relative `src`. Stands alone (written into the generated code).
 * @returns {{ url: string, section: string, injected: boolean|null, why?: string }[]}
 */
export function framesInMotion(moving, iframes, frames, pageUrl) {
  const out = [];
  for (const m of moving ?? []) {
    if (!m.box) continue;
    for (const f of iframes ?? []) {
      if (!(f.left < m.box.x1 && f.right > m.box.x0 && f.top < m.box.y1 && f.bottom > m.box.y0)) continue;
      let url = f.src;
      try {
        url = new URL(f.src, pageUrl).href;
      } catch (e) {
        // a src that is not a URL stays as written
      }
      if (out.some((o) => o.url === url && o.section === m.id)) continue;
      const known = (frames ?? []).find((x) => x.url === url);
      out.push({ url, section: m.id, injected: known ? known.injected : null, ...(known && known.why ? { why: known.why } : {}) });
    }
  }
  return out;
}

/**
 * Which tab groups had a different tab selected between two readings (`readTabGroups`' result, before and
 * after). A carousel on a timer changes the picture without any script of ours having touched it, and the
 * "stop it first" step does not always stick. Groups are matched by key; a group only the later reading has
 * (it hydrated meanwhile) is not a change; one that was there and is gone is, with `to: null`. Stands alone.
 * @returns {{ group: string, from: string[], to: string[]|null }[]}
 */
export function tabGroupChanges(before, after) {
  const now = new Map((after ?? []).map((g) => [g.key, g]));
  const out = [];
  for (const g of before ?? []) {
    const h = now.get(g.key);
    if (!h) out.push({ group: g.key, from: g.selected, to: null });
    else if (JSON.stringify(g.selected) !== JSON.stringify(h.selected)) out.push({ group: g.key, from: g.selected, to: h.selected });
  }
  return out;
}

/**
 * Inside the page: every tab group and which of its tabs is selected (`aria-selected`, `aria-current`, or
 * `data-state="active"`). A group is a `role="tablist"` or, for tabs outside any, the tabs sharing a parent.
 * The key is the group's label, else its tab names joined; a repeated key gets a number. Handed to
 * `page.evaluate` as text, so it stands alone.
 */
function readTabGroups() {
  const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const groups = [...document.querySelectorAll('[role="tablist"]')].map((l) => ({ label: l.getAttribute('aria-label') || '', tabs: [...l.querySelectorAll('[role="tab"]')] }));
  const loose = new Map();
  for (const t of document.querySelectorAll('[role="tab"]')) {
    if (t.closest('[role="tablist"]')) continue;
    loose.set(t.parentElement, [...(loose.get(t.parentElement) ?? []), t]);
  }
  for (const tabs of loose.values()) groups.push({ label: '', tabs });
  const used = new Map();
  return groups.filter((g) => g.tabs.length).map((g) => {
    const names = g.tabs.map(name);
    const base = g.label || names.join('|');
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const on = (t) => t.getAttribute('aria-selected') === 'true' || (t.hasAttribute('aria-current') && t.getAttribute('aria-current') !== 'false') || t.getAttribute('data-state') === 'active';
    return { key: n > 1 ? `${base}#${n}` : base, tabs: names, selected: g.tabs.filter(on).map(name) };
  });
}

/**
 * Inside the page: the function `page.evaluate` calls with the two pictures (base64 PNGs), the ranges and
 * the page width; decodes them on a canvas and returns `movingSections`' answer. Written as text with
 * `movingSections` in, so it stands alone.
 */
function compareInPage(movingSections) {
  return async (args) => {
    const decode = async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
      if (bmp.close) bmp.close();
      return { width: d.width, height: d.height, data: d.data };
    };
    const a = await decode(args.a);
    const b = await decode(args.b);
    return movingSections(a, b, args.ranges, { scale: args.pageWidth ? a.width / args.pageWidth : 1 });
  };
}

/**
 * Runs inside the Playwright MCP's `browser_run_code_unsafe`, serialised with `toString()`, so it has
 * to stand alone: everything it needs arrives in `C` (the config) or is created inside. Returns the
 * measurement `attribute` reads. Positions are page coordinates in CSS pixels, taken at scroll 0.
 */
async function measurePage(page, C) {
  // which tab of each tab group is selected, before anything below runs: a carousel on a timer changes it
  const tabsBefore = await page.evaluate(C.tabsExpr);
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
  await freezeFrames(page, C.freezeCss, { watch: true });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  // 3 mark what the accessibility tree calls banner / contentinfo, then box the top-level blocks
  for (const role of ['banner', 'contentinfo']) {
    await page.getByRole(role).evaluateAll((els, r) => els.forEach((el) => el.setAttribute('data-ds-lm', r)), role);
  }
  const base = await page.evaluate(C.collectExpr);

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
      const level = Number(el.getAttribute('aria-level')) || Number((/^H([1-6])$/.exec(el.tagName) || [])[1]) || 2;
      const h = el.getAttribute('data-ds-h');
      return {
        top: px(rect.top + window.scrollY), bottom: px(rect.bottom + window.scrollY),
        block: block ? Number(block.getAttribute('data-ds-block')) : -1, level, heading: h === null ? -1 : Number(h),
      };
    });
    sections.push({ ...entry, found: true, ...r });
  }

  // 5 freeze once more (an embedded page can have loaded since), clean the marks off, shoot the whole page
  const frames = await freezeFrames(page, C.freezeCss);
  await page.evaluate(() => document.querySelectorAll('[data-ds-block],[data-ds-lm],[data-ds-h]').forEach((el) => {
    el.removeAttribute('data-ds-block');
    el.removeAttribute('data-ds-lm');
    el.removeAttribute('data-ds-h');
  }));
  // the picture, then — a beat later — a second look at the whole page. Switching animations off does not
  // make a page hold still (a loop run by a script, a carousel on a timer): what changed between the two
  // looks, section by section, is what is still moving
  const shot = await page.screenshot({ ...(C.out ? { path: C.out } : {}), fullPage: true, animations: 'disabled' });
  const image = C.out ? { path: C.out } : null;
  await page.waitForTimeout(C.settleMs);
  const again = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const tabsAfter = await page.evaluate(C.tabsExpr);
  let moving = null;
  let compare = { ok: true };
  try {
    const ranges = computeRanges({ sections, blocks: base.blocks, contentinfo: base.contentinfo, pageSize: base.pageSize, page: C.page });
    // a string given to page.evaluate is run as an expression and a function in it is not called, so the
    // text is made back into a function here
    const result = await page.evaluate(new Function(`return ${C.compareExpr}`)(), { a: shot.toString('base64'), b: again.toString('base64'), ranges, pageWidth: base.pageSize.width });
    if (!Array.isArray(result)) throw new Error('页面里的比对没有返回结果');
    moving = result;
  } catch (e) {
    compare = { ok: false, why: String((e && e.message) || e).split('\n')[0].slice(0, 160) };
  }
  const tabs = { before: tabsBefore, after: tabsAfter, changed: tabGroupChanges(tabsBefore, tabsAfter) };
  const measurement = {
    state: C.state, page: C.page, viewport: C.viewport, theme: C.theme, motion: C.motion,
    pageSize: base.pageSize, blocks: base.blocks, contentinfo: base.contentinfo,
    sections, clickables: base.clickables, headings: base.headings, env: base.env, frames,
    moving, tabs, compare, settleMs: C.settleMs, image,
  };
  // run_code cannot write a file, and its return value is echoed whole into the conversation: keep the
  // measurement on the page for `browser_evaluate` (with a `filename`) to save, and return a summary
  await page.evaluate((m) => { window.__designArchiveMeasure = m; }, measurement);
  return {
    saved: 'window.__designArchiveMeasure',
    next: 'browser_evaluate { function: "() => window.__designArchiveMeasure", filename: "<测量结果.json>" } 存成文件，再交给 attribute',
    state: C.state, pageSize: base.pageSize, blocks: base.blocks.length, headings: base.headings.length, clickables: base.clickables.length,
    sections: sections.map((x) => ({ id: x.id, found: x.found, ...(x.found ? {} : { reason: x.reason }) })),
    env: base.env,
    // 还在动的段：隔约一秒再拍一次整页、逐段比出来的（compare.ok 为 false 时没比成，原因在 compare.why）
    moving: !Array.isArray(moving) ? null : moving.map((x) => ({ id: x.id, changedPixels: x.changedPixels, ratio: x.ratio, box: x.box })),
    compare,
    tabsChanged: tabs.changed,
    // injectFailed: the style could not be put in; notFrozen: the embedded pages under what really moved
    frames: { total: frames.length, injectFailed: frames.filter((f) => !f.injected), notFrozen: framesInMotion(moving, base.iframes, frames, page.url()) },
    image,
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
    settleMs: SETTLE_MS,
    // an expression, not a function: a string given to page.evaluate is run as is, not called
    collectExpr: `(${collectInPage.toString()})(${selectBlocks.toString()})`,
    tabsExpr: `(${readTabGroups.toString()})()`,
    // a function written out as text; `measurePage` makes it a function again for `page.evaluate(fn, arg)`
    compareExpr: `(args) => (${compareInPage.toString()})(${movingSections.toString()})(args)`,
  };
  // the helpers are free names inside `measurePage`; declared beside it here, they resolve in its closure
  const helpers = [freezeFrames, computeRanges, tabGroupChanges, framesInMotion].map((f) => `const ${f.name} = ${f.toString()};`).join(' ');
  return `async (page) => { ${helpers} return (${measurePage.toString()})(page, ${JSON.stringify(C)}); }`;
}

// ---------- ranges and ownership ----------

const roundPx = (v) => Math.round(v);

/**
 * Measurement → each located section's range.
 *
 * Ranges (references/design-archive.md §3): a section found by heading starts at the top of the top-level
 * block that holds the heading when it is the first declared one in that block (but not above where the
 * section before it ends, when that one is a landmark or `position` box), and at the heading itself
 * otherwise; it runs to where the next declared section starts (the last one: the top of the page's first
 * contentinfo, declared or not, else the page bottom). A landmark or `position` section is that element's
 * own box. Whole pixels: the start is rounded, the height is the rounded real height, the end is start
 * plus height — so a section whose content did not change keeps its height whatever moves above it
 * (neighbours may end up a pixel apart; that is not reported). No end goes past the page height.
 *
 * Stands alone (no reference to anything outside it): `attribute` calls it, and it is also written into
 * the generated page-side code, which cuts the second look at the page by the very same ranges.
 *
 * @returns {{ id: string, ref: string, by: string, role: string|null, start: number, end: number, height: number }[]}
 */
export function computeRanges(m) {
  const ref = (id) => (m.page ? `${m.page}#${id}` : id);
  const blocks = m.blocks ?? [];
  const pageHeight = m.pageSize?.height ?? 0;
  const found = (m.sections ?? []).filter((s) => s.found);
  const kindOf = (s) => (s.locate?.position !== undefined ? 'position' : s.locate?.role === 'heading' ? 'heading' : 'landmark');
  const firstInBlock = new Set();
  const seenBlocks = new Set();
  found.forEach((s, i) => {
    if (kindOf(s) !== 'heading' || s.block < 0 || seenBlocks.has(s.block)) return;
    seenBlocks.add(s.block);
    firstInBlock.add(i);
  });
  // the real (fractional) start of each section
  const rawStart = found.map((s, i) => {
    if (kindOf(s) !== 'heading' || !firstInBlock.has(i) || !blocks[s.block]) return s.top;
    const before = found[i - 1];
    const floor = before && kindOf(before) !== 'heading' ? before.bottom : 0;
    return Math.max(blocks[s.block].top, floor);
  });
  const rawEnd = found.map((s, i) => {
    if (kindOf(s) !== 'heading') return s.bottom;
    return i + 1 < found.length ? rawStart[i + 1] : m.contentinfo?.top ?? pageHeight;
  });
  // nothing runs past the bottom of the page: rounding a last section up can put its end a pixel beyond it
  const cap = pageHeight > 0 ? Math.round(pageHeight) : Infinity;
  return found.map((s, i) => {
    const start = Math.round(rawStart[i]);
    const end = Math.max(start, Math.min(start + Math.round(rawEnd[i] - rawStart[i]), cap));
    return { id: s.id, ref: ref(s.id), by: kindOf(s), role: s.locate?.role ?? null, start, end, height: end - start };
  });
}

/**
 * Measurement → ranges, the section each clickable element belongs to, and what does not fit.
 *
 * Ranges: see `computeRanges`.
 * Ownership: a clickable inside a banner / contentinfo belongs to the section that declares that landmark;
 * any other one belongs to the section whose range holds its vertical centre.
 * Undeclared headings: a heading of any level the declared section headings use (a page declared only down
 * to its h1 title: h2 too) inside a heading section's range, that is not itself a declared section, means a
 * section was left out and swallowed — listed, and the run fails like an orphan does. "Declared" is judged
 * on the element (the measurement says which heading each section was located by), not on coordinates.
 * Not a miss: same-level headings side by side in one row when none of them is a section (a card grid),
 * and any heading in the same top-level block as the heading that opens a section when that is the only
 * section declared in the block (the block was declared as one section).
 *
 * @returns {{ ok: boolean, ranges: object[], clickables: object[], orphans: object[], notFound: object[],
 *   outOfOrder: object[], undeclaredHeadings: object[], coverage: { gaps: object[], overlaps: object[] },
 *   pageHeight: number }}
 */
export function attribute(m) {
  const ref = (id) => (m.page ? `${m.page}#${id}` : id);
  const blocks = m.blocks ?? [];
  const pageHeight = m.pageSize?.height ?? 0;
  const secs = m.sections ?? [];
  const found = secs.filter((s) => s.found);
  const notFound = secs.filter((s) => !s.found).map((s) => ({ id: s.id, ref: ref(s.id), locate: s.locate, reason: s.reason ?? '没有定位到' }));

  const kindOf = (s) => (s.locate?.position !== undefined ? 'position' : s.locate?.role === 'heading' ? 'heading' : 'landmark');
  const ranges = computeRanges(m);

  const outOfOrder = [];
  ranges.forEach((r, i) => {
    if (r.end < r.start) outOfOrder.push({ id: r.id, ref: r.ref, reason: `范围倒过来了（${r.start} → ${r.end}）：它在页面上的位置比后一段还靠下` });
    else if (i > 0 && r.start < ranges[i - 1].start) outOfOrder.push({ id: r.id, ref: r.ref, reason: `起点 ${r.start} 比前一段（${ranges[i - 1].id}）的起点 ${ranges[i - 1].start} 还靠上：sections 的顺序要和页面一致` });
  });

  // rounding leaves at most a pixel between two neighbours: only more than that is a gap or an overlap
  const gaps = [];
  const overlaps = [];
  const sorted = [...ranges].filter((r) => r.height > 0).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const r of sorted) {
    if (r.start - cursor > 1) gaps.push({ from: cursor, to: r.start });
    else if (cursor - r.start > 1) overlaps.push({ at: r.id, from: r.start, to: cursor });
    cursor = Math.max(cursor, r.end);
  }
  if (pageHeight - cursor > 1) gaps.push({ from: cursor, to: pageHeight });

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
    const item = { role: c.role, name: c.name, y, section: owner ? owner.id : null, ref: owner ? owner.ref : null, ...(c.href ? { href: c.href } : {}) };
    clickables.push(item);
    if (!owner) orphans.push({ ...item, landmark: c.landmark ?? null, reason: why });
  }

  // Headings of the sections' level that fall inside a heading section's range without being a section.
  // Whether a heading is declared is a question about the element (the one a section was located by),
  // never about coordinates: two different headings can share a box. Two things are not a miss:
  //   - a row: same-level headings side by side (a grid of cards) when none of them is a section — they
  //     are one piece of content, not sections that were left out
  //   - a block declared as one: the heading sits in the same top-level block as the heading that opens
  //     the section, and that is the only section declared in that block — the block was declared whole
  const headingSections = found.filter((s) => kindOf(s) === 'heading');
  // "same level" = every level a declared section heading uses — not one picked by count (a tie, or one
  // h1 among h2s, used to drop a level). A page declared only down to its h1 title: the headings right
  // under the title are the page's sections, so h2 counts too.
  const sectionLevels = new Set(headingSections.map((s) => s.level).filter(Boolean));
  if (sectionLevels.size === 1 && sectionLevels.has(1)) sectionLevels.add(2);
  const isDeclared = (h) => headingSections.some((s) => (h.id !== undefined && s.heading !== undefined && s.heading >= 0 ? s.heading === h.id : s.locate?.name === h.name));
  const blockOf = (h) => {
    if (h.block !== undefined) return h.block;
    const y = h.top;
    const at = blocks.findIndex((b) => y >= b.top && y < b.bottom);
    return at;
  };
  const sameRow = (a, b) => a.level === b.level
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= 0.5 * Math.min(a.bottom - a.top, b.bottom - b.top);
  const pageHeadings = (m.headings ?? []).filter((h) => !h.landmark && h.level);
  const undeclaredHeadings = [];
  ranges.forEach((r, i) => {
    if (r.by !== 'heading') return;
    const ownBlock = found[i].block ?? -1;
    const wholeBlock = ownBlock >= 0 && headingSections.filter((s) => s.block === ownBlock).length === 1;
    for (const h of pageHeadings) {
      if (isDeclared(h)) continue;
      if (!sectionLevels.has(h.level)) continue;
      const y = roundPx(h.top);
      if (y < r.start || y >= r.end) continue;
      if (wholeBlock && blockOf(h) === ownBlock) continue;
      const row = pageHeadings.filter((o) => o !== h && sameRow(h, o));
      const declaredMate = row.find(isDeclared);
      if (row.length > 0 && !declaredMate) continue;
      undeclaredHeadings.push({
        level: h.level, name: h.name, y, in: r.id, ref: r.ref,
        reason: declaredMate
          ? `「${h.name}」和已声明的分段标题「${declaredMate.name}」并排在同一行（像是卡片宫格里的标题被当成了分段），被 ${r.id} 段吞掉了：这一整块声明成一段（定位用块里的主标题），或把并排的标题都补成段，重测`
          : `「${h.name}」是一个 h${h.level} 标题，和已声明的分段标题同一级，却没声明，被 ${r.id} 段吞掉了：补一段（最差补一段 content）或改定位，重测`,
      });
    }
  });
  undeclaredHeadings.sort((a, b) => a.y - b.y);

  return {
    ok: orphans.length === 0 && notFound.length === 0 && outOfOrder.length === 0 && undeclaredHeadings.length === 0,
    state: m.state ?? null,
    page: m.page ?? null,
    pageHeight,
    pageWidth: m.pageSize?.width ?? null,
    ranges,
    clickables,
    orphans,
    notFound,
    outOfOrder,
    undeclaredHeadings,
    coverage: { gaps, overlaps },
    // what the measurement saw still moving / switching: passed on, never a failure (the sections are
    // declared `unstable` in the archive instead — references/design-archive.md §10)
    moving: m.moving ?? [],
    tabsChanged: m.tabs?.changed ?? [],
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
  if (result.moving.length) {
    console.error(`attribute: 还在动的段 ${result.moving.length} 个（关了动画隔约一秒再拍，画面变了）：${result.moving.map((x) => `${x.id}（${x.reason ?? `变了 ${x.changedPixels} 个像素，范围 ${x.box.x0},${x.box.y0}–${x.box.x1},${x.box.y1}`}）`).join('；')}——在入口状态的 sections 里给它们标 unstable，写明是哪个东西在动；切图照存，「这一屏」注明拍到的只是其中一帧`);
  }
  if (result.tabsChanged.length) {
    console.error(`attribute: 测量期间选中项变了的标签组 ${result.tabsChanged.length} 个：${result.tabsChanged.map((x) => `${x.group}（${x.from.join('、') || '无'} → ${x.to ? x.to.join('、') || '无' : '组不见了'}）`).join('；')}——有轮播在自己切换：先把它点停（点了没用就在入口状态的「这一屏」里注明）再重测`);
  }
  if (!result.ok) {
    console.error(`attribute: 落空 ${result.orphans.length} 个，定位失败 ${result.notFound.length} 段，顺序不对 ${result.outOfOrder.length} 段，没声明的同级标题 ${result.undeclaredHeadings.length} 个——补分段或改定位后重测，清零再写档案`);
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
