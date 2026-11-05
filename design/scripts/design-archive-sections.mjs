#!/usr/bin/env node
/**
 * The deterministic half of shooting a long page for the design archive (skills/design/design-archive/references/shooting.md).
 *
 * A long entry state declares `sections` (design-archive.mjs). Writing it into the archive takes a
 * browser for the measuring and the shooting, and plain logic for everything else; this file is
 * the plain logic plus the code handed to the browser, split off the way `ui-measure.mjs` (browser) and
 * `ui-compare.mjs` (pure) are:
 *
 *   time       prints the code that starts the page's time (装时间): the page clock and the CSS animation timeline
 *              are both stopped at a fixed start, the page is reloaded, and a fixed run of steps lets it come up.
 *              Run it once after `browser_navigate` to the entry, before any interaction. From then on page time
 *              only moves when a step moves it, so the page is in the same place on every run however long the
 *              agent thinks between tool calls.
 *   step       prints the code that moves the page time on by N ms (拨一步): the page clock runs N ms and every
 *              animation that is still running is moved on N ms with it, so an animation plays to its end, fires its
 *              end event, just at a fixed page time. For waiting after an interaction.
 *   measure    prints the code the headless Playwright MCP runs (`browser_run_code_unsafe`): start the page time if
 *              `time` was not run, find what scrolls (the document when it is taller than the screen, else the biggest
 *              visible element with its own scroll: an app shell's <main>) and scroll it through once in fixed steps (lazy islands
 *              hydrate, entrances finish, fixed elements show where they appear), locate each section with the accessibility tree, box the top-level
 *              blocks (a `display: contents` wrapper is looked through), every heading and every clickable
 *              element with its full accessible name and whether a role + name finds it.
 *   attribute  measurement JSON → each section's range, which section each clickable element belongs to,
 *              the ones that fall in none ("落空"), the sections that could not be located, the ones that
 *              overlap. Exit 1 on any of them.
 *   shoot      attribution JSON → the code that shoots each section by itself: scroll to it, wait until its
 *              content has all appeared and stopped changing, shoot its range, one PNG per section,
 *              `<entry state id>@<section id>.png`. A tall section is one tall picture. The page time is not moved;
 *              each shot is taken twice, 500 ms of real time apart, and a shot whose two differ is `uncontrolled`
 *              (something the page time cannot hold is moving in it) and comes with the box where they differ.
 *   screen     a state with no sections (a page not taller than the main viewport): the code `shoot` runs, handed the one
 *              section that is the main viewport, `<state>.png`. No `measure` / `attribute` first; same `uncontrolled`.
 *
 * The browser side is covered by design-archive-sections-browser.test.mjs (skipped when no Chromium is
 * found) and by a real run; `attribute` and the target arithmetic are pure functions over data.
 *
 *   node design-archive-sections.mjs time <repo-root> [settings]
 *   node design-archive-sections.mjs step <ms>
 *   node design-archive-sections.mjs measure <repo-root> <entry-state> [--delta <spec-slug>] [--for <state> --section <id>] [settings]
 *   node design-archive-sections.mjs measure <repo-root> --state <entry-state> --page <page>
 *        (--sections '<json list>' | --sections-file <file>) [--for <state> --section <id>] [settings]
 *   node design-archive-sections.mjs attribute <measurement.json>
 *   node design-archive-sections.mjs shoot <attribution.json> --out <dir> [--section <id,id>] [--include '<json locator>']
 *   node design-archive-sections.mjs screen <repo-root> <state> --out <dir> [settings]
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
 * The page's time, as code for the browser. Two things keep a page moving: its clock (timers, requestAnimationFrame,
 * Date, performance.now) and the CSS animation timeline (animations and transitions, which no page clock governs).
 * Both are stopped at a fixed start and only move when `step` moves them, together: the clock runs N ms and every
 * animation still running is set N ms further on, so it plays to its end and fires its end event, at a fixed page time.
 * Whatever hovers, pauses or waits for an event keeps its own rules (a paused animation is not moved).
 *
 * Returned by a function with no arguments so it serialises into the code of `time`, `step`, `measure` and `shoot`
 * alike; the marker `page.__dsTime` (the page's CDP session) says the time was started on this tab.
 */
function timeKit() {
  const T0 = Date.UTC(2026, 0, 1);
  const START = 1000;
  const BOOT = { steps: 4, ms: 250 };
  const kit = {
    startsAt: new Date(T0 + START).toISOString(),
    ready: (page) => !!page.__dsTime,
    // the clock and the animation timeline stopped at the fixed start; the page has to be reloaded for its own scripts to run on it
    install: async (page) => {
      const ctx = page.context();
      await ctx.clock.install({ time: T0 });
      await ctx.clock.pauseAt(T0 + START);
      let cdp = page.__dsTime && page.__dsTime.cdp;
      const stop = async (c) => {
        await c.send('Animation.enable');
        await c.send('Animation.setPlaybackRate', { playbackRate: 0 });
      };
      try {
        await stop(cdp);
      } catch (e) {
        cdp = await ctx.newCDPSession(page);
        await stop(cdp);
      }
      page.__dsTime = { cdp };
    },
    // move the page time on by `ms`; with no page time started, real time passes instead
    step: async (page, ms) => {
      if (!page.__dsTime) {
        await page.waitForTimeout(ms);
        return;
      }
      await page.clock.runFor(ms);
      for (const f of page.frames()) {
        await f.evaluate(async (n) => {
          for (const a of document.getAnimations()) if (a.playState === 'running') a.currentTime = (a.currentTime ?? 0) + n;
          // two real frames: the end events of what was just moved are sent, and what they start has started
          const b = globalThis.__pwClock && (globalThis.__pwClock.builtins || globalThis.__pwClock.builtin);
          if (b && b.requestAnimationFrame) await Promise.race([new Promise((r) => b.requestAnimationFrame(() => b.requestAnimationFrame(r))), new Promise((r) => b.setTimeout(r, 300))]);
        }, ms).catch(() => {});
      }
    },
    // let a page that has just loaded come up: wait for what real time brings (network, fonts), then a fixed run of steps
    boot: async (page) => {
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch (e) {
        // a page that never goes quiet is started as it stands
      }
      await page.evaluate(() => document.fonts.ready);
      for (let i = 0; i < BOOT.steps; i += 1) await kit.step(page, BOOT.ms);
    },
  };
  return kit;
}

/** `time`: viewport and colours, the page time started, the page reloaded under it, a fixed run of steps. */
async function timePage(page, C, T) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  await T.install(page);
  await page.reload();
  await T.boot(page);
  return { installed: true, startsAt: T.startsAt, viewport: C.viewport, theme: C.theme, motion: C.motion };
}

/** `step`: move the page time on by `C.ms`. */
async function stepPage(page, C, T) {
  if (!T.ready(page)) throw new Error('页面时间还没装：先跑「装时间」（design-archive-sections.mjs time）再拨');
  await T.step(page, C.ms);
  return { stepped: C.ms };
}

/** What `shoot` needs of the time: only whether it was started. It never moves it, so the code that moves it is not in its code. */
function timeProbe() {
  return { ready: (page) => !!page.__dsTime };
}

/**
 * The picture-comparing half of a shot, as code for the browser: the one box, in the pictures' own pixels, that holds every
 * pixel where pairs of pictures (`{ a, b, y }`: two PNG buffers and the row the pair starts at in the finished picture) differ;
 * 'same' when no pixel does, undefined when it cannot be worked out. `shoot` and `pinned` both take a shot twice and need it.
 */
function diffKit() {
  return {
    boxOf: async (page, pairs) => {
      const tab = await page.context().newPage();
      try {
        return await tab.evaluate(async (items) => {
          const load = async (b64) => {
            const img = new Image();
            img.src = 'data:image/png;base64,' + b64;
            await img.decode();
            return img;
          };
          let x0 = Infinity;
          let y0 = Infinity;
          let x1 = -1;
          let y1 = -1;
          for (const it of items) {
            const [ia, ib] = [await load(it.a), await load(it.b)];
            const w = Math.max(ia.width, ib.width);
            const h = Math.max(ia.height, ib.height);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(ia, 0, 0);
            const da = g.getImageData(0, 0, w, h).data;
            g.clearRect(0, 0, w, h);
            g.drawImage(ib, 0, 0);
            const db = g.getImageData(0, 0, w, h).data;
            for (let y = 0; y < h; y += 1) {
              for (let x = 0; x < w; x += 1) {
                const o = (y * w + x) * 4;
                if (da[o] !== db[o] || da[o + 1] !== db[o + 1] || da[o + 2] !== db[o + 2] || da[o + 3] !== db[o + 3]) {
                  if (x < x0) x0 = x;
                  if (x > x1) x1 = x;
                  if (it.y + y < y0) y0 = it.y + y;
                  if (it.y + y > y1) y1 = it.y + y;
                }
              }
            }
          }
          return x1 < 0 ? 'same' : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
        }, pairs.map((x) => ({ a: x.a.toString('base64'), b: x.b.toString('base64'), y: x.y })));
      } catch (e) {
        return undefined;
      } finally {
        await tab.close();
      }
    },
  };
}

/** The text of a function `browser_run_code_unsafe` takes: `fn(page, C, T)` (and `D`, the picture kit, when asked for) with the kits built inside it. */
const withTime = (fn, C, kit = timeKit, withDiff = false) =>
  `async (page) => { const T = (${compact(kit)})(); ${withDiff ? `const D = (${compact(diffKit)})(); ` : ''}return (${compact(fn)})(page, ${JSON.stringify(C)}, T${withDiff ? ', D' : ''}); }`;

/** The code for `time`; `config` is `{ viewport: {width, height}, theme, motion }`. */
export function buildTimeCode(config) {
  return withTime(timePage, { viewport: config.viewport, theme: config.theme, motion: config.motion ?? 'default' });
}

/** The code for `step`: the page time on by `ms` milliseconds (a positive whole number, at most a minute). */
export function buildStepCode(ms) {
  if (!Number.isInteger(ms) || ms <= 0 || ms > 60000) throw new Error(`拨的毫秒数要是 1 到 60000 的整数（现在是 ${ms}）`);
  return withTime(stepPage, { ms });
}

/**
 * Runs inside the Playwright MCP's `browser_run_code_unsafe`, serialised with `toString()`, so it has
 * to stand alone: everything it needs arrives in `C` (the config), `T` (the time kit) or is created inside.
 * Returns the measurement `attribute` reads (and leaves it in `window.__dsMeasure`, where `browser_evaluate` with a
 * `filename` can save it). Positions are page coordinates in CSS pixels, taken at scroll 0.
 *
 * Where the old code waited in real time for the page to settle it now steps the page time by a fixed amount and looks again;
 * the steps and their number are constants, so every run takes the page through the same moments. Waiting for the network
 * and for fonts stays in real time: the page clock does not govern them. A state reached by interacting (`reload: false`) gets one
 * small step to finish drawing and no more: the carousel must not get the time to move off the state that was clicked.
 */
async function measurePage(page, C, T) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });

  // 1 the page time: started by `time` (kept), else started here — an entry state is reloaded under it, a state reached by interacting cannot be
  let clock;
  if (T.ready(page)) {
    clock = 'present: the page time was started by `time` and is stepped, not run';
  } else if (C.reload) {
    await T.install(page);
    await page.reload();
    await T.boot(page);
    clock = 'installed, page reloaded';
  } else {
    clock = '装晚了: the page time was not started before this state was reached, so timers and CSS animations the page started keep running and the picture of it is whatever moment it is shot at';
  }
  // a fixed step of page time; in a state reached by interacting no time moves (one small step above), but a CSS transition the scrolling starts is let finish
  const tick = async (ms) => {
    if (C.reload) await T.step(page, ms);
    else await page.evaluate(() => document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); }));
    await page.waitForTimeout(100);
  };
  if (!C.reload) await T.step(page, 100);

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
      pins: new Map(),
      seenText: (root) => {
        const box = root.getBoundingClientRect();
        const walk = (node) => {
          if (node.nodeType === 3) return node.nodeValue;
          if (node.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(node.tagName)) return '';
          const cs = getComputedStyle(node);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return '';
          const r = node.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom)) return '';
          return [...node.childNodes].map(walk).join(' ');
        };
        return ds.norm(walk(root));
      },
      samplePins: () => {
        const vh = ds.visibleHeight();
        const vw = window.innerWidth;
        const y = ds.scrollTop();
        for (const el of document.querySelectorAll('body *')) {
          if (ds.pins.has(el)) continue;
          const pos = getComputedStyle(el).position;
          const parent = el.parentElement;
          if (!parent || /^(BODY|HTML)$/.test(parent.tagName)) continue;
          if (pos !== 'sticky' && pos !== 'fixed' && !/pin-spacer/.test(String(parent.className))) continue;
          const r = el.getBoundingClientRect();
          if (parent.getBoundingClientRect().height < r.height + vh * 0.5) continue;
          // a pin that holds a screen is one by its size; a smaller one (a text column beside the pictures that scroll past) only when its text changes
          ds.pins.set(el, { samples: [], big: r.width >= vw * 0.5 && r.height >= vh * 0.5 });
        }
        for (const [el, pin] of ds.pins) {
          if (!el.isConnected) continue;
          const r = el.getBoundingClientRect();
          pin.tag = el.tagName.toLowerCase();
          pin.height = ds.px(r.height);
          pin.container = ds.box(el.parentElement);
          pin.samples.push({ y, pos: getComputedStyle(el).position, top: Math.round(r.top), text: ds.seenText(el) });
        }
      },
      pinText: (index) => ds.seenText([...ds.pins.keys()][index]),
      pinList: () => [...ds.pins.values()].flatMap((pin, index) => {
        const byTop = new Map();
        for (const s of pin.samples) if (s.pos === 'sticky' || s.pos === 'fixed') byTop.set(s.top, [...(byTop.get(s.top) || []), s]);
        const stuck = [...byTop.values()].sort((a, b) => b.length - a.length)[0] || [];
        const ys = [...new Set(stuck.map((s) => s.y))].sort((a, b) => a - b);
        const sticky = stuck.some((s) => s.pos === 'sticky');
        if (ys.length < 2 || (!sticky && !pin.samples.some((s) => s.pos !== 'fixed'))) return [];
        const texts = [...new Set(stuck.map((s) => s.text))];
        if (!pin.big && texts.length < 2) return [];
        // where each text was seen first: the measurement goes back there to check the text belongs to the place, not to the time
        const probes = pin.big ? [] : texts.slice(0, 4).map((t) => ({ y: stuck.find((s) => s.text === t).y, text: t }));
        return [{
          kind: sticky ? 'sticky' : 'fixed',
          tag: pin.tag,
          label: (texts[0] || '').slice(0, 40),
          height: pin.height,
          container: pin.container,
          stuck: { from: ys[0], to: ys[ys.length - 1], count: ys.length },
          texts: texts.slice(0, 6).map((t) => t.slice(0, 60)),
          ...(pin.big ? {} : { byText: true, index, probes }),
        }];
      }),
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

  // 3 scroll the page through once, in half-viewport steps (each followed by a fixed step of page time): lazy islands hydrate,
  //   scroll-triggered entrances finish, and a fixed element that only shows in one place is seen there. Islands hydrate after
  //   the load event and may swap their nodes, so wait for the page to go quiet first and identify a fixed element by
  //   its role, name and place among the same ones, not by a mark on the node.
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch (e) {
    // a page that never goes quiet is measured as it stands
  }
  await tick(500);
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
    await tick(200);
    const seen = await page.evaluate(() => {
      const ds = window.__ds;
      return ds.fixedList().flatMap(({ el, key }) => {
        const r = el.getBoundingClientRect();
        const on = ds.opacity(el) >= 0.01 && ds.shown(el) && r.bottom > 0 && r.top < window.innerHeight;
        return on ? [{ key, scrollY: ds.scrollTop(), top: ds.px(r.top), bottom: ds.px(r.bottom) }] : [];
      });
    });
    for (const f of seen) if (!appeared[f.key]) appeared[f.key] = { scrollY: f.scrollY, top: f.top, bottom: f.bottom };
    await page.evaluate(() => window.__ds.samplePins());
  }
  await page.evaluate(() => window.__ds.scrollTo(window.__ds.scrollHeight()));
  await tick(300);
  await page.evaluate(() => window.__ds.samplePins());
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
    await tick(500);
  }
  await page.evaluate(() => window.__ds.scrollTo(0));
  await page.evaluate(() => document.fonts.ready);
  await tick(300);

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
    const entry = { id: sec.id, locate: sec.locate, ...(sec.scrollDriven === true ? { declaredScrollDriven: true } : {}) };
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

  // 7 the pins the scroll-through saw, then clean the marks off
  // a pin too small to hold a screen counts when the text in it changed with the scroll — and changes the same way when the page goes back to the places
  // it was seen at (a banner that rotates its messages on a timer changes too, but not where the scroll put it)
  const pins = [];
  let probed = false;
  for (const { probes, index, ...pin } of await page.evaluate(() => window.__ds.pinList())) {
    let sameThere = true;
    for (const probe of pin.byText ? probes : []) {
      probed = true;
      await page.evaluate((v) => window.__ds.scrollTo(v), probe.y);
      await tick(200);
      if ((await page.evaluate((i) => window.__ds.pinText(i), index)) !== probe.text) {
        sameThere = false;
        break;
      }
    }
    if (sameThere) pins.push(pin);
  }
  if (probed) await page.evaluate(() => window.__ds.scrollTo(0));
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
    sections, pins, headings, clickables, env: base.env,
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
 *   `reload` lets the code start the page time itself and reload the page once when `time` was not run (an entry state);
 *   a state reached by interacting must not be reloaded, so there a page whose time was not started is reported as 装晚了.
 */
export function buildMeasureCode(config) {
  const C = {
    state: config.state ?? null,
    entry: config.entry ?? config.state ?? null,
    section: config.section ?? null,
    page: config.page ?? null,
    sections: config.sections.map((s) => ({ id: s.id, locate: s.locate, ...(s.scrollDriven === true ? { scrollDriven: true } : {}) })),
    viewport: config.viewport,
    theme: config.theme,
    motion: config.motion ?? 'default',
    reload: config.reload ?? true,
    clickSelector: CLICK_SELECTOR,
  };
  return withTime(measurePage, C);
}

/**
 * Shoots each target by itself, inside `browser_run_code_unsafe`. Per target: walk down the section
 * (lazy content, entrances), come back to its top, let the CSS transitions the scrolling started finish, wait until two shots of it,
 * 300 ms apart, are the same (images and fonts that real time brings have all arrived), shoot it and keep that shot,
 * wait 500 ms of real time and shoot it again. The page time is not moved at all (no step, no pause, no resume): with
 * it stopped the two shots differ only if something the page time cannot hold is moving in the picture (a video, a canvas
 * fed by a worker, a push over the network). Then the shot is `uncontrolled` and `diffBox` is the one box, in the
 * picture's own pixels, that holds every pixel where the two differ. The shots are `fullPage` with a `clip`, so the
 * clip is in page coordinates and may be taller than the viewport; they do not ask Playwright to settle animations
 * (its `animations` option set to disabled would fast-forward a finite CSS animation to its end and fire its end
 * event: a carousel moves on).
 *
 * When the page scrolls inside a container (the measurement's `scroller` is an element: an app shell whose
 * `<main>` scrolls) the page shot cannot reach what the container clips. A section inside it is shot a
 * screen at a time: the container scrolls one visible height, the visible part of the container is shot,
 * and the screens are put together into one picture as wide as the container; a bar pinned to the top of the
 * container is stood below on every screen. The stability check and the second shot cover all the screens
 * of a section. A section above the container (the shell's top bar) is a page shot as before.
 */
async function shootPage(page, C, T, D) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  const clock = T.ready(page) ? 'present: the page time is stopped, nothing here moves it' : '装晚了: the page time was never started on this tab (run `time` first), so what the page runs on its own moves while it is shot';
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
      const buf = await page.screenshot({ clip: { x: g.x, y: g.y + skip, width: g.width, height: rows } });
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
      await tab.locator('#s').screenshot({ path: file });
    } finally {
      await tab.close();
    }
  };
  const sameScreens = (a, b) => a.length === b.length && a.every((x, i) => x.buf.equals(b[i].buf));
  if (sc) {
    await must();
    await scrollIn(0);
  }
  const byIndex = [];
  const heightOf = async () => {
    if (!sc) return page.evaluate(() => document.documentElement.scrollHeight);
    const g = await boxIn();
    return contentTop + g.content;
  };
  // the sections that hold a screen while the page scrolls under them are shot last: each one puts the page time back at its fixed start and reloads
  const order = [...C.targets.filter((t) => !t.scrollDriven), ...C.targets.filter((t) => t.scrollDriven)];
  for (const t of order) {
    if (t.scrollDriven) {
      await T.install(page);
      // a reload gives the page back the scroll position it had, and a section that counts the scrolling it has seen would count it again
      await page.evaluate(() => {
        history.scrollRestoration = 'manual';
        window.scrollTo(0, 0);
      });
      await page.reload();
      await T.boot(page);
      if (sc) {
        await must();
        await scrollIn(Math.max(0, t.start - contentTop));
      } else {
        await scrollTo(t.start);
      }
      for (let i = 0; i < 8; i += 1) await T.step(page, 250);
      await page.waitForTimeout(100);
      await page.evaluate(() => document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); }));
      try {
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch (e) {
        // keep going: the stability check below is the one that decides
      }
      const view = { x: 0, y: 0, width: C.viewport.width, height: C.viewport.height };
      const snap = (path) => page.screenshot({ path, clip: view });
      let previous = await snap();
      let settled = false;
      for (let i = 0; i < 8 && !settled; i += 1) {
        await page.waitForTimeout(300);
        const current = await snap();
        settled = current.equals(previous);
        previous = current;
      }
      const kept = await snap(`${C.outDir}/${t.file}`);
      await page.waitForTimeout(500);
      const again = await snap();
      let uncontrolled = !kept.equals(again);
      let diffBox = null;
      if (uncontrolled) {
        diffBox = await D.boxOf(page, [{ a: kept, b: again, y: 0 }]);
        if (diffBox === 'same') uncontrolled = false;
      }
      byIndex[C.targets.indexOf(t)] = { id: t.id, file: t.file, y0: t.start, y1: t.end, width: view.width, height: view.height, settled, uncontrolled, ...(uncontrolled ? { diffBox: diffBox || { x: 0, y: 0, width: view.width, height: view.height } } : {}), scrollDriven: true, heightDrift: (await heightOf()) - C.pageHeight };
      continue;
    }
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
    // a CSS transition that scrolling started (a bar that changes once the page has moved) is taken to its end: the animation timeline does not run
    await page.evaluate(() => document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); }));
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
    const snap = (path) => page.screenshot({ path, fullPage: true, clip });
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
    // the shot that is kept, then — the page time not moved — the same shot again 500 ms of real time later: they differ only if something the page time cannot hold is moving
    const kept = await take(`${C.outDir}/${t.file}`);
    await page.waitForTimeout(500);
    const again = await take();
    let uncontrolled = !same(kept, again);
    let diffBox = null;
    if (uncontrolled) {
      const pairs = inside
        ? kept.map((x, k) => ({ a: x.buf, b: again[k] && again[k].buf, y: kept.slice(0, k).reduce((n, z) => n + z.rows, 0) })).filter((x) => x.b)
        : [{ a: kept, b: again, y: 0 }];
      diffBox = await D.boxOf(page, pairs);
      if (diffBox === 'same') uncontrolled = false;
    }
    if (inside) {
      if (!kept.length) throw new Error(t.id + ': the scroll container showed nothing to shoot');
      await stitch(kept, `${C.outDir}/${t.file}`);
    }
    const width = inside ? kept[0].width : C.viewport.width;
    const height = inside ? kept.reduce((n, x) => n + x.rows, 0) : bottom - top;
    byIndex[C.targets.indexOf(t)] = { id: t.id, file: t.file, y0: top, y1: bottom, width, height, ...(inside ? { screens: kept.length } : {}), settled, uncontrolled, ...(uncontrolled ? { diffBox: diffBox || { x: 0, y: 0, width, height } } : {}), ...(clipNote ? { note: clipNote } : {}), heightDrift: heightNow - C.pageHeight };
  }
  if (sc) await scrollIn(0);
  else await scrollTo(0);
  return { out: C.outDir, clock, shots: C.targets.map((t, i) => byIndex[i]) };
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
  return withTime(shootPage, C, C.targets.some((t) => t.scrollDriven) ? timeKit : timeProbe, true);
}

/**
 * Shoots the screen as it stands, inside `browser_run_code_unsafe`: no scrolling, no stepping of the page time, no reload. For a state inside a
 * scroll-driven section (the page was scrolled to a later step, or a wheel turned the next card up): the pinned screen is the viewport.
 * Waits until two shots 300 ms apart are the same, keeps one as `<state>.png`, takes another 500 ms of real time later, and
 * says `uncontrolled` with the box where they differ when something the page time cannot hold is moving in it — the same
 * signals as `shoot`, in the same shape.
 */
async function pinnedPage(page, C, T, D) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  const clock = T.ready(page) ? 'present: the page time is stopped, nothing here moves it' : '装晚了: the page time was never started on this tab (run `time` first), so what the page runs on its own moves while it is shot';
  await page.evaluate(() => document.fonts.ready);
  try {
    await page.waitForLoadState('networkidle', { timeout: 3000 });
  } catch (e) {
    // keep going: the stability check below is the one that decides
  }
  const view = { x: 0, y: 0, width: C.viewport.width, height: C.viewport.height };
  const snap = (path) => page.screenshot({ path, clip: view });
  let previous = await snap();
  let settled = false;
  for (let i = 0; i < 8 && !settled; i += 1) {
    await page.waitForTimeout(300);
    const current = await snap();
    settled = current.equals(previous);
    previous = current;
  }
  const file = C.file;
  const kept = await snap(`${C.outDir}/${file}`);
  await page.waitForTimeout(500);
  const again = await snap();
  let uncontrolled = !kept.equals(again);
  let diffBox = null;
  if (uncontrolled) {
    diffBox = await D.boxOf(page, [{ a: kept, b: again, y: 0 }]);
    if (diffBox === 'same') uncontrolled = false;
  }
  const scrolledTo = await page.evaluate(() => Math.round(window.scrollY));
  return { out: C.outDir, clock, shots: [{ id: C.state, file, scrollY: scrolledTo, width: view.width, height: view.height, settled, uncontrolled, ...(uncontrolled ? { diffBox: diffBox || { x: 0, y: 0, width: view.width, height: view.height } } : {}) }] };
}

/** The code for `pinned`: `state` is whose picture it is (the file is `<state>.png`). */
export function buildPinnedCode(config) {
  const C = { state: config.state, file: `${config.state}.png`, viewport: config.viewport, theme: config.theme, motion: config.motion ?? 'default', outDir: config.outDir };
  return withTime(pinnedPage, C, timeProbe, true);
}

/**
 * The shot a state with no sections asks for — a page that is not taller than the main viewport (the "single screen"
 * states: a login page with a carousel on its first screen). It is one section whose range is the main viewport,
 * and the picture is named after the state: `<state>.png`. Nothing is measured or attributed first.
 */
export function screenTargets({ state, viewport } = {}) {
  if (typeof state !== 'string' || !state || /[\\/]/.test(state) || state.startsWith('.')) throw new Error(`状态 id 不对（它会成为图的文件名）：${JSON.stringify(state ?? null)}`);
  if (!viewport || !(viewport.width > 0) || !(viewport.height > 0)) throw new Error('没有视口：单屏状态的范围是主视口');
  return { targets: [{ id: state, ref: state, file: `${state}.png`, start: 0, end: viewport.height, inScroller: false }], skipped: [], scroller: null, pageHeight: viewport.height };
}

/**
 * The code for `screen`: the code `shoot` runs, handed that one section — the same wait for images and fonts, the same
 * second shot 500 ms later, the same `uncontrolled` and `diffBox`. The page time is not moved and the page is not
 * given a style that switches animations off, so the picture is of the state as the stopped time leaves it.
 */
export function buildScreenCode(config) {
  const { targets, scroller, pageHeight } = screenTargets({ state: config.state, viewport: config.viewport });
  return buildShootCode({
    targets: targets.map(({ id, file, start, end, inScroller }) => ({ id, file, start, end, inScroller })),
    scroller,
    viewport: config.viewport,
    theme: config.theme,
    motion: config.motion,
    pageHeight,
    outDir: config.outDir,
  });
}

// ---------- ranges and ownership ----------

const roundPx = (v) => Math.round(v);

/**
 * Measurement → ranges, the section each clickable element belongs to, and what does not fit.
 *
 * Ranges (skills/design/design-archive/references/writing.md, 分段 `sections`): a section found by heading starts at the top of the
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

  const { scrollDriven, undeclaredScrollDriven, declaredNotDetected } = scrollDrivenOf(m.pins ?? [], found, ranges, ref);

  return {
    ok: orphans.length === 0 && notFound.length === 0 && outOfOrder.length === 0 && overlaps.length === 0 && undeclaredScrollDriven.length === 0,
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
    scrollDriven,
    undeclaredScrollDriven,
    declaredNotDetected,
    coverage: { gaps, overlaps },
  };
}

/**
 * Which sections are scroll-driven (skills/design/design-archive/references/shooting.md, 滚动驱动的段). The measurement lists
 * the pins it saw while the page was scrolled through (a `position: sticky` element, or a fixed one a library such as GSAP
 * pins, inside a container taller than itself, big enough to hold a screen — or smaller, when the text in it changed with the
 * scroll and changes the same way where the scroll is put back); a pin belongs to the section whose range
 * holds its container's vertical centre. A section is scroll-driven when a pin belongs to it. `declared` is the section's
 * `scrollDriven: true`. Detected but not declared fails the run (the section would be shot as one tall picture with blank
 * under the first step); declared but not detected is only a hint.
 */
function scrollDrivenOf(pins, found, ranges, ref) {
  const evidenceOf = (pin) => {
    const how = pin.kind === 'sticky' ? 'position: sticky' : '固定定位钉住（容器里的 fixed 元素）';
    const held = pin.stuck ? `，滚动 ${pin.stuck.from}–${pin.stuck.to} 之间钉在视口里` : '';
    const label = pin.label ? `「${pin.label}」` : '';
    const text = (pin.texts ?? []).length > 1 ? `；钉住时的可见文字随滚动变了（${pin.texts.length} 种）` : '';
    const small = pin.byText ? '；它不到半屏，按「钉住时的文字随滚动变了」认定' : '';
    return `${how} 的 <${pin.tag}>${label}高 ${roundPx(pin.height)}px，容器高 ${roundPx(pin.container.bottom - pin.container.top)}px${held}${text}${small}`;
  };
  const evidence = new Map();
  const pinTop = new Map(); // where the first pin of the section starts holding its screen: the top of its container
  for (const pin of pins) {
    const y = (pin.container.top + pin.container.bottom) / 2;
    const owner = ranges.find((r) => r.by !== 'landmark' && y >= r.start && y < r.end);
    if (owner) {
      evidence.set(owner.id, [...(evidence.get(owner.id) ?? []), evidenceOf(pin)]);
      pinTop.set(owner.id, Math.min(pinTop.get(owner.id) ?? Infinity, roundPx(pin.container.top)));
    }
  }
  const declaredIds = new Set(found.filter((s) => s.declaredScrollDriven === true).map((s) => s.id));
  const scrollDriven = ranges
    .filter((r) => evidence.has(r.id) || declaredIds.has(r.id))
    .map((r) => ({ id: r.id, ref: r.ref, detected: evidence.has(r.id), declared: declaredIds.has(r.id), evidence: evidence.get(r.id) ?? [], ...(pinTop.has(r.id) ? { pinTop: pinTop.get(r.id) } : {}) }));
  return {
    scrollDriven,
    undeclaredScrollDriven: scrollDriven.filter((x) => x.detected && !x.declared).map((x) => ({
      id: x.id, ref: x.ref, evidence: x.evidence,
      reason: `${x.id} 是滚动驱动的段（钉在视口里的内容随滚动变化），分段声明里没写：给它加 scrollDriven: true，并照 design-archive 的「拍档案截图」里的「滚动驱动的段」把每一步建成段内状态`,
    })),
    declaredNotDetected: scrollDriven.filter((x) => x.declared && !x.detected).map((x) => ({
      id: x.id, ref: x.ref, reason: `${x.id} 声明了 scrollDriven，但测量没检出钉在视口里的元素：按声明拍（只截段顶起一个视口高），确认这一段真是滚动驱动的`,
    })),
  };
}

// ---------- what to shoot ----------

/**
 * The shots an attribution asks for: `{ id, ref, file, start, end, inScroller }` per section, clipped to the page,
 * and the `scroller` the page was measured with. `inScroller` is true for a section that starts inside a
 * scroll container (not the document): that one is shot from the container, screen by screen.
 * A section declared `scrollDriven` is the one screen its pin holds: from the top of the pin's container (the section's top when the pin starts there)
 * for the viewport's height, `scrollDriven: true`.
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
  // a scroll-driven section of an entry state is shot as the one screen it holds at its top; a state inside it is shot as any section
  const pinned = new Map(inSection ? [] : (attribution.scrollDriven ?? []).filter((x) => x.declared).map((x) => [x.id, x.pinTop]));
  const screenHeight = attribution.viewport?.height;
  const targets = [];
  const skipped = [];
  for (const r of wanted) {
    let start = Math.max(0, r.start);
    let end = attribution.pageHeight ? Math.min(attribution.pageHeight, r.end) : r.end;
    if (end <= start) {
      skipped.push({ id: r.id, reason: `范围 ${r.start}–${r.end} 没有高度，或在页面（高 ${attribution.pageHeight}）之外` });
      continue;
    }
    const scrollDriven = pinned.has(r.id) && screenHeight > 0;
    if (scrollDriven) {
      // the screen it holds starts where the pin does: the section's top, or — when something comes before the pin in the section — the top of the pin's container
      const at = pinned.get(r.id);
      if (Number.isFinite(at) && at > start && at < end) start = at;
      end = start + screenHeight;
    }
    const inScroller = scroller?.kind === 'element' && start >= Math.round(scroller.top);
    targets.push({ id: r.id, ref: r.ref, file: inSection ? `${attribution.state}.png` : `${entry}@${r.id}.png`, start, end, inScroller, ...(scrollDriven ? { scrollDriven: true } : {}) });
  }
  return { targets, skipped, scroller };
}

// ---------- the command line ----------

/** The subcommands and the options each one takes — the docs' command lines are checked against this. */
export const COMMAND_FLAGS = {
  time: ['--viewport', '--theme', '--locale', '--motion'],
  step: [],
  measure: ['--delta', '--state', '--page', '--sections', '--sections-file', '--for', '--section', '--viewport', '--theme', '--locale', '--motion'],
  attribute: [],
  shoot: ['--out', '--section', '--include'],
  screen: ['--out', '--viewport', '--theme', '--locale', '--motion'],
  pinned: ['--out', '--viewport', '--theme', '--locale', '--motion'],
};

const USAGE = `用法：
  node design-archive-sections.mjs time <仓库根> [设置]
  node design-archive-sections.mjs step <毫秒数>
  node design-archive-sections.mjs measure <仓库根> <入口状态 id> [--delta <spec-slug>] [--for <段内状态 id> --section <段 id>] [设置]
  node design-archive-sections.mjs measure <仓库根> --state <入口状态 id> --page <页面> (--sections '<JSON 列表>' | --sections-file <文件>) [--for <段内状态 id> --section <段 id>] [设置]
  node design-archive-sections.mjs attribute <测量结果.json>
  node design-archive-sections.mjs shoot <归属结果.json> --out <目录> [--section <段 id,段 id>] [--include '<JSON 定位>']
  node design-archive-sections.mjs screen <仓库根> <状态 id> --out <目录> [设置]
  node design-archive-sections.mjs pinned <仓库根> <状态 id> --out <目录> [设置]
设置：--viewport 1440x900 --theme light|dark --locale zh-CN --motion default|reduce（默认取 docs/design/prod/index.md 的 frontmatter）
time / step / measure / shoot / screen / pinned 打印交给 Playwright MCP「执行一段代码」的代码；attribute 有落空、定位失败、顺序不对、重叠，或检出了滚动驱动的段而分段声明里没写 scrollDriven 时退出码 1。
time（装时间）：在 browser_navigate 到入口之后、做任何交互之前跑一次；step（拨一步）：交互之后等界面变化时用；
screen：不分段的单屏状态，先滚到页顶再截主视口，不用先 measure / attribute；
pinned：滚动驱动的段里第 2 步起的状态，到了这一步之后不滚动、不拨时间，直接截当前视口，图叫 <状态 id>.png。`;

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

function timeCommand(positional, flags) {
  if (!positional.length) throw new UsageError('缺少仓库根');
  if (positional.length > 1) throw new UsageError(`time 只要一个仓库根（多出 ${positional.slice(1).join(' ')}）`);
  const root = resolve(positional[0]);
  if (!existsSync(join(root, 'docs'))) throw new UsageError(`${root} 下没有 docs/：这不是目标仓库的根`);
  let archive;
  try {
    archive = loadArchive(root);
  } catch (e) {
    throw new UsageError(e.message);
  }
  const settings = settingsOf(archive, flags);
  console.log(buildTimeCode(settings));
  console.error(`time: 视口 ${settings.viewport.width}×${settings.viewport.height}，${settings.theme}，motion ${settings.motion}${settings.locale ? `，语言 ${settings.locale}（浏览器要先按这个语言打开页面）` : ''}；在 browser_navigate 到入口之后、做任何交互之前跑一次：页面时钟和 CSS 动画时间线停在固定的起点，重载一次，再按固定步长拨一段让页面起来。之后页面时间只在 step 和 measure 里按固定步长走`);
  return 0;
}

function stepCommand(positional) {
  if (positional.length !== 1) throw new UsageError('step 要一个毫秒数（拨多少页面时间）');
  const ms = /^\d+$/.test(positional[0]) ? Number(positional[0]) : NaN;
  let code;
  try {
    code = buildStepCode(ms);
  } catch (e) {
    throw new UsageError(`step 的毫秒数不对：${e.message}`);
  }
  console.log(code);
  console.error(`step: 页面时间往前拨 ${ms} 毫秒（页面时钟和还在播的动画一起）；要先跑过 time`);
  return 0;
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
    if (s.scrollDriven !== undefined && s.scrollDriven !== true) throw new UsageError(`第 ${i + 1} 段（${s.id}）的 scrollDriven 只能写 true（现在是 ${JSON.stringify(s.scrollDriven)}）`);
    return { id: s.id, locate: s.locate, ...(s.scrollDriven === true ? { scrollDriven: true } : {}) };
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
  console.error(`measure: ${sections.length} 段，视口 ${settings.viewport.width}×${settings.viewport.height}，${settings.theme}，motion ${settings.motion}${settings.locale ? `，语言 ${settings.locale}（浏览器要先按这个语言打开页面）` : ''}${flags.for ? `；给段内状态 ${state}（在 ${section} 段）量，不重载页面，只拨一小步让界面画完（页面时间要是 time 装好的，没装就说「装晚了」）` : '；页面时间 time 装过就不再装，没装过的自己装并重载一次页面'}；结果也留在 window.__dsMeasure，用 browser_evaluate 的 filename 存成文件`);
  return 0;
}

function pinnedCommand(positional, flags) {
  if (!positional.length) throw new UsageError('缺少仓库根');
  if (positional.length < 2) throw new UsageError('缺少状态 id（图叫 <状态 id>.png）');
  if (positional.length > 2) throw new UsageError(`pinned 只要仓库根和一个状态 id（多出 ${positional.slice(2).join(' ')}）`);
  if (!flags.out) throw new UsageError('pinned 要 --out <目录>（Playwright 只能写它的工作区根目录里）');
  const root = resolve(positional[0]);
  if (!existsSync(join(root, 'docs'))) throw new UsageError(`${root} 下没有 docs/：这不是目标仓库的根`);
  let archive;
  try {
    archive = loadArchive(root);
  } catch (e) {
    throw new UsageError(e.message);
  }
  const settings = settingsOf(archive, flags);
  const out = resolve(flags.out);
  console.log(buildPinnedCode({ state: positional[1], viewport: settings.viewport, theme: settings.theme, motion: settings.motion, outDir: out }));
  console.error(`pinned: ${positional[1]}.png 写到 ${out}（视口 ${settings.viewport.width}×${settings.viewport.height}，${settings.theme}，motion ${settings.motion}${settings.locale ? `，语言 ${settings.locale}` : ''}）；不滚动、不拨页面时间，截此刻的视口——先把页面带到这一步，再跑`);
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
  for (const x of result.declaredNotDetected) console.error(`attribute: ${x.id} 声明了 scrollDriven 但测量没检出钉住的元素（只提示）：按声明拍，确认这一段真是滚动驱动的`);
  for (const x of result.undeclaredScrollDriven) console.error(`attribute: ${x.id} 是滚动驱动的段（${x.evidence.join('；')}），分段声明里没写：给它加 scrollDriven: true，并照 design-archive 的「拍档案截图」里的「滚动驱动的段」把每一步建成段内状态`);
  if (!result.ok) {
    console.error(`attribute: 落空 ${result.orphans.length} 个，定位失败 ${result.notFound.length} 段，顺序不对 ${result.outOfOrder.length} 段，重叠 ${result.overlaps.length} 处，滚动驱动没声明 ${result.undeclaredScrollDriven.length} 段——补分段、改定位或补 scrollDriven 后重测，清零再写档案`);
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
  if (attribution.ok === false) {
    const lost = (attribution.undeclaredScrollDriven ?? []).map((x) => x.id);
    throw new UsageError(`归属结果没通过（有落空、定位失败、顺序不对或重叠${lost.length ? `；滚动驱动的段 ${lost.join('、')} 没写 scrollDriven` : ''}）：补分段后重测，清零了再拍`);
  }
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
    // `scrollDriven` goes along: it is what makes the shot reload and scroll straight to the pin instead of through the page
    targets: picked.targets.map(({ id, file, start, end, inScroller, scrollDriven }) => ({ id, file, start, end, inScroller, ...(scrollDriven ? { scrollDriven: true } : {}) })),
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

function screenCommand(positional, flags) {
  if (!positional.length) throw new UsageError('缺少仓库根');
  if (positional.length < 2) throw new UsageError('缺少状态 id（要拍的单屏状态）');
  if (positional.length > 2) throw new UsageError(`screen 只要一个仓库根和一个状态 id（多出 ${positional.slice(2).join(' ')}）`);
  if (!flags.out) throw new UsageError('screen 要 --out <目录>（Playwright 只能写它的工作区根目录里）');
  const root = resolve(positional[0]);
  if (!existsSync(join(root, 'docs'))) throw new UsageError(`${root} 下没有 docs/：这不是目标仓库的根`);
  let archive;
  try {
    archive = loadArchive(root);
  } catch (e) {
    throw new UsageError(e.message);
  }
  const settings = settingsOf(archive, flags);
  const outDir = resolve(flags.out);
  let code;
  let file;
  try {
    file = screenTargets({ state: positional[1], viewport: settings.viewport }).targets[0].file;
    code = buildScreenCode({ state: positional[1], viewport: settings.viewport, theme: settings.theme, motion: settings.motion, outDir });
  } catch (e) {
    throw new UsageError(e.message);
  }
  console.log(code);
  console.error(`screen: 1 张（${file}）写到 ${outDir}；范围是主视口 ${settings.viewport.width}×${settings.viewport.height}，${settings.theme}，motion ${settings.motion}${settings.locale ? `，语言 ${settings.locale}（浏览器要先按这个语言打开页面）` : ''}；页面时间要是装过时间（time）的，到了这个状态再拍，拍的时候不拨时间；返回里 uncontrolled 为 true 的，页面时间管不到的东西在动，diffBox 是哪一块`);
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
    if (command === 'time') return timeCommand(positional, flags);
    if (command === 'step') return stepCommand(positional);
    if (command === 'measure') return measureCommand(positional, flags);
    if (command === 'attribute') return attributeCommand(positional);
    if (command === 'shoot') return shootCommand(positional, flags);
    if (command === 'screen') return screenCommand(positional, flags);
    if (command === 'pinned') return pinnedCommand(positional, flags);
    return 2;
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    console.error(USAGE);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv));
