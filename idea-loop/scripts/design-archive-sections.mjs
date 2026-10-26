#!/usr/bin/env node
/**
 * The deterministic half of shooting a long page for the design archive (skills/design/design-archive/references/sections.md, 拍图).
 *
 * A long entry state declares `sections` (design-archive.mjs). Writing it into the archive takes a
 * browser for the measuring and the shooting, and plain logic for everything else; this file is
 * the plain logic plus the code handed to the browser, split off the way `ui-measure.mjs` (browser) and
 * `ui-compare.mjs` (pure) are:
 *
 *   measure    prints the code the headless Playwright MCP runs (`browser_run_code_unsafe`): put a page clock
 *              under the page, find what scrolls (the document when it is taller than the screen, else the biggest
 *              visible element with its own scroll: an app shell's <main>) and scroll it through once (lazy islands
 *              hydrate, entrances finish, fixed elements show where they appear), locate each section with the accessibility tree, box the top-level
 *              blocks (a `display: contents` wrapper is looked through), every heading and every clickable
 *              element with its full accessible name and whether a role + name finds it.
 *   attribute  measurement JSON → each section's range, which section each clickable element belongs to,
 *              the ones that fall in none ("落空"), the sections that could not be located, the ones that
 *              overlap. Exit 1 on any of them.
 *   shoot      attribution JSON → the code that shoots each section by itself: scroll to it, wait until its
 *              content has all appeared and stopped changing, freeze the page clock, shoot its range, one
 *              PNG per section, `<entry state id>@<section id>.png`. A tall section is one tall picture.
 *
 * The browser side is covered by design-archive-sections-browser.test.mjs (skipped when no Chromium is
 * found) and by a real run; `attribute` and the target arithmetic are pure functions over data.
 *
 *   node design-archive-sections.mjs measure <repo-root> <entry-state> [--delta <spec-slug>] [--for <state> --section <id>] [settings]
 *   node design-archive-sections.mjs measure <repo-root> --state <entry-state> --page <page>
 *        (--sections '<json list>' | --sections-file <file>) [--for <state> --section <id>] [settings]
 *   node design-archive-sections.mjs attribute <measurement.json>
 *   node design-archive-sections.mjs shoot <attribution.json> --out <dir> [--section <id,id>] [--include '<json locator>']
 *   settings: --viewport 1440x900 --theme light|dark --locale zh-CN --motion default|reduce
 *             (default: the frontmatter of docs/design/prod/index.md)
 *
 * Exit: 0 = done / nothing orphaned, 1 = `attribute` found orphans, unlocated, misordered or overlapping
 *       sections, 2 = usage error or unreadable input.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadArchive, pageOfState, parseSectionRef, sectionLocate, sectionsOfState } from './design-archive.mjs';

// ---------- the browser side: the code handed to Playwright ----------

/** A function's source for the Playwright MCP: full-line comments and blank lines dropped (the tool echoes the code). */
const compact = (fn) => fn.toString().split('\n').filter((l) => l.trim() && !/^\s*\/\//.test(l)).join('\n');

/**
 * Runs inside the Playwright MCP's `browser_run_code_unsafe`, serialised with `toString()`, so it has
 * to stand alone: everything it needs arrives in `C` (the config) or is created inside. Returns the
 * measurement `attribute` reads (and leaves it in `window.__dsMeasure`, where `browser_evaluate` with a
 * `filename` can save it). Positions are page coordinates in CSS pixels, taken at scroll 0.
 */
async function measurePage(page, C) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });

  // 1 a page clock under the page, so the shot can freeze it later; it has to be there before the page's own scripts run
  let clock = 'present';
  if (!(await page.evaluate(() => !!globalThis.__pwClock))) {
    await page.clock.install();
    if (C.reload) {
      await page.reload();
      clock = 'installed, page reloaded';
    } else {
      clock = 'installed late: timers the page started before this keep running';
    }
  }

  // 2 helpers inside the page, reused by the evaluations below
  await page.evaluate((clickSelector) => {
    const px = (v) => Math.round(v * 100) / 100;
    const ds = {
      clickSelector,
      px,
      scrollerSel: null,
      get scroller() {
        return ds.scrollerSel ? document.querySelector(ds.scrollerSel) : null;
      },
      scrollTop: () => (ds.scroller ? ds.scroller.scrollTop : window.scrollY),
      scrollHeight: () => (ds.scroller ? ds.scroller.scrollHeight : document.documentElement.scrollHeight),
      visibleHeight: () => (ds.scroller ? ds.scroller.clientHeight : window.innerHeight),
      scrollTo: (v) => {
        if (ds.scroller) ds.scroller.scrollTo({ top: v, behavior: 'instant' });
        else window.scrollTo({ top: v, behavior: 'instant' });
      },
      pathOf: (el) => {
        if (el === document.body) return 'body';
        if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
        const parts = [];
        for (let p = el; p && p !== document.body; p = p.parentElement) parts.unshift(p.tagName.toLowerCase() + ':nth-child(' + ([...p.parentElement.children].indexOf(p) + 1) + ')');
        return 'body > ' + parts.join(' > ');
      },
      // the page body counts too: a shell that locks <html> and lets <body> scroll has no element inside it that does
      candidates: () => [document.body, ...document.querySelectorAll('body *')]
        .flatMap((el) => {
          if (/^(TEXTAREA|SELECT|INPUT)$/.test(el.tagName) || el.clientHeight === 0 || el.scrollHeight <= el.clientHeight) return [];
          if (!/^(auto|scroll)$/.test(getComputedStyle(el).overflowY) || !ds.shown(el)) return [];
          const r = el.getBoundingClientRect();
          const area = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
          return area > 0 ? [{ el, area }] : [];
        })
        .sort((a, b) => b.area - a.area),
      box: (el) => {
        const r = el.getBoundingClientRect();
        const sc = ds.scroller;
        const shift = sc && sc !== el && sc.contains(el) ? sc.scrollTop : 0;
        return { top: px(r.top + window.scrollY + shift), bottom: px(r.bottom + window.scrollY + shift) };
      },
      shown: (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      },
      opacity: (el) => {
        let o = 1;
        for (let p = el; p && p.nodeType === 1; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity);
        return px(o);
      },
      fixed: (el) => {
        const sc = ds.scroller;
        if (sc && !sc.contains(el)) return false;
        for (let p = el; p && p.nodeType === 1 && p !== sc; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true;
        return false;
      },
      fixedList: () => {
        const count = {};
        return [...document.querySelectorAll(ds.clickSelector)].filter(ds.fixed).map((el) => {
          const k = `${ds.role(el)}|${ds.names(el)[0] || ''}`;
          count[k] = (count[k] || 0) + 1;
          return { el, key: `${k}#${count[k]}` };
        });
      },
      role: (el) => {
        const explicit = el.getAttribute('role');
        if (explicit) return explicit;
        const tag = el.tagName;
        if (/^H[1-6]$/.test(tag)) return 'heading';
        if (tag === 'A') return 'link';
        if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
        if (tag === 'SELECT') return 'combobox';
        if (tag === 'TEXTAREA') return 'textbox';
        if (tag === 'INPUT') {
          const t = (el.getAttribute('type') || 'text').toLowerCase();
          return t === 'checkbox' || t === 'radio' ? t : /^(button|submit|reset|image)$/.test(t) ? 'button' : 'textbox';
        }
        return 'generic';
      },
      norm: (s) => String(s || '').replace(/\s+/g, ' ').trim(),
      content: (node) => {
        if (node.nodeType === 3) return node.nodeValue;
        if (node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true') return '';
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return '';
        if (node.tagName === 'IMG') return node.getAttribute('alt') || '';
        if (node.tagName === 'BR') return ' ';
        const gap = cs.display === 'inline' ? '' : ' ';
        return gap + [...node.childNodes].map(ds.content).join('') + gap;
      },
      names: (el) => {
        const labelled = el.getAttribute('aria-labelledby');
        const own = [
          el.getAttribute('aria-label'),
          labelled && labelled.split(/\s+/).map((id) => ds.content(document.getElementById(id) || document.createTextNode(''))).join(' '),
          el.labels && el.labels[0] && ds.content(el.labels[0]),
        ].map(ds.norm).find(Boolean);
        const list = [own, ds.norm(ds.content(el)), ds.norm(el.innerText), ds.norm(el.textContent),
          ds.norm(el.getAttribute('alt') || el.querySelector('img[alt]')?.getAttribute('alt')), ds.norm(el.getAttribute('title')),
          ds.norm(el.getAttribute('placeholder')), ds.norm(el.value)];
        return [...new Set(list.filter(Boolean))];
      },
    };
    window.__ds = ds;
  }, C.clickSelector);

  // 3 scroll the page through once, in half-viewport steps: lazy islands hydrate, scroll-triggered entrances
  //   finish, and a fixed element that only shows in one place is seen there. Islands hydrate after the load
  //   event and may swap their nodes, so wait for the page to go quiet first and identify a fixed element by
  //   its role, name and place among the same ones, not by a mark on the node.
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch (e) {
    // a page that never goes quiet is measured as it stands
  }
  await page.waitForTimeout(500);
  // what scrolls: the document when it is taller than the screen, else the biggest visible element with its own scroll, <body> among them (an app shell with a <main> that scrolls, or a <body> inside a locked <html>)
  await page.evaluate(() => {
    const ds = window.__ds;
    const pick = document.documentElement.scrollHeight > window.innerHeight ? null : ds.candidates()[0];
    ds.scrollerSel = pick ? ds.pathOf(pick.el) : null;
  });
  const appeared = {};
  const step = Math.max(150, Math.floor((await page.evaluate(() => window.__ds.visibleHeight())) * 0.5));
  for (let y = 0; y < (await page.evaluate(() => window.__ds.scrollHeight())); y += step) {
    await page.evaluate((v) => window.__ds.scrollTo(v), y);
    await page.waitForTimeout(200);
    const seen = await page.evaluate(() => {
      const ds = window.__ds;
      return ds.fixedList().flatMap(({ el, key }) => {
        const r = el.getBoundingClientRect();
        const on = ds.opacity(el) >= 0.01 && ds.shown(el) && r.bottom > 0 && r.top < window.innerHeight;
        return on ? [{ key, scrollY: ds.scrollTop(), top: ds.px(r.top), bottom: ds.px(r.bottom) }] : [];
      });
    });
    for (const f of seen) if (!appeared[f.key]) appeared[f.key] = { scrollY: f.scrollY, top: f.top, bottom: f.bottom };
  }
  await page.evaluate(() => window.__ds.scrollTo(window.__ds.scrollHeight()));
  await page.waitForTimeout(300);
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch (e) {
    // a page that never goes quiet is measured as it stands
  }
  // late content (a block that grows once its data or a timer arrives) moves everything below it: wait until the height holds still
  let height = -1;
  for (let i = 0; i < 6; i += 1) {
    const h = await page.evaluate(() => window.__ds.scrollHeight());
    if (h === height) break;
    height = h;
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.__ds.scrollTo(0));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  // 4 mark what the accessibility tree calls banner / contentinfo, then box the top-level blocks, headings and clickables
  for (const role of ['banner', 'contentinfo']) {
    await page.getByRole(role).evaluateAll((els, r) => els.forEach((el) => el.setAttribute('data-ds-lm', r)), role);
  }
  const base = await page.evaluate(() => {
    const ds = window.__ds;
    const main = document.querySelector('main, [role="main"]');
    const roots = main
      ? [...main.children]
      : [...document.body.children].filter((el) => !el.hasAttribute('data-ds-lm') && !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName));
    // a wrapper that takes no room of its own (`display: contents`, e.g. an island) is looked through to its children
    const through = (els) => els.flatMap((el) => (getComputedStyle(el).display === 'contents' ? through([...el.children]) : [el]));
    const blocks = through(roots).filter(ds.shown);
    blocks.forEach((el, i) => el.setAttribute('data-ds-block', String(i)));

    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(ds.shown)
      .map((el) => ({ level: Number(el.getAttribute('aria-level')) || (/^H([1-6])$/.test(el.tagName) ? Number(el.tagName[1]) : 2), cands: ds.names(el), ...ds.box(el) }));
    const fixedKeys = new Map(ds.fixedList().map(({ el, key }) => [el, key]));
    const clickables = [...document.querySelectorAll(ds.clickSelector)].filter(ds.shown)
      .map((el) => ({
        role: ds.role(el),
        cands: ds.names(el),
        ...ds.box(el),
        landmark: el.closest('[data-ds-lm]')?.getAttribute('data-ds-lm') || null,
        opacity: ds.opacity(el),
        fixed: fixedKeys.get(el) ?? null,
      }));

    const info = document.querySelector('[data-ds-lm="contentinfo"]');
    const sc = ds.scroller;
    const rect = sc && sc.getBoundingClientRect();
    const scroller = sc
      ? { kind: 'element', selector: ds.scrollerSel, tag: sc.tagName.toLowerCase(), top: ds.px(rect.top + sc.clientTop + window.scrollY), left: ds.px(rect.left + sc.clientLeft), width: sc.clientWidth, contentHeight: sc.scrollHeight, visibleHeight: sc.clientHeight }
      : { kind: 'document', selector: null, tag: 'html', top: 0, left: 0, width: document.documentElement.clientWidth, contentHeight: document.documentElement.scrollHeight, visibleHeight: window.innerHeight };
    scroller.others = ds.candidates().filter((c) => c.el !== sc)
      .map((c) => ({ selector: ds.pathOf(c.el), tag: c.el.tagName.toLowerCase(), contentHeight: c.el.scrollHeight, visibleHeight: c.el.clientHeight, visibleArea: Math.round(c.area) }));
    return {
      scroller,
      pageSize: { width: document.documentElement.scrollWidth, height: sc ? ds.px(scroller.top + scroller.contentHeight) : document.documentElement.scrollHeight },
      blocks: blocks.map(ds.box),
      contentinfo: info ? ds.box(info) : null,
      headings,
      clickables,
      env: { language: navigator.language, dark: matchMedia('(prefers-color-scheme: dark)').matches, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, dpr: window.devicePixelRatio },
    };
  });

  // 5 the full accessible name of each heading and clickable, and whether role + name finds it (else: by its text)
  const memo = new Map();
  const resolve = async (role, cands) => {
    const key = `${role}|${cands.join('|')}`;
    if (memo.has(key)) return memo.get(key);
    let found = null;
    for (const name of cands) {
      let n = 0;
      try {
        n = await page.getByRole(role, { name, exact: true }).count();
      } catch (e) {
        n = 0;
      }
      if (n > 0) {
        found = { name, matches: n, byRole: true };
        break;
      }
    }
    if (!found) {
      const name = cands[0] || '';
      found = { name, matches: 0, byRole: false, textMatches: name ? await page.getByText(name, { exact: true }).count() : 0 };
    }
    memo.set(key, found);
    return found;
  };
  const headings = [];
  for (const { cands, ...h } of base.headings) headings.push({ ...h, ...(await resolve('heading', cands)) });
  const clickables = [];
  for (const { cands, fixed, ...c } of base.clickables) {
    clickables.push({ ...c, ...(await resolve(c.role, cands)), fixed: fixed !== null, appearance: fixed !== null ? appeared[fixed] || null : null });
  }

  // 6 locate each declared section through the accessibility tree
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
      const block = el.closest('[data-ds-block]');
      return { ...window.__ds.box(el), block: block ? Number(block.getAttribute('data-ds-block')) : -1 };
    });
    sections.push({ ...entry, found: true, ...r });
  }

  // 7 clean the marks off
  await page.evaluate(() => {
    document.querySelectorAll('[data-ds-block],[data-ds-lm]').forEach((el) => {
      el.removeAttribute('data-ds-block');
      el.removeAttribute('data-ds-lm');
    });
    delete window.__ds;
  });
  const result = {
    state: C.state, entry: C.entry, section: C.section, page: C.page, viewport: C.viewport, theme: C.theme, motion: C.motion, clock,
    scroller: base.scroller, pageSize: base.pageSize, blocks: base.blocks, contentinfo: base.contentinfo,
    sections, headings, clickables, env: base.env,
  };
  await page.evaluate((r) => { window.__dsMeasure = r; }, result);
  return result;
}

const CLICK_SELECTOR = [
  'a[href]', 'button', 'summary', 'input:not([type="hidden"])', 'select', 'textarea',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The text of the function `browser_run_code_unsafe` takes (`async (page) => …`).
 * @param {{ state?: string, entry?: string, section?: string, page?: string, sections: {id, locate}[],
 *   viewport: {width, height}, theme: string, motion?: string, reload?: boolean }} config
 *   `state` is whose picture it is (the entry state, or — with `section` — a state inside one of its sections);
 *   `reload` lets the code reload the page once to put the page clock under it (an entry state; a state reached by
 *   interacting must not be reloaded, so there the clock goes in late).
 */
export function buildMeasureCode(config) {
  const C = {
    state: config.state ?? null,
    entry: config.entry ?? config.state ?? null,
    section: config.section ?? null,
    page: config.page ?? null,
    sections: config.sections.map((s) => ({ id: s.id, locate: s.locate })),
    viewport: config.viewport,
    theme: config.theme,
    motion: config.motion ?? 'default',
    reload: config.reload ?? true,
    clickSelector: CLICK_SELECTOR,
  };
  return `async (page) => (${compact(measurePage)})(page, ${JSON.stringify(C)})`;
}

/**
 * Shoots each target by itself, inside `browser_run_code_unsafe`. Per target: walk down the section
 * (lazy content, entrances), come back to its top, wait until two shots of it, 300 ms apart, are the same
 * (content has all appeared), freeze the page clock, shoot twice more and keep the second (they are the same
 * when nothing moves on its own), let the clock run again. The shots are `fullPage` with a `clip`, so the
 * clip is in page coordinates and may be taller than the viewport; Playwright's `animations: 'disabled'`
 * settles CSS animations and transitions (finite ones to their end, infinite ones to their start).
 *
 * When the page scrolls inside a container (the measurement's `scroller` is an element: an app shell whose
 * `<main>` scrolls) the page shot cannot reach what the container clips. A section inside it is shot a
 * screen at a time: the container scrolls one visible height, the visible part of the container is shot,
 * and the screens are put together into one picture as wide as the container; a bar pinned to the top of the
 * container is stood below on every screen. The stability check and the frozen clock cover all the screens
 * of a section. A section above the container (the shell's top bar) is a page shot as before.
 */
async function shootPage(page, C) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  let clock = 'present';
  if (!(await page.evaluate(() => !!globalThis.__pwClock))) {
    await page.clock.install();
    clock = 'installed late: timers the page started before this keep running';
  }
  await page.evaluate(() => document.fonts.ready);
  const vh = C.viewport.height;
  const sc = C.scroller && C.scroller.kind === 'element' ? C.scroller : null;
  const contentTop = sc ? Math.round(sc.top) : 0;
  const maxScroll = Math.max(0, C.pageHeight - vh);
  const scrollTo = (y) => page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), Math.max(0, Math.min(y, maxScroll)));

  // the scroll container (an app shell's <main>): scrolled by selector, looked at through its own box
  const must = () =>
    page.evaluate((s) => !!document.querySelector(s), sc && sc.selector).then((found) => {
      if (!found) throw new Error('scroll container ' + sc.selector + ' is not on the page: measure and shoot have to look at the same page');
    });
  const scrollIn = (v) =>
    page.evaluate(({ s, v }) => {
      const el = document.querySelector(s);
      el.scrollTo({ top: v, behavior: 'instant' });
      return el.scrollTop;
    }, { s: sc && sc.selector, v: Math.max(0, v) });
  const boxIn = () =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + el.clientLeft), y: Math.round(r.top + el.clientTop), width: el.clientWidth, height: el.clientHeight, content: el.scrollHeight };
    }, sc && sc.selector);
  // a bar pinned to the top of the container: its height, so the part of a band under it is not taken from there
  const pinnedIn = () =>
    page.evaluate((s) => {
      const box = document.querySelector(s);
      const b = box.getBoundingClientRect();
      const top = b.top + box.clientTop;
      let bottom = top;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if ((cs.position !== 'fixed' && cs.position !== 'sticky') || el === box || el.contains(box)) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= top + 2 && r.bottom > top && r.bottom < top + box.clientHeight * 0.4 && r.width >= box.clientWidth * 0.5 && parseFloat(cs.opacity) >= 0.01 && cs.visibility !== 'hidden') bottom = Math.max(bottom, r.bottom);
      }
      return Math.ceil(bottom - top);
    }, sc && sc.selector);
  // the screens of a band [c0, c1) (offsets in the container's content): scroll a screen at a time, shoot what the container shows below a pinned bar
  const screens = async (c0, c1) => {
    const strips = [];
    let at = c0;
    while (at < c1) {
      await scrollIn(at);
      await page.waitForTimeout(120);
      const pinned = at > 0 ? await pinnedIn() : 0;
      const top = await scrollIn(at - pinned);
      await page.waitForTimeout(120);
      const g = await boxIn();
      const skip = Math.round(at - top);
      const rows = Math.min(g.height - skip, c1 - at, vh - (g.y + skip));
      if (rows <= 0) break;
      const buf = await page.screenshot({ clip: { x: g.x, y: g.y + skip, width: g.width, height: rows }, animations: 'disabled' });
      strips.push({ buf, rows, width: g.width });
      at += rows;
    }
    return strips;
  };
  // the screens are put one under the other in a tab of their own and shot from there: no image library needed
  const stitch = async (strips, file) => {
    const width = strips[0].width;
    const height = strips.reduce((n, x) => n + x.rows, 0);
    let y = 0;
    const imgs = strips.map((x) => {
      const html = '<img style="position:absolute;left:0;top:' + y + 'px;width:' + width + 'px;height:' + x.rows + 'px" src="data:image/png;base64,' + x.buf.toString('base64') + '">';
      y += x.rows;
      return html;
    });
    const tab = await page.context().newPage();
    try {
      await tab.setViewportSize({ width, height: Math.min(height, 8000) });
      await tab.setContent('<body style="margin:0"><div id="s" style="position:relative;overflow:hidden;width:' + width + 'px;height:' + height + 'px">' + imgs.join('') + '</div></body>');
      await tab.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
      await tab.locator('#s').screenshot({ path: file, animations: 'disabled' });
    } finally {
      await tab.close();
    }
  };
  const sameScreens = (a, b) => a.length === b.length && a.every((x, i) => x.buf.equals(b[i].buf));

  if (sc) {
    await must();
    await scrollIn(0);
  }
  const shots = [];
  for (const t of C.targets) {
    const inside = !!(sc && t.inScroller);
    let c0 = t.start - contentTop;
    let c1 = t.end - contentTop;
    if (inside) {
      for (let y = c0; y < c1; y += Math.floor(vh * 0.6)) {
        await scrollIn(y);
        await page.waitForTimeout(250);
      }
      await scrollIn(c0);
    } else if (!sc) {
      for (let y = t.start; y < t.end; y += Math.floor(vh * 0.6)) {
        await scrollTo(y);
        await page.waitForTimeout(250);
      }
      await scrollTo(t.start);
    } else {
      await scrollIn(0);
    }
    await page.waitForTimeout(300);
    // a bar pinned to the top of the screen would cover the first rows of the section: stand the section just below it
    const inset = sc
      ? 0
      : await page.evaluate(() => {
          let bottom = 0;
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
            const r = el.getBoundingClientRect();
            if (r.top <= 2 && r.bottom > 0 && r.bottom < window.innerHeight * 0.4 && r.width >= window.innerWidth * 0.5 && parseFloat(cs.opacity) >= 0.01 && cs.visibility !== 'hidden') bottom = Math.max(bottom, r.bottom);
          }
          return Math.ceil(bottom);
        });
    if (inset > 0 && t.start > 0) {
      await scrollTo(t.start - inset);
      await page.waitForTimeout(300);
    }
    try {
      await page.waitForLoadState('networkidle', { timeout: 3000 });
    } catch (e) {
      // keep going: the stability check below is the one that decides
    }
    let top = t.start;
    let bottom = t.end;
    if (C.include) {
      const i = C.include;
      const where = i.role ? page.getByRole(i.role, i.name ? { name: i.name, exact: true } : {}) : i.text ? page.getByText(i.text, { exact: true }) : page.locator(i.selector);
      const box = await where.first().boundingBox();
      if (box) {
        const sy = await page.evaluate((s) => (s ? document.querySelector(s).scrollTop : window.scrollY), sc && sc.selector);
        top = Math.max(0, Math.min(top, Math.floor(box.y + sy)));
        bottom = Math.min(C.pageHeight, Math.max(bottom, Math.ceil(box.y + sy + box.height)));
        if (inside) {
          c0 = Math.max(0, top - contentTop);
          c1 = bottom - contentTop;
        }
      }
    }
    const heightOf = async () => {
      if (!sc) return page.evaluate(() => document.documentElement.scrollHeight);
      const g = await boxIn();
      return contentTop + g.content;
    };
    const heightNow = await heightOf();
    // a shot of a section outside the container is a page shot, which cannot reach below the one screen the document is
    let clipNote = null;
    if (sc && !inside) {
      const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (bottom > docHeight) {
        clipNote = 'the section reaches into the scroll container: only what the first screen shows of it is in the shot';
        bottom = docHeight;
      }
    }
    const clip = { x: 0, y: top, width: C.viewport.width, height: bottom - top };
    const snap = (path) => page.screenshot({ path, fullPage: true, clip, animations: 'disabled' });
    const take = (path) => (inside ? screens(c0, c1) : snap(path));
    const same = (a, b) => (inside ? sameScreens(a, b) : a.equals(b));
    let previous = await take();
    let settled = false;
    for (let i = 0; i < 8 && !settled; i += 1) {
      await page.waitForTimeout(300);
      const current = await take();
      settled = same(current, previous);
      previous = current;
    }
    let frozen = false;
    let clockError = null;
    // the clock runs while we ask, so a target a little ahead of "now" may already be behind by the time it arrives
    for (const ahead of [60, 250, 1000, 4000]) {
      try {
        const now = await page.evaluate(() => Date.now());
        await page.clock.pauseAt(now + ahead);
        frozen = true;
        clockError = null;
        break;
      } catch (e) {
        clockError = String(e.message).split('\n')[0];
      }
    }
    await page.waitForTimeout(150);
    const first = await take();
    await page.waitForTimeout(250);
    const second = await take(`${C.outDir}/${t.file}`);
    if (frozen) await page.clock.resume();
    if (inside) {
      if (!second.length) throw new Error(t.id + ': the scroll container showed nothing to shoot');
      await stitch(second, `${C.outDir}/${t.file}`);
    }
    const width = inside ? second[0].width : C.viewport.width;
    const height = inside ? second.reduce((n, x) => n + x.rows, 0) : bottom - top;
    shots.push({ id: t.id, file: t.file, y0: top, y1: bottom, width, height, ...(inside ? { screens: second.length } : {}), settled, clockFrozen: frozen, ...(clockError ? { clockError } : {}), ...(clipNote ? { note: clipNote } : {}), stable: same(first, second), heightDrift: heightNow - C.pageHeight });
  }
  if (sc) await scrollIn(0);
  else await scrollTo(0);
  return { out: C.outDir, clock, shots };
}

/** The code for `shoot`: `targets` are `{ id, file, start, end, inScroller }`, `scroller` is the attribution's scroll container; see `shootTargets`. */
export function buildShootCode(config) {
  const C = {
    targets: config.targets,
    viewport: config.viewport,
    theme: config.theme,
    motion: config.motion ?? 'default',
    pageHeight: config.pageHeight,
    outDir: config.outDir,
    include: config.include ?? null,
    scroller: config.scroller ?? null,
  };
  return `async (page) => (${compact(shootPage)})(page, ${JSON.stringify(C)})`;
}

// ---------- ranges and ownership ----------

const roundPx = (v) => Math.round(v);

/**
 * Measurement → ranges, the section each clickable element belongs to, and what does not fit.
 *
 * Ranges (skills/design/design-archive/references/sections.md, 怎么定位): a section found by heading starts at the top of the
 * top-level block that holds the heading — at the heading itself when that block holds another declared
 * heading — and runs to where the next declared section starts (the last one: the top of the page's
 * first contentinfo, declared or not, else the page bottom). A landmark or `position` section is that
 * element's own box. Ownership: a clickable inside a banner / contentinfo belongs to the section that
 * declares that landmark; any other one belongs to the section whose range holds its vertical centre —
 * for a fixed element, the centre where it first showed while the page was scrolled through. A clickable
 * that is see-through (opacity 0), or fixed and never shown, belongs to none and is listed in `hidden`,
 * not as an orphan. Two sections whose ranges overlap fail like an orphan (a landmark that floats over the
 * top of the content is not counted: its clickables are owned through the DOM).
 *
 * @returns {{ ok: boolean, ranges: object[], clickables: object[], orphans: object[], hidden: object[],
 *   roleUnresolved: object[], headings: object[], notFound: object[], outOfOrder: object[], overlaps: object[],
 *   coverage: { gaps: object[], overlaps: object[] }, pageHeight: number }}
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
  const sorted = [...ranges].filter((r) => r.height > 0).sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const r of sorted) {
    if (r.start > cursor) gaps.push({ from: cursor, to: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (pageHeight > cursor) gaps.push({ from: cursor, to: pageHeight });
  const overlaps = [];
  const flow = sorted.filter((r) => r.by !== 'landmark');
  let reach = null;
  for (const r of flow) {
    if (reach && r.start < reach.end) {
      overlaps.push({ at: r.id, with: reach.id, from: r.start, to: Math.min(r.end, reach.end), reason: `${reach.id} 与 ${r.id} 的范围重叠（${r.start}–${Math.min(r.end, reach.end)}）：多半是 position 定位的分块里还有另一段的标题，改成用标题定位，或把两段并成一段` });
    }
    if (!reach || r.end > reach.end) reach = r;
  }

  const landmarkOwner = (role) => ranges.find((r) => r.by === 'landmark' && r.role === role);
  const clickables = [];
  const orphans = [];
  const hidden = [];
  const roleUnresolved = [];
  for (const c of m.clickables ?? []) {
    if (c.fixed ? !c.appearance : (c.opacity ?? 1) < 0.01) {
      hidden.push({ role: c.role, name: c.name, reason: c.fixed ? '固定在屏幕上，整页滚一遍也没出现过' : '透明度为 0，看不见' });
      continue;
    }
    const y = c.fixed ? roundPx(c.appearance.scrollY + (c.appearance.top + c.appearance.bottom) / 2) : roundPx((c.top + c.bottom) / 2);
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
    const item = { role: c.role, name: c.name, y, section: owner ? owner.id : null, ref: owner ? owner.ref : null, ...(c.fixed ? { fixed: true } : {}) };
    clickables.push(item);
    if (!owner) orphans.push({ ...item, landmark: c.landmark ?? null, reason: why });
    if (c.byRole === false) roleUnresolved.push({ role: c.role, name: c.name, section: item.section, textMatches: c.textMatches ?? 0 });
  }

  const headings = (m.headings ?? []).map((h) => {
    const y = roundPx((h.top + h.bottom) / 2);
    const owner = ranges.find((r) => y >= r.start && y < r.end);
    return { level: h.level, name: h.name, byRole: h.byRole ?? null, matches: h.matches ?? null, y, section: owner ? owner.id : null };
  });

  return {
    ok: orphans.length === 0 && notFound.length === 0 && outOfOrder.length === 0 && overlaps.length === 0,
    state: m.state ?? null,
    entry: m.entry ?? m.state ?? null,
    section: m.section ?? null,
    page: m.page ?? null,
    viewport: m.viewport ?? null,
    theme: m.theme ?? null,
    motion: m.motion ?? null,
    clock: m.clock ?? null,
    pageHeight,
    pageWidth: m.pageSize?.width ?? null,
    scroller: m.scroller ?? null,
    ranges,
    clickables,
    orphans,
    hidden,
    roleUnresolved,
    headings,
    notFound,
    outOfOrder,
    overlaps,
    coverage: { gaps, overlaps },
  };
}

// ---------- what to shoot ----------

/**
 * The shots an attribution asks for: `{ id, ref, file, start, end, inScroller }` per section, clipped to the page,
 * and the `scroller` the page was measured with. `inScroller` is true for a section that starts inside a
 * scroll container (not the document): that one is shot from the container, screen by screen.
 * For an entry state, one per section (or only those in `only`), `<entry>@<section>.png`. For a state inside
 * a section (the measurement was made `--for` it), the one section it sits in, named after the state:
 * `<state>.png`. A section with no height is skipped and named in `skipped`.
 */
export function shootTargets(attribution, { only = null } = {}) {
  const entry = attribution.entry ?? attribution.state;
  const inSection = attribution.state && attribution.entry && attribution.state !== attribution.entry;
  if (!entry) throw new Error('不知道入口状态 id：归属结果里没有 state / entry');
  let wanted = attribution.ranges;
  if (inSection) {
    if (!attribution.section) throw new Error(`${attribution.state} 不是入口状态：要知道它在哪一段（测量时带 --section <段 id>，或档案里该状态的 section 已写）`);
    wanted = wanted.filter((r) => r.id === attribution.section);
    if (!wanted.length) throw new Error(`归属结果里没有段「${attribution.section}」（没定位到？先让 attribute 通过）`);
  } else if (only) {
    const unknown = only.filter((id) => !wanted.some((r) => r.id === id));
    if (unknown.length) throw new Error(`没有段 ${unknown.join('、')}；现有：${wanted.map((r) => r.id).join('、')}`);
    wanted = wanted.filter((r) => only.includes(r.id));
  }
  const scroller = attribution.scroller ?? null;
  const targets = [];
  const skipped = [];
  for (const r of wanted) {
    const start = Math.max(0, r.start);
    const end = attribution.pageHeight ? Math.min(attribution.pageHeight, r.end) : r.end;
    if (end <= start) {
      skipped.push({ id: r.id, reason: `范围 ${r.start}–${r.end} 没有高度，或在页面（高 ${attribution.pageHeight}）之外` });
      continue;
    }
    const inScroller = scroller?.kind === 'element' && start >= Math.round(scroller.top);
    targets.push({ id: r.id, ref: r.ref, file: inSection ? `${attribution.state}.png` : `${entry}@${r.id}.png`, start, end, inScroller });
  }
  return { targets, skipped, scroller };
}

// ---------- the command line ----------

/** The subcommands and the options each one takes — the docs' command lines are checked against this. */
export const COMMAND_FLAGS = {
  measure: ['--delta', '--state', '--page', '--sections', '--sections-file', '--for', '--section', '--viewport', '--theme', '--locale', '--motion'],
  attribute: [],
  shoot: ['--out', '--section', '--include'],
};

const USAGE = `用法：
  node design-archive-sections.mjs measure <仓库根> <入口状态 id> [--delta <spec-slug>] [--for <段内状态 id> --section <段 id>] [设置]
  node design-archive-sections.mjs measure <仓库根> --state <入口状态 id> --page <页面> (--sections '<JSON 列表>' | --sections-file <文件>) [--for <段内状态 id> --section <段 id>] [设置]
  node design-archive-sections.mjs attribute <测量结果.json>
  node design-archive-sections.mjs shoot <归属结果.json> --out <目录> [--section <段 id,段 id>] [--include '<JSON 定位>']
设置：--viewport 1440x900 --theme light|dark --locale zh-CN --motion default|reduce（默认取 docs/design/prod/index.md 的 frontmatter）
measure / shoot 打印交给 Playwright MCP「执行一段代码」的代码；attribute 有落空、定位失败、顺序不对或重叠时退出码 1。`;

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

  // a state inside one of the entry state's sections: shot as it stands now (no reload), named after the state
  let state = stateId;
  let section = null;
  if (flags.for) {
    state = flags.for;
    const known = archive.objects.get(flags.for);
    const written = known && known.kind === 'state' && known.fm.section != null ? parseSectionRef(String(known.fm.section)) : null;
    section = flags.section ?? written?.id ?? null;
    if (!section) throw new UsageError(`--for ${flags.for}：不知道它在哪一段——档案里它没写 section，也没给 --section <段 id>`);
    if (!sections.some((s) => s.id === section)) throw new UsageError(`--section ${section} 不是 ${stateId} 的分段（有：${sections.map((s) => s.id).join('、')}）`);
  } else if (flags.section) {
    throw new UsageError('--section 要和 --for 一起用（段内状态在哪一段）');
  }
  const settings = settingsOf(archive, flags);
  const code = buildMeasureCode({ state, entry: stateId, section, page, sections, ...settings, reload: !flags.for });
  console.log(code);
  console.error(`measure: ${sections.length} 段，视口 ${settings.viewport.width}×${settings.viewport.height}，${settings.theme}，motion ${settings.motion}${settings.locale ? `，语言 ${settings.locale}（浏览器要先按这个语言打开页面）` : ''}${flags.for ? `；给段内状态 ${state}（在 ${section} 段）量，不重载页面` : '；第一次会装页面时钟并重载一次页面'}；结果也留在 window.__dsMeasure，用 browser_evaluate 的 filename 存成文件`);
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
  if (result.hidden.length) console.error(`attribute: ${result.hidden.length} 个可点元素看不见（透明度为 0，或固定在屏幕上却从没出现），不参与归属`);
  if (result.roleUnresolved.length) console.error(`attribute: ${result.roleUnresolved.length} 个可点元素按「角色 + 名字」定位不到（roleUnresolved），边的 locate 对它们改写 { text: <完整文字> }`);
  if (!result.ok) {
    console.error(`attribute: 落空 ${result.orphans.length} 个，定位失败 ${result.notFound.length} 段，顺序不对 ${result.outOfOrder.length} 段，重叠 ${result.overlaps.length} 处——补分段或改定位后重测，清零再写档案`);
    return 1;
  }
  return 0;
}

function shootCommand(positional, flags) {
  if (positional.length !== 1) throw new UsageError('shoot 要一个归属结果文件');
  if (!flags.out) throw new UsageError('shoot 要 --out <目录>（Playwright 只能写它的工作区根目录里）');
  const attribution = readJson(positional[0], '归属结果');
  if (!Array.isArray(attribution.ranges)) throw new UsageError('归属结果里没有 ranges：先跑 attribute，把它的输出存成文件');
  if (!attribution.viewport || !attribution.theme) throw new UsageError('归属结果里没有 viewport / theme：用这一版 measure 量、再 attribute');
  if (attribution.ok === false) throw new UsageError('归属结果没通过（有落空、定位失败、顺序不对或重叠）：补分段后重测，清零了再拍');
  let include = null;
  if (flags.include) {
    include = safeParseIn(flags.include);
    if (!include || typeof include !== 'object' || !(include.role || include.text || include.selector)) throw new UsageError('--include 要是 { "role": …, "name": … } / { "text": … } / { "selector": … } 之一');
  }
  let picked;
  try {
    picked = shootTargets(attribution, { only: flags.section ? flags.section.split(',').map((s) => s.trim()).filter(Boolean) : null });
  } catch (e) {
    throw new UsageError(e.message);
  }
  if (!picked.targets.length) throw new UsageError(`没有要拍的段：${picked.skipped.map((s) => `${s.id}（${s.reason}）`).join('；') || '归属结果的 ranges 是空的'}`);
  const code = buildShootCode({
    targets: picked.targets.map(({ id, file, start, end, inScroller }) => ({ id, file, start, end, inScroller })),
    scroller: picked.scroller,
    viewport: attribution.viewport,
    theme: attribution.theme,
    motion: attribution.motion ?? 'default',
    pageHeight: attribution.pageHeight,
    outDir: resolve(flags.out),
    include,
  });
  console.log(code);
  console.error(`shoot: ${picked.targets.length} 张（${picked.targets.map((t) => t.file).join('、')}）写到 ${resolve(flags.out)}${picked.skipped.length ? `；跳过 ${picked.skipped.map((s) => s.id).join('、')}（没有高度）` : ''}`);
  return 0;
}

function safeParseIn(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UsageError(`--include 不是 JSON：${e.message}`);
  }
}

function main(argv) {
  const [command, ...rest] = argv.slice(2);
  try {
    if (!Object.hasOwn(COMMAND_FLAGS, command ?? '')) throw new UsageError(command ? `没有「${command}」这个子命令` : '缺少子命令');
    const { flags, positional } = parseArgs(command, rest);
    if (command === 'measure') return measureCommand(positional, flags);
    if (command === 'attribute') return attributeCommand(positional);
    if (command === 'shoot') return shootCommand(positional, flags);
    return 2;
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    console.error(USAGE);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv));
