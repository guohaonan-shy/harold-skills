/**
 * The browser side of the sections script, run for real: the code `measure` and `shoot` print, handed a
 * Playwright page that shows a small page built to have the shapes the code has to cope with — sections
 * wrapped in `display: contents` islands, a heading with a line break in it, a fixed table of contents that
 * only fades in at the second section, a see-through button, a native <summary>, a counter that ticks by
 * itself. Playwright and a Chromium are looked up where this machine has them (the project's own
 * node_modules, the npx cache the plugin's Playwright MCP uses, the Playwright browser cache); with none
 * found the tests are skipped, not failed.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attribute, buildMeasureCode, buildPinnedCode, buildScreenCode, buildShootCode, buildStepCode, buildTimeCode, shootTargets } from './design-archive-sections.mjs';
import { comparePngs, decodePng } from './ui-png-compare.mjs';

const home = homedir();
const dirs = (p) => (existsSync(p) && statSync(p).isDirectory() ? readdirSync(p).map((n) => join(p, n)) : []);

function findPlaywright() {
  const cores = [];
  try {
    cores.push(createRequire(join(process.cwd(), 'noop.js')).resolve('playwright-core'));
  } catch (e) {
    // not installed in the project
  }
  for (const d of dirs(join(home, '.npm', '_npx'))) {
    const core = join(d, 'node_modules', 'playwright-core');
    if (existsSync(core)) cores.push(core);
  }
  const caches = [join(home, 'Library', 'Caches', 'ms-playwright'), join(home, '.cache', 'ms-playwright')];
  const exes = caches.flatMap(dirs)
    .filter((d) => /chromium_headless_shell-/.test(d))
    .sort()
    .reverse()
    .flatMap((d) => dirs(d))
    .flatMap((d) => dirs(d).filter((f) => /chrome-headless-shell$/.test(f)));
  return { cores, exes };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px sans-serif; }
  header { height: 60px; background: #eee; }
  main > * { display: block; }
  .band { padding: 20px; box-sizing: border-box; }
  #hero { height: 700px; background: #fdd; }
  #demo { height: 1500px; background: #dfd; }
  #faq { height: 500px; background: #ddf; }
  footer { height: 100px; background: #ccc; }
  #toc { position: fixed; left: 0; top: 300px; opacity: 0; transition: opacity .2s; }
  #ghost { opacity: 0; }
</style></head><body>
<header><a href="/">Home</a></header>
<nav id="toc"><a href="#demo">Toc one</a></nav>
<main>
  <astro-island style="display: contents"><section class="band" id="hero"><h1>Read one,<br>answer it.</h1><button>Start</button><div id="tick">0</div></section></astro-island>
  <astro-island style="display: contents"><section class="band" id="demo"><h2>Try it</h2><details><summary>What is this</summary><p>An answer.</p></details><a href="/x">Open the demo</a></section></astro-island>
  <section class="band" id="faq"><h2>Questions</h2><button id="ghost">Ghost</button></section>
</main>
<footer><a href="/terms">Terms</a></footer>
<script>
  let n = 0; setInterval(() => { document.getElementById('tick').textContent = String(++n); }, 40);
  addEventListener('scroll', () => { document.getElementById('toc').style.opacity = scrollY > 500 ? '1' : '0'; });
</script></body></html>`;

const SECTIONS = [
  { id: 'header', locate: { role: 'banner' } },
  { id: 'hero', locate: { role: 'heading', name: 'Read one, answer it.' } },
  { id: 'demo', locate: { role: 'heading', name: 'Try it' } },
  { id: 'faq', locate: { role: 'heading', name: 'Questions' } },
  { id: 'footer', locate: { role: 'contentinfo' } },
];
const SETTINGS = { viewport: { width: 800, height: 600 }, theme: 'light', motion: 'default' };

let browser = null;
let page = null;
let skip = 'no Playwright with a Chromium found on this machine';

before(async () => {
  const { cores, exes } = findPlaywright();
  for (const core of cores) {
    for (const exe of [undefined, ...exes]) {
      try {
        const { chromium } = createRequire(core + '/')(core);
        browser = await chromium.launch(exe ? { executablePath: exe } : {});
        page = await (await browser.newContext()).newPage();
        skip = false;
        return;
      } catch (e) {
        browser = null;
      }
    }
  }
});
after(async () => {
  if (browser) await browser.close();
});

const browserTest = (name, fn) =>
  test(name, async (t) => {
    if (skip) return t.skip(skip);
    return fn(t);
  });

const dataUrl = () => `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`;
const runCode = (code) => (0, eval)(code)(page);
const pngSize = (file) => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

let measured = null;
async function measure() {
  if (measured) return measured;
  await page.goto(dataUrl());
  measured = await runCode(buildMeasureCode({ state: 'mkt-home--entry', page: 'mkt-home', sections: SECTIONS, ...SETTINGS }));
  return measured;
}

browserTest('browser measure: a display: contents wrapper is looked through — the blocks are the sections inside it, and the section bounds fall on their edges', async () => {
  const m = await measure();
  assert.deepEqual(m.blocks.map((b) => [b.top, b.bottom]), [[60, 760], [760, 2260], [2260, 2760]]);
  const a = attribute(m);
  assert.deepEqual(a.ranges.map((r) => [r.id, r.start, r.end]), [['header', 0, 60], ['hero', 60, 760], ['demo', 760, 2260], ['faq', 2260, 2760], ['footer', 2760, 2860]]);
  assert.equal(a.ok, true, JSON.stringify([a.orphans, a.notFound, a.overlaps]));
});

browserTest('browser measure: headings and clickables come with their full accessible names, and the page clock was put under the page', async () => {
  const m = await measure();
  assert.match(m.clock, /reloaded/);
  assert.deepEqual(m.headings.map((h) => [h.name, h.byRole, h.matches]), [['Read one, answer it.', true, 1], ['Try it', true, 1], ['Questions', true, 1]]);
  assert.ok(m.clickables.some((c) => c.name === 'Open the demo' && c.byRole && c.matches === 1));
});

browserTest('browser measure: a native <summary> that role + name cannot find is reported as such, with how many places its text is found', async () => {
  const a = attribute(await measure());
  assert.deepEqual(a.roleUnresolved.map((x) => [x.name, x.section, x.textMatches]), [['What is this', 'demo', 1]]);
});

browserTest('browser measure: a see-through button belongs to no section and is not an orphan; a fixed one belongs to where it showed up', async () => {
  const a = attribute(await measure());
  assert.deepEqual(a.hidden.map((h) => h.name), ['Ghost']);
  assert.equal(a.orphans.length, 0);
  const toc = a.clickables.find((c) => c.name === 'Toc one');
  assert.equal(toc.fixed, true);
  assert.equal(toc.section, 'demo', `at scroll 0 it sits at y 300, in hero; it only shows once the page has scrolled to demo: ${JSON.stringify(toc)}`);
});

browserTest('browser shoot: one picture per section, each as tall as its range — the 1500-tall one whole, taller than the 600 viewport', async () => {
  const a = attribute(await measure());
  const out = mkdtempSync(join(tmpdir(), 'sections-shoot-'));
  const { targets } = shootTargets(a);
  const r = await runCode(buildShootCode({ targets, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
  assert.deepEqual(r.shots.map((s) => s.file), ['mkt-home--entry@header.png', 'mkt-home--entry@hero.png', 'mkt-home--entry@demo.png', 'mkt-home--entry@faq.png', 'mkt-home--entry@footer.png']);
  const sizes = Object.fromEntries(r.shots.map((s) => [s.id, pngSize(join(out, s.file))]));
  assert.deepEqual(sizes, { header: [800, 60], hero: [800, 700], demo: [800, 1500], faq: [800, 500], footer: [800, 100] });
});

browserTest('browser shoot: the page time does not move for the shot — a counter that ticks by itself is settled at once, is not flagged, and stands still after the shot too', async () => {
  const a = attribute(await measure());
  const out = mkdtempSync(join(tmpdir(), 'sections-shoot-'));
  const { targets } = shootTargets(a, { only: ['hero'] });
  const tick = () => page.evaluate(() => document.getElementById('tick').textContent);
  const before = await tick();
  const r = await runCode(buildShootCode({ targets, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
  const [hero] = r.shots;
  assert.equal(hero.settled, true, 'with the page time stopped, two shots 300 ms apart are the same');
  assert.equal(hero.uncontrolled, false);
  assert.equal(hero.diffBox, undefined);
  assert.equal(hero.stable, undefined, '`stable` is gone: `uncontrolled` says it');
  assert.equal(hero.clockFrozen, undefined);
  await page.waitForTimeout(300);
  assert.equal(await tick(), before, 'nothing was stepped, nothing was resumed');
});

browserTest('browser shoot: a bar pinned to the top of the screen does not cover the first rows of a section — the section is stood just below it', async () => {
  const a = attribute(await measure());
  const out = mkdtempSync(join(tmpdir(), 'sections-shoot-'));
  await page.evaluate(() => {
    const bar = document.createElement('div');
    bar.id = 'pinned';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:50px;background:rgb(0,0,0);z-index:9';
    document.body.appendChild(bar);
  });
  const { targets } = shootTargets(a, { only: ['faq'] });
  const r = await runCode(buildShootCode({ targets, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
  const img = decodePng(readFileSync(join(out, r.shots[0].file)));
  const px = (y) => [...img.data.subarray(y * img.width * 4, y * img.width * 4 + 3)];
  assert.deepEqual(px(5), [221, 221, 255], 'the faq band, not the black bar');
  assert.deepEqual([img.width, img.height], [800, 500]);
  await page.evaluate(() => document.getElementById('pinned').remove());
});

browserTest('browser shoot: --include widens a section\'s shot to cover an overlay that runs out of it', async () => {
  const a = attribute(await measure());
  const out = mkdtempSync(join(tmpdir(), 'sections-shoot-'));
  await page.evaluate(() => {
    const m = document.createElement('div');
    m.id = 'menu';
    m.setAttribute('role', 'menu');
    m.style.cssText = 'position:absolute;left:0;top:40px;height:120px;width:200px;background:#fc0';
    document.body.appendChild(m);
  });
  const { targets } = shootTargets(a, { only: ['header'] });
  const r = await runCode(buildShootCode({ targets, ...SETTINGS, pageHeight: a.pageHeight, outDir: out, include: { role: 'menu' } }));
  assert.deepEqual(pngSize(join(out, r.shots[0].file)), [800, 160], 'the header is 60 tall, the menu reaches y 160');
});

// ---------- an app shell: the document is one screen tall, the content scrolls inside <main> ----------
//
//   800×600 viewport · shell 100vh · bar 60 tall · <main> scrolls and holds three bands, 700 / 900 / 500 tall
//   (page coordinates with <main> at the top: bar 0–60, bands 60–760, 760–1660, 1660–2160)

const shellPage = ({ sidebar = false, sticky = false } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px sans-serif; }
  .shell { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  header { height: 60px; flex: none; background: #eee; }
  .row { flex: 1; min-height: 0; display: flex; }
  aside { width: 200px; flex: none; background: #999; }
  main { flex: 1; overflow-y: auto; }
  main section { padding: 20px; box-sizing: border-box; }
  #a { height: 700px; background: #fdd; }
  #b { height: 900px; background: #dfd; }
  #c { height: 500px; background: #ddf; }
  .bar { position: sticky; top: 0; height: 40px; background: rgb(0, 0, 0); z-index: 5; }
</style></head><body><div class="shell">
<header><a href="/">Home</a></header>
<div class="row">
${sidebar ? '<aside><a href="/s">Side link</a></aside>' : ''}
<main>${sticky ? '<div class="bar"></div>' : ''}
  <section id="a"><h1>Practice</h1><button>Start</button><div id="box" style="width:200px;height:100px;overflow-y:auto"><div style="height:300px"></div></div></section>
  <section id="b"><h2>History</h2><a href="/item">Open item</a></section>
  <section id="c"><h2>Settings</h2><button>Save</button></section>
</main></div></div></body></html>`;

const SHELL_SECTIONS = [
  { id: 'header', locate: { role: 'banner' } },
  { id: 'hero', locate: { role: 'heading', name: 'Practice' } },
  { id: 'list', locate: { role: 'heading', name: 'History' } },
  { id: 'form', locate: { role: 'heading', name: 'Settings' } },
];
const STICKY_SECTIONS = [SHELL_SECTIONS[0], { id: 'toolbar', locate: { position: 1 } }, ...SHELL_SECTIONS.slice(1)];

const shellMeasured = new Map();
async function measureShell(variant = {}, sections = SHELL_SECTIONS) {
  const key = JSON.stringify(variant);
  if (!shellMeasured.has(key)) {
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(shellPage(variant))}`);
    shellMeasured.set(key, await runCode(buildMeasureCode({ state: 'app-home--entry', page: 'app-home', sections, ...SETTINGS })));
  }
  return shellMeasured.get(key);
}
const shootShell = async (variant, a, only = null) => {
  // the page has to be on screen as measured, with the scroll container back at the top
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(shellPage(variant))}`);
  const out = mkdtempSync(join(tmpdir(), 'sections-shoot-'));
  const { targets, scroller } = shootTargets(a, { only });
  const r = await runCode(buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
  return { out, r };
};
const pixelAt = (file, y, x = 0) => {
  const img = decodePng(readFileSync(file));
  return [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
};

browserTest('browser measure: when the document does not scroll, the scroll container is the biggest visible element that does — its content height is the page height', async () => {
  const m = await measureShell();
  assert.equal(m.scroller.kind, 'element');
  assert.equal(m.scroller.tag, 'main');
  assert.equal(await page.evaluate((sel) => document.querySelector(sel).tagName, m.scroller.selector), 'MAIN', 'the selector finds the same element again');
  assert.deepEqual([m.scroller.top, m.scroller.contentHeight, m.scroller.visibleHeight], [60, 2100, 540]);
  assert.equal(m.pageSize.height, 2160);
});

browserTest('browser measure: the ranges of an app shell are inside the page, and a button below the first screen belongs to its section', async () => {
  const a = attribute(await measureShell());
  assert.deepEqual(a.ranges.map((r) => [r.id, r.start, r.end]), [['header', 0, 60], ['hero', 60, 760], ['list', 760, 1660], ['form', 1660, 2160]]);
  assert.equal(a.clickables.find((c) => c.name === 'Save').section, 'form');
  assert.equal(a.ok, true, JSON.stringify([a.orphans, a.notFound, a.overlaps, a.outOfOrder]));
  assert.equal(a.pageHeight, 2160);
  assert.equal(a.scroller.kind, 'element');
});

browserTest('browser measure: the other scrollable candidates are listed, not chosen', async () => {
  const m = await measureShell();
  assert.deepEqual(m.scroller.others.map((o) => [o.selector, o.contentHeight, o.visibleHeight]), [['#box', 300, 100]]);
});

browserTest('browser measure: a document that scrolls is the scroll container whatever scrolls inside it — the page of the first tests', async () => {
  const m = await measure();
  assert.equal(m.scroller.kind, 'document');
  assert.equal(m.pageSize.height, 2860);
});

browserTest('browser shoot: an app shell gives one picture per section — the bar as a page shot, each band stitched from the screens of <main>, with no blank rows', async () => {
  const a = attribute(await measureShell());
  const { out, r } = await shootShell({}, a);
  assert.deepEqual(r.shots.map((s) => s.file), ['app-home--entry@header.png', 'app-home--entry@hero.png', 'app-home--entry@list.png', 'app-home--entry@form.png']);
  const sizes = Object.fromEntries(r.shots.map((s) => [s.id, pngSize(join(out, s.file))]));
  assert.deepEqual(sizes, { header: [800, 60], hero: [800, 700], list: [800, 900], form: [800, 500] });
  const list = join(out, 'app-home--entry@list.png');
  for (const y of [10, 450, 890]) assert.deepEqual(pixelAt(list, y), [221, 255, 221], `row ${y} of the list band`);
  const form = join(out, 'app-home--entry@form.png');
  for (const y of [10, 250, 490]) assert.deepEqual(pixelAt(form, y), [221, 221, 255], `row ${y} of the settings band`);
  assert.deepEqual(pixelAt(join(out, 'app-home--entry@header.png'), 30), [238, 238, 238]);
  assert.equal(r.shots.find((s) => s.id === 'list').uncontrolled, false);
});

browserTest('browser shoot: a bar that sticks to the top of the scroll container does not cover the first rows of a band — every screen of the band is stood below it', async () => {
  const a = attribute(await measureShell({ sticky: true }, STICKY_SECTIONS));
  assert.deepEqual(a.ranges.map((r) => [r.id, r.start, r.end]), [['header', 0, 60], ['toolbar', 60, 100], ['hero', 100, 800], ['list', 800, 1700], ['form', 1700, 2200]]);
  const { out, r } = await shootShell({ sticky: true }, a, ['list']);
  const file = join(out, r.shots[0].file);
  assert.deepEqual(pngSize(file), [800, 900]);
  for (const y of [0, 5, 460, 880]) assert.deepEqual(pixelAt(file, y), [221, 255, 221], `row ${y}: the band, not the black bar`);
});

browserTest('browser shoot: the picture of a band in the scroll container is as wide as the container — a sidebar next to it is not in it', async () => {
  const a = attribute(await measureShell({ sidebar: true }));
  assert.equal(a.ok, true, JSON.stringify([a.orphans, a.notFound, a.overlaps]));
  const { out, r } = await shootShell({ sidebar: true }, a);
  const sizes = Object.fromEntries(r.shots.map((s) => [s.id, pngSize(join(out, s.file))]));
  assert.deepEqual(sizes, { header: [800, 60], hero: [600, 700], list: [600, 900], form: [600, 500] });
  assert.deepEqual(pixelAt(join(out, 'app-home--entry@list.png'), 450, 0), [221, 255, 221]);
});

// ---------- the page body scrolls: <html> is locked at the screen height, <body> scrolls and holds everything ----------
//
//   800×600 viewport · <html> height 100% and overflow hidden · <body> height 100% and overflow-y auto ·
//   a bar 60 tall, then three bands 700 / 900 / 500 tall — the same page coordinates as the app shell above

const bodyPage = () => `<!doctype html><html lang="en" style="height:100%;overflow:hidden"><head><meta charset="utf-8"><style>
  body { margin: 0; height: 100%; overflow-y: auto; font: 16px sans-serif; }
  header { height: 60px; background: #eee; }
  main section { padding: 20px; box-sizing: border-box; }
  #a { height: 700px; background: #fdd; }
  #b { height: 900px; background: #dfd; }
  #c { height: 500px; background: #ddf; }
</style></head><body>
<header><a href="/">Home</a></header>
<main>
  <section id="a"><h1>Practice</h1></section>
  <section id="b"><h2>History</h2></section>
  <section id="c"><h2>Settings</h2><button>Save</button></section>
</main></body></html>`;

let bodyMeasured = null;
async function measureBody() {
  if (!bodyMeasured) {
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(bodyPage())}`);
    bodyMeasured = await runCode(buildMeasureCode({ state: 'app-home--entry', page: 'app-home', sections: SHELL_SECTIONS, ...SETTINGS }));
  }
  return bodyMeasured;
}

browserTest('browser measure: a page whose <html> is locked and whose <body> scrolls has <body> as its scroll container — the page height is all the content', async () => {
  const m = await measureBody();
  assert.equal(m.scroller.kind, 'element');
  assert.equal(m.scroller.tag, 'body');
  assert.deepEqual([m.scroller.top, m.scroller.contentHeight, m.scroller.visibleHeight], [0, 2160, 600]);
  assert.equal(m.pageSize.height, 2160);
  const a = attribute(m);
  assert.deepEqual(a.ranges.map((r) => [r.id, r.start, r.end]), [['header', 0, 60], ['hero', 60, 760], ['list', 760, 1660], ['form', 1660, 2160]]);
  assert.equal(a.clickables.find((c) => c.name === 'Save').section, 'form');
  assert.equal(a.ok, true, JSON.stringify([a.orphans, a.notFound, a.overlaps, a.outOfOrder]));
});

browserTest('browser shoot: a page that scrolls in <body> gives one whole picture per section', async () => {
  const a = attribute(await measureBody());
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(bodyPage())}`);
  const out = mkdtempSync(join(tmpdir(), 'sections-shoot-'));
  const { targets, scroller, skipped } = shootTargets(a);
  assert.deepEqual(skipped, []);
  const r = await runCode(buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
  const sizes = Object.fromEntries(r.shots.map((s) => [s.id, pngSize(join(out, s.file))]));
  assert.deepEqual(sizes, { header: [800, 60], hero: [800, 700], list: [800, 900], form: [800, 500] });
  const list = join(out, 'app-home--entry@list.png');
  for (const y of [10, 450, 890]) assert.deepEqual(pixelAt(list, y), [221, 255, 221], `row ${y} of the list band`);
  assert.deepEqual(pixelAt(join(out, 'app-home--entry@header.png'), 30), [238, 238, 238]);
});

// ---------- the page time stands still: two runs a few seconds apart give the same pictures ----------
//
//   800×600 viewport · a bar 60 tall, then six sections:
//   static 400 · demo 340 (an iframe whose own script moves a box on requestAnimationFrame and counts on a
//   setTimeout chain) · tabs 300 (every 2 s a setInterval switches the tab, paused while the mouse is over the
//   list) · css 300 (a 3 s progress line per tab; when it ends — `animationend` — the next tab is shown; paused
//   while the mouse is over the list) · live 200 (a Worker counts real milliseconds: nothing the page clock or the
//   animation timeline can hold) · a footer of 100

const IFRAME = `<body style="margin:0;background:#fff"><div id="b" style="position:absolute;top:40px;width:80px;height:80px;background:#06c"></div><p id="t" style="position:absolute;top:140px;margin:0;font:20px sans-serif">0</p><p id="n" style="position:absolute;top:180px;margin:0;font:20px sans-serif">0</p><script>
const t0 = performance.now();
(function f() { const p = ((performance.now() - t0) % 20000) / 20000; b.style.left = (p * 600) + 'px'; t.textContent = 'frame ' + Math.floor(p * 40); requestAnimationFrame(f); })();
let k = 0; (function g() { n.textContent = 'step ' + (k++); setTimeout(g, 700); })();
</script></body>`;

const UNSTABLE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px sans-serif; }
  header { height: 60px; background: #eee; }
  main > section { display: block; box-sizing: border-box; padding: 20px; }
  #static { height: 400px; background: #fee; }
  #demo { height: 340px; background: #efe; }
  #tabs { height: 300px; background: #eef; }
  #css { height: 300px; background: #efe; }
  #live { height: 200px; background: #ffe; }
  footer { height: 100px; background: #ccc; }
  .tab, .c { display: inline-block; width: 120px; height: 36px; margin: 0 4px 0 0; padding: 0; border: 0; background: #fff; color: #000; font: 16px sans-serif; text-align: left; vertical-align: top; }
  .tab[aria-selected=true], .c[aria-selected=true] { background: #333; color: #fff; }
  .c { position: relative; }
  .prog { position: absolute; left: 0; bottom: 0; height: 4px; width: 0; background: #06c; }
  .on .prog { animation: fill 3s linear forwards; }
  .paused .prog { animation-play-state: paused; }
  @keyframes fill { to { width: 100%; } }
  .panel { font-size: 32px; margin-top: 24px; }
  #feed { font-size: 48px; }
</style></head><body>
<header><a href="/">Home</a></header>
<main>
<section id="static"><h1>Static control</h1><p>Nothing moves here.</p></section>
<section id="demo"><h2>Product demo</h2><iframe title="demo" srcdoc="${IFRAME.replace(/"/g, '&quot;')}" style="width:760px;height:230px;border:0"></iframe></section>
<section id="tabs"><h2>Features</h2><div role="tablist" id="tl"><button role="tab" class="tab" aria-selected="true">Listen</button><button role="tab" class="tab" aria-selected="false">Speak</button><button role="tab" class="tab" aria-selected="false">Write</button></div><div class="panel" id="panel">Listen panel</div></section>
<section id="css"><h2>Css tabs</h2><div role="tablist" id="ct"><button role="tab" class="c on" aria-selected="true">One<span class="prog"></span></button><button role="tab" class="c" aria-selected="false">Two<span class="prog"></span></button><button role="tab" class="c" aria-selected="false">Three<span class="prog"></span></button></div><div class="panel" id="cpanel">One panel</div></section>
<section id="live"><h2>Live feed</h2><div id="feed">0</div></section>
</main>
<footer><a href="/terms">Terms</a></footer>
<script>
const tabs = [...document.querySelectorAll('.tab')]; let i = 0, hold = false;
const show = (k) => { i = k; tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === k))); panel.textContent = tabs[k].textContent + ' panel'; };
tabs.forEach((t, k) => t.addEventListener('click', () => show(k)));
tl.addEventListener('mouseenter', () => { hold = true; }); tl.addEventListener('mouseleave', () => { hold = false; });
setInterval(() => { if (!hold) show((i + 1) % 3); }, 2000);

const cs = [...document.querySelectorAll('.c')];
const cshow = (k) => { cs.forEach((t, j) => { t.classList.toggle('on', j === k); t.setAttribute('aria-selected', String(j === k)); }); cpanel.textContent = cs[k].firstChild.textContent + ' panel'; };
cs.forEach((t, k) => { t.addEventListener('click', () => cshow(k)); t.querySelector('.prog').addEventListener('animationend', () => cshow((k + 1) % 3)); });
ct.addEventListener('mouseenter', () => ct.classList.add('paused')); ct.addEventListener('mouseleave', () => ct.classList.remove('paused'));

const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(Math.floor(performance.now() / 30)), 30)'])));
w.onmessage = (e) => { feed.textContent = 'tick ' + e.data; };
</script></body></html>`;

const U_SECTIONS = [
  { id: 'header', locate: { role: 'banner' } },
  { id: 'static', locate: { role: 'heading', name: 'Static control' } },
  { id: 'demo', locate: { role: 'heading', name: 'Product demo' } },
  { id: 'tabs', locate: { role: 'heading', name: 'Features' } },
  { id: 'css', locate: { role: 'heading', name: 'Css tabs' } },
  { id: 'live', locate: { role: 'heading', name: 'Live feed' } },
  { id: 'footer', locate: { role: 'contentinfo' } },
];
const U_ENTRY = 'u-home--entry';
const unstableUrl = () => `data:text/html;charset=utf-8,${encodeURIComponent(UNSTABLE_PAGE)}`;
const freshPage = async () => (await browser.newContext({ viewport: SETTINGS.viewport })).newPage();
const runOn = (p, code) => (0, eval)(code)(p);
const uMeasure = (p, extra = {}) => runOn(p, buildMeasureCode({ state: U_ENTRY, page: 'u-home', sections: U_SECTIONS, ...SETTINGS, ...extra }));

/** Start the page time, measure, shoot every section — with `gap` ms of real time between the steps, as an agent thinking between tool calls. */
async function pipeline(gap) {
  const p = await freshPage();
  try {
    await p.goto(unstableUrl());
    await runOn(p, buildTimeCode(SETTINGS));
    await p.waitForTimeout(gap);
    const a = attribute(await uMeasure(p));
    await p.waitForTimeout(gap);
    const out = mkdtempSync(join(tmpdir(), 'sections-unstable-'));
    const { targets, scroller } = shootTargets(a);
    const r = await runOn(p, buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
    return { out, r, a };
  } finally {
    await p.context().close();
  }
}

let runs = null;
const twoRuns = async () => (runs ??= { one: await pipeline(1000), two: await pipeline(4000) });
const picture = (run, id) => join(run.out, `${U_ENTRY}@${id}.png`);

browserTest('browser time: the sections of a page whose scripts, timers and CSS animations move on their own come out the same however long the agent waits between the steps', async () => {
  const { one, two } = await twoRuns();
  assert.equal(one.a.ok, true, JSON.stringify([one.a.orphans, one.a.notFound, one.a.overlaps]));
  for (const id of ['static', 'demo', 'tabs', 'css']) {
    const c = comparePngs(readFileSync(picture(one, id)), readFileSync(picture(two, id)));
    assert.equal(c.within, true, `${id}: ${c.reason}`);
    assert.equal(c.percent, 0, `${id}: the page time is the same, so the pictures are the same: ${c.reason}`);
  }
});

browserTest('browser time: the pictures are not blank — the iframe\'s box is in the demo picture', async () => {
  const { one } = await twoRuns();
  const demo = decodePng(readFileSync(picture(one, 'demo')));
  let blue = 0;
  for (let i = 0; i < demo.data.length; i += 4) if (demo.data[i] === 0 && demo.data[i + 1] === 102 && demo.data[i + 2] === 204) blue += 1;
  assert.ok(blue >= 80 * 80 * 0.9, `the 80×80 box of the iframe is in the picture (${blue} blue pixels)`);
});

browserTest('browser shoot: every shot says whether something the page time cannot hold is moving in it — only the one fed by a Worker is, with the box where the two pictures differ', async () => {
  const { one, two } = await twoRuns();
  for (const run of [one, two]) {
    assert.deepEqual(Object.fromEntries(run.r.shots.map((s) => [s.id, s.uncontrolled])), { header: false, static: false, demo: false, tabs: false, css: false, live: true, footer: false });
    const live = run.r.shots.find((s) => s.id === 'live');
    assert.ok(live.diffBox && live.diffBox.width > 0 && live.diffBox.height > 0, JSON.stringify(live));
    assert.ok(live.diffBox.x >= 0 && live.diffBox.y >= 0 && live.diffBox.x + live.diffBox.width <= live.width && live.diffBox.y + live.diffBox.height <= live.height, `the box is inside the ${live.width}×${live.height} picture: ${JSON.stringify(live.diffBox)}`);
    assert.ok(live.diffBox.y + live.diffBox.height > 50, 'the counter is below the heading');
    for (const s of run.r.shots.filter((x) => x.id !== 'live')) assert.equal(s.diffBox, undefined, s.id);
  }
});

browserTest('browser time: the code that starts the page time says it did and where it starts; steps move the scripts by exactly what was asked, and nothing moves without one', async () => {
  const p = await freshPage();
  try {
    await p.goto(dataUrl());
    const t = await runOn(p, buildTimeCode(SETTINGS));
    assert.equal(t.installed, true);
    assert.match(t.startsAt, /^2026-01-01T00:00:01/);
    const tick = () => p.evaluate(() => Number(document.getElementById('tick').textContent));
    const before = await tick();
    await p.waitForTimeout(400);
    assert.equal(await tick(), before, 'a real wait moves nothing');
    await runOn(p, buildStepCode(1000));
    assert.equal(await tick(), before + 25, 'a 40 ms interval ticks 25 times in 1000 ms of page time');
    await runOn(p, buildStepCode(80));
    assert.equal(await tick(), before + 27);
  } finally {
    await p.context().close();
  }
});

browserTest('browser time: a step is refused before the page time is started', async () => {
  const p = await freshPage();
  try {
    await p.goto(unstableUrl());
    await assert.rejects(() => runOn(p, buildStepCode(100)), /装时间/);
  } finally {
    await p.context().close();
  }
});

browserTest('browser measure: a page whose time was started is neither given another clock nor reloaded', async () => {
  const p = await freshPage();
  try {
    await p.goto(unstableUrl());
    await runOn(p, buildTimeCode(SETTINGS));
    await p.evaluate(() => { window.__mark = 'still here'; });
    const m = await uMeasure(p);
    assert.match(m.clock, /present/);
    assert.equal(await p.evaluate(() => window.__mark), 'still here', 'no reload');
  } finally {
    await p.context().close();
  }
});

browserTest('browser measure: a state reached by clicking, measured on a page whose time was never started, is said to have come too late', async () => {
  const p = await freshPage();
  try {
    await p.goto(unstableUrl());
    await p.getByRole('tab', { name: 'Speak' }).click();
    const m = await uMeasure(p, { state: 'u-home--speak', entry: U_ENTRY, section: 'tabs', reload: false });
    assert.match(m.clock, /装晚了/);
  } finally {
    await p.context().close();
  }
});

/** Click a tab, move the mouse off it, measure `--for` the state and shoot it: what colour each tab of the list is in the picture. */
async function shotOfTab(p, { name, section, state, tabsAt }) {
  await p.getByRole('tab', { name }).click();
  await p.mouse.move(0, 0);
  const a = attribute(await uMeasure(p, { state, entry: U_ENTRY, section, reload: false }));
  await p.mouse.move(0, 0);
  const out = mkdtempSync(join(tmpdir(), 'sections-state-'));
  const { targets, scroller } = shootTargets(a);
  const r = await runOn(p, buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
  const range = a.ranges.find((x) => x.id === section);
  const img = decodePng(readFileSync(join(out, `${state}.png`)));
  const boxes = await p.locator(tabsAt).evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top + window.scrollY }; }));
  const bg = (k) => {
    const o = ((Math.round(boxes[k].y - range.start) + 4) * img.width + Math.round(boxes[k].x) + 4) * 4;
    return [img.data[o], img.data[o + 1], img.data[o + 2]];
  };
  return { shot: r.shots[0], picked: [0, 1, 2].map(bg) };
}

browserTest('browser state: a tab clicked on a timer-driven carousel is the tab in the picture — the mouse moved away and the page scrolled in between', async () => {
  const p = await freshPage();
  try {
    await p.goto(unstableUrl());
    await runOn(p, buildTimeCode(SETTINGS));
    const { picked } = await shotOfTab(p, { name: 'Speak', section: 'tabs', state: 'u-home--speak', tabsAt: '#tl .tab' });
    assert.deepEqual(picked, [[255, 255, 255], [51, 51, 51], [255, 255, 255]], 'Speak is the dark one');
    assert.equal(await p.evaluate(() => document.querySelector('#tl .tab[aria-selected=true]').textContent), 'Speak');
  } finally {
    await p.context().close();
  }
});

browserTest('browser state: a tab clicked on a carousel that moves on when its CSS progress line ends is the tab in the picture too', async () => {
  const p = await freshPage();
  try {
    await p.goto(unstableUrl());
    await runOn(p, buildTimeCode(SETTINGS));
    const { picked, shot } = await shotOfTab(p, { name: 'Two', section: 'css', state: 'u-home--two', tabsAt: '#ct .c' });
    assert.deepEqual(picked, [[255, 255, 255], [51, 51, 51], [255, 255, 255]], 'Two is the dark one');
    assert.equal(await p.evaluate(() => document.querySelector('#ct .c[aria-selected=true]').firstChild.textContent), 'Two');
    assert.equal(shot.uncontrolled, false);
  } finally {
    await p.context().close();
  }
});

browserTest('browser time: a CSS animation stepped to its end ends the way it would have — its `animationend` runs and the next tab is shown, and nothing in real time moves it', async () => {
  const p = await freshPage();
  try {
    await p.goto(unstableUrl());
    await runOn(p, buildTimeCode(SETTINGS));
    const now = () => p.evaluate(() => document.querySelector('#ct .c[aria-selected=true]').firstChild.textContent);
    assert.equal(await now(), 'One');
    await p.waitForTimeout(500);
    assert.equal(await now(), 'One', 'the progress line did not move in real time');
    await runOn(p, buildStepCode(1500));
    assert.equal(await now(), 'One', '1.5 s of a 3 s line plus the 1 s the page was started with');
    await runOn(p, buildStepCode(1000));
    assert.equal(await now(), 'Two', 'the line ended at 3 s');
  } finally {
    await p.context().close();
  }
});

// ---------- scroll-driven sections: a screen pinned in the viewport while the page scrolls under it ----------
//
//   800×600 viewport · a bar 60 tall, then intro 400 · steps 2400 (an 800-tall element `position: sticky` at the top of the screen
//   that shows step 1, 2 or 3 by how far the section has been scrolled) · cards 2400 (the same pin, but a conveyor: every scroll
//   event while the pin is held turns the next card up, and it never turns back) · after 500 · a footer of 100
//   (page coordinates: steps 460–2860, cards 2860–5260).

const STEP_BG = ['#fdd', '#dfd', '#ddf'];
const STEP_RGB = [[255, 221, 221], [221, 255, 221], [221, 221, 255]];
const CARD_BG = ['#ffd', '#dff', '#fdf'];
const CARD_RGB = [[255, 255, 221], [221, 255, 255], [255, 221, 255]];

const PIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px sans-serif; }
  header { height: 60px; background: #eee; }
  main > section { display: block; box-sizing: border-box; }
  #intro { height: 400px; padding: 20px; background: #fff; }
  #steps, #cards { height: 2400px; }
  .pin { position: sticky; top: 0; height: 800px; padding: 20px; box-sizing: border-box; }
  #after { height: 500px; padding: 20px; background: #eee; }
  footer { height: 100px; background: #ccc; }
</style></head><body>
<header><a href="/">Home</a></header>
<main>
<section id="intro"><h1>Intro</h1><p>Scroll down.</p></section>
<section id="steps"><div class="pin" id="pin1" style="background:${STEP_BG[0]}"><h2>How it works</h2><div id="step">Step 1</div></div></section>
<section id="cards"><div class="pin" id="pin2" style="background:${CARD_BG[0]}"><h2>Why it happens</h2><div id="card">Card 1</div></div></section>
<section id="after"><h2>After</h2><button>Done</button></section>
</main>
<footer><a href="/terms">Terms</a></footer>
<script>
let card = 0;
const show = () => {
  const r = steps.getBoundingClientRect();
  const k = Math.min(2, Math.floor(Math.min(1, Math.max(0, -r.top / (r.height - 800))) * 3));
  step.textContent = 'Step ' + (k + 1); pin1.style.background = ${JSON.stringify(STEP_BG)}[k];
  const c = cards.getBoundingClientRect();
  if (c.top < -1 && c.bottom > innerHeight + 1) card = Math.min(2, card + 1);
  document.getElementById('card').textContent = 'Card ' + (card + 1); pin2.style.background = ${JSON.stringify(CARD_BG)}[card];
};
addEventListener('scroll', show);
</script></body></html>`;

// a thin sticky bar, a narrow sticky sidebar and a fixed background in a tall wrapper: none of them is a pin
const NO_PIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px sans-serif; }
  #app { height: 3000px; position: relative; }
  #bg { position: fixed; inset: 0; background: #def; z-index: -1; }
  #bar { position: sticky; top: 0; height: 60px; background: #ccc; }
  #side { position: sticky; top: 0; width: 120px; height: 500px; background: #999; }
  h1 { margin: 0; }
</style></head><body><div id="app"><div id="bg"></div><div id="bar"><a href="/">Home</a></div><div id="side"></div><h1>Plain</h1></div></body></html>`;

const PIN_SECTIONS = [
  { id: 'header', locate: { role: 'banner' } },
  { id: 'hero', locate: { role: 'heading', name: 'Intro' } },
  { id: 'how-it-works', locate: { role: 'heading', name: 'How it works' } },
  { id: 'problem', locate: { role: 'heading', name: 'Why it happens' } },
  { id: 'faq', locate: { role: 'heading', name: 'After' } },
  { id: 'footer', locate: { role: 'contentinfo' } },
];
const DRIVEN = PIN_SECTIONS.map((x) => (x.id === 'how-it-works' || x.id === 'problem' ? { ...x, scrollDriven: true } : x));
const PIN_ENTRY = 'p-home--entry';
const CLI = fileURLToPath(new URL('./design-archive-sections.mjs', import.meta.url));
const pinUrl = () => `data:text/html;charset=utf-8,${encodeURIComponent(PIN_PAGE)}`;

/** A fresh tab on the pin page with the page time started. */
async function pinSession() {
  const p = await freshPage();
  await p.goto(pinUrl());
  await runOn(p, buildTimeCode(SETTINGS));
  return p;
}
const measurePin = (p, sections) => runOn(p, buildMeasureCode({ state: PIN_ENTRY, page: 'p-home', sections, ...SETTINGS }));
const attributeCli = (m) => {
  const file = join(mkdtempSync(join(tmpdir(), 'sections-attribute-')), 'measurement.json');
  writeFileSync(file, JSON.stringify(m));
  return spawnSync('node', [CLI, 'attribute', file], { encoding: 'utf8' });
};
const rgbAt = (file, x, y) => {
  const img = decodePng(readFileSync(file));
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2]];
};

browserTest('browser measure: the two sections that hold a pinned screen are detected as scroll-driven, with what was seen; without `scrollDriven` declared `attribute` exits 1, declared it exits 0', async () => {
  const p = await pinSession();
  try {
    const m = await measurePin(p, PIN_SECTIONS);
    assert.equal(m.pins.length, 2, JSON.stringify(m.pins));
    const [one, two] = m.pins;
    assert.deepEqual([one.kind, one.tag, one.height, one.container], ['sticky', 'div', 800, { top: 460, bottom: 2860 }]);
    assert.deepEqual(two.container, { top: 2860, bottom: 5260 });
    assert.deepEqual(one.texts.map((t) => t.replace(/^How it works /, '')), ['Step 1', 'Step 2', 'Step 3'], 'the pinned text changed with the scroll');
    const a = attribute(m);
    assert.deepEqual(a.undeclaredScrollDriven.map((x) => x.id), ['how-it-works', 'problem']);
    assert.equal(a.ok, false);
    assert.deepEqual([a.orphans, a.notFound, a.overlaps, a.outOfOrder], [[], [], [], []], 'only the scroll-driven sections are in the way');
    const cli = attributeCli(m);
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stderr, /how-it-works.*scrollDriven: true/);

    const declaredM = await measurePin(p, DRIVEN);
    const done = attribute(declaredM);
    assert.equal(done.ok, true, JSON.stringify(done.undeclaredScrollDriven));
    assert.deepEqual(done.scrollDriven.map((x) => [x.id, x.detected, x.declared]), [['how-it-works', true, true], ['problem', true, true]]);
    const declaredCli = attributeCli(declaredM);
    assert.equal(declaredCli.status, 0, declaredCli.stderr);
  } finally {
    await p.context().close();
  }
});

browserTest('browser measure: a thin sticky bar, a narrow sticky sidebar and a fixed background are not pins — a page with only those has no scroll-driven section', async () => {
  const p = await freshPage();
  try {
    await p.goto(`data:text/html;charset=utf-8,${encodeURIComponent(NO_PIN_PAGE)}`);
    await runOn(p, buildTimeCode(SETTINGS));
    const m = await runOn(p, buildMeasureCode({ state: 'q--entry', page: 'q', sections: [{ id: 'hero', locate: { role: 'heading', name: 'Plain' } }], ...SETTINGS }));
    assert.deepEqual(m.pins, []);
    assert.equal(attribute(m).ok, true);
  } finally {
    await p.context().close();
  }
});

// a narrow sticky text column beside pictures that scroll past (800×600 viewport): the column is 340 wide, a pin too small to hold a screen,
// and its text — and its colour, for the pixel checks — change with the scroll: three steps, one per 700 px
const STORY_BG = ['#fde68a', '#93c5fd', '#fca5a5'];
const STORY_RGB = [[253, 230, 138], [147, 197, 253], [252, 165, 165]];
const STORY_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 22px sans-serif; }
  header { height: 60px; background: #eee; }
  main > section { display: block; box-sizing: border-box; }
  #intro { height: 400px; padding: 20px; background: #fff; }
  #story { display: flex; gap: 20px; padding: 0 20px; }
  #text { position: sticky; top: 0; width: 340px; height: 420px; align-self: flex-start; padding: 20px; box-sizing: border-box; background: ${STORY_BG[0]}; }
  #pics { flex: 1; } .pic { height: 700px; margin-bottom: 20px; background: #ddd; }
  #after { height: 500px; padding: 20px; background: #eee; }
  footer { height: 100px; background: #ccc; }
</style></head><body>
<header><a href="/">Home</a></header>
<main>
<section id="intro"><h1>Intro</h1></section>
<section id="story"><div id="text"><h2>How it works</h2><p id="step">Step 1: record</p></div><div id="pics"><div class="pic"></div><div class="pic"></div><div class="pic"></div></div></section>
<section id="after"><h2>After</h2><button>Done</button></section>
</main>
<footer><a href="/terms">Terms</a></footer>
<script>
const L = ['Step 1: record', 'Step 2: score', 'Step 3: improve'];
addEventListener('scroll', () => {
  const k = Math.max(0, Math.min(2, Math.floor((-story.getBoundingClientRect().top + 100) / 700)));
  step.textContent = L[k]; text.style.background = ${JSON.stringify(STORY_BG)}[k];
});
</script></body></html>`;
const STORY_SECTIONS = [
  { id: 'header', locate: { role: 'banner' } },
  { id: 'hero', locate: { role: 'heading', name: 'Intro' } },
  { id: 'how-it-works', locate: { role: 'heading', name: 'How it works' } },
  { id: 'faq', locate: { role: 'heading', name: 'After' } },
  { id: 'footer', locate: { role: 'contentinfo' } },
];
const STORY_ENTRY = 's-home--entry';

// a sticky bar that holds the same text wherever the page is, with paragraphs that fade in as they are scrolled to: nothing here changes what a screen of it says
const FADE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 20px sans-serif; }
  #wrap { height: 3000px; }
  #bar { position: sticky; top: 0; width: 300px; height: 80px; background: #ccc; }
  p { opacity: 0; transition: opacity .3s; height: 300px; margin: 0; } p.on { opacity: 1; }
</style></head><body><div id="wrap"><h1>Fading</h1><div id="bar">Reading list</div>
<p>One</p><p>Two</p><p>Three</p><p>Four</p><p>Five</p><p>Six</p><p>Seven</p><p>Eight</p></div>
<script>
const show = () => document.querySelectorAll('p').forEach((p) => p.classList.toggle('on', p.getBoundingClientRect().top < innerHeight * 0.8));
addEventListener('scroll', show); show();
</script></body></html>`;

// a sticky banner whose message changes on a timer: it changes while the page is scrolled through, but not because of where it is scrolled to
const BANNER_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 20px sans-serif; }
  #wrap { height: 3000px; }
  #banner { position: sticky; top: 0; width: 300px; height: 80px; background: #ffd; }
</style></head><body><div id="wrap"><h1>Promo</h1><div id="banner">Free shipping</div><p>Body</p></div>
<script>
const M = ['Free shipping', 'New arrivals', 'Gift cards', 'Sale ends soon'];
let i = 0; setInterval(() => { banner.textContent = M[++i % M.length]; }, 330);
</script></body></html>`;

async function loadWith(html, sections, entry) {
  const p = await freshPage();
  await p.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await runOn(p, buildTimeCode(SETTINGS));
  return { p, m: await runOn(p, buildMeasureCode({ state: entry, page: entry.split('--')[0], sections, ...SETTINGS })) };
}

browserTest('browser measure: a pinned text column narrower than half the screen, whose text changes as the page scrolls, is detected as scroll-driven — undeclared, `attribute` exits 1; declared, it exits 0', async () => {
  const { p, m } = await loadWith(STORY_PAGE, STORY_SECTIONS, STORY_ENTRY);
  try {
    assert.equal(m.pins.length, 1, JSON.stringify(m.pins));
    const [pin] = m.pins;
    assert.deepEqual([pin.kind, pin.tag, pin.height, pin.byText, pin.container.top], ['sticky', 'div', 420, true, 460]);
    assert.deepEqual(pin.texts.map((t) => t.replace(/^How it works /, '')), ['Step 1: record', 'Step 2: score', 'Step 3: improve']);
    const a = attribute(m);
    assert.deepEqual(a.undeclaredScrollDriven.map((x) => x.id), ['how-it-works']);
    assert.equal(a.ok, false);
    const cli = attributeCli(m);
    assert.equal(cli.status, 1, cli.stderr);
    assert.match(cli.stderr, /how-it-works.*scrollDriven: true/);
    const declared = await runOn(p, buildMeasureCode({ state: STORY_ENTRY, page: 's-home', sections: STORY_SECTIONS.map((x) => (x.id === 'how-it-works' ? { ...x, scrollDriven: true } : x)), ...SETTINGS }));
    assert.equal(attributeCli(declared).status, 0);
  } finally {
    await p.context().close();
  }
});

browserTest('browser shoot: the narrow-column section is one screen tall and shows step 1; the screen after a scroll to step 2 is shot as step 2', async () => {
  const { p, m } = await loadWith(STORY_PAGE, STORY_SECTIONS.map((x) => (x.id === 'how-it-works' ? { ...x, scrollDriven: true } : x)), STORY_ENTRY);
  try {
    const a = attribute(m);
    assert.equal(a.ok, true, JSON.stringify(a.undeclaredScrollDriven));
    const out = mkdtempSync(join(tmpdir(), 'sections-story-'));
    const { targets, scroller } = shootTargets(a, { only: ['how-it-works'] });
    await runOn(p, buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
    const first = join(out, `${STORY_ENTRY}@how-it-works.png`);
    assert.deepEqual(pngSize(first), [800, 600]);
    assert.deepEqual(rgbAt(first, 100, 300), STORY_RGB[0]);
    await p.evaluate(() => window.scrollTo(0, 460 + 700));
    await runOn(p, buildStepCode(100));
    const r = await runOn(p, buildPinnedCode({ state: 's-home--how-it-works-step-2', ...SETTINGS, outDir: out }));
    assert.equal(r.shots[0].uncontrolled, false);
    assert.deepEqual(rgbAt(join(out, 's-home--how-it-works-step-2.png'), 100, 300), STORY_RGB[1]);
  } finally {
    await p.context().close();
  }
});

browserTest('browser measure: a sticky bar with the same text everywhere, on a page whose paragraphs fade in as they are scrolled to, is not a pin', async () => {
  const { p, m } = await loadWith(FADE_PAGE, [{ id: 'fading', locate: { role: 'heading', name: 'Fading' } }], 'f--entry');
  try {
    assert.deepEqual(m.pins, []);
    const a = attribute(m);
    assert.deepEqual([a.ok, a.scrollDriven], [true, []]);
  } finally {
    await p.context().close();
  }
});

browserTest('browser measure: a sticky banner whose text changes on a timer is not a pin — its text is not the same where the scroll puts it back', async () => {
  const { p, m } = await loadWith(BANNER_PAGE, [{ id: 'promo', locate: { role: 'heading', name: 'Promo' } }], 'b--entry');
  try {
    assert.deepEqual(m.pins, []);
    assert.deepEqual(attribute(m).scrollDriven, []);
  } finally {
    await p.context().close();
  }
});

browserTest('browser measure: the pages of the earlier tests — pinned bars, fixed tables of contents, carousels, an iframe — have no scroll-driven section either', async () => {
  const a = attribute(await measure());
  assert.deepEqual([a.scrollDriven, a.undeclaredScrollDriven], [[], []]);
  const { one } = await twoRuns();
  assert.deepEqual([one.a.scrollDriven, one.a.undeclaredScrollDriven], [[], []]);
});

browserTest('browser shoot: a scroll-driven section is one screen tall and shows its first step, with no blank under it — and the sections around it are shot whole as before', async () => {
  const p = await pinSession();
  try {
    const a = attribute(await measurePin(p, DRIVEN));
    assert.equal(await p.evaluate(() => document.getElementById('card').textContent), 'Card 3', 'the scroll-through left the conveyor on its last card');
    const out = mkdtempSync(join(tmpdir(), 'sections-pin-'));
    const { targets, scroller } = shootTargets(a);
    const r = await runOn(p, buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
    assert.deepEqual(r.shots.map((s) => s.id), ['header', 'hero', 'how-it-works', 'problem', 'faq', 'footer'], 'in the order of the sections');
    const sizes = Object.fromEntries(r.shots.map((s) => [s.id, pngSize(join(out, s.file))]));
    assert.deepEqual(sizes, { header: [800, 60], hero: [800, 400], 'how-it-works': [800, 600], problem: [800, 600], faq: [800, 500], footer: [800, 100] });
    const steps = join(out, `${PIN_ENTRY}@how-it-works.png`);
    for (const y of [0, 300, 599]) assert.deepEqual(rgbAt(steps, 400, y), STEP_RGB[0], `row ${y}: step 1, not blank`);
    const cards = join(out, `${PIN_ENTRY}@problem.png`);
    for (const y of [0, 300, 599]) assert.deepEqual(rgbAt(cards, 400, y), CARD_RGB[0], `row ${y}: card 1, not the card the scroll-through left on screen`);
    assert.deepEqual(r.shots.filter((s) => s.scrollDriven).map((s) => s.id), ['how-it-works', 'problem']);
    assert.ok(r.shots.every((s) => s.uncontrolled === false), JSON.stringify(r.shots));
    assert.deepEqual(r.shots.map((s) => s.heightDrift), [0, 0, 0, 0, 0, 0]);
  } finally {
    await p.context().close();
  }
});

browserTest('browser shoot: a page that was scrolled into the section before the shot is not given that scroll position back by the reload — the conveyor still starts on its first card', async () => {
  // served over http: a browser keeps the scroll position of a page across a reload for a real address, not for a data: URL
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(PIN_PAGE);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const p = await freshPage();
  try {
    await p.goto(`http://127.0.0.1:${server.address().port}/`);
    await runOn(p, buildTimeCode(SETTINGS));
    const a = attribute(await measurePin(p, DRIVEN));
    await p.evaluate(() => window.scrollTo(0, 2860 + 1000));
    await runOn(p, buildStepCode(100));
    const out = mkdtempSync(join(tmpdir(), 'sections-pin-'));
    const { targets, scroller } = shootTargets(a, { only: ['problem'] });
    await runOn(p, buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
    assert.deepEqual(rgbAt(join(out, `${PIN_ENTRY}@problem.png`), 400, 300), CARD_RGB[0]);
  } finally {
    await p.context().close();
    server.close();
  }
});

browserTest('browser shoot (the command line, as the docs tell an agent to run it): the attribution `attribute` printed goes to `shoot`, and the conveyor still starts on its first card, not the last one the scroll-through left', async () => {
  const p = await pinSession();
  try {
    const m = await measurePin(p, DRIVEN);
    const cli = attributeCli(m);
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(await p.evaluate(() => document.getElementById('card').textContent), 'Card 3', 'the scroll-through left the conveyor on its last card');
    const dir = mkdtempSync(join(tmpdir(), 'sections-pin-cli-'));
    const attribution = join(dir, 'attribution.json');
    writeFileSync(attribution, cli.stdout);
    const out = join(dir, 'shots');
    const sh = spawnSync('node', [CLI, 'shoot', attribution, '--out', out, '--section', 'how-it-works,problem'], { encoding: 'utf8' });
    assert.equal(sh.status, 0, sh.stderr);
    const r = await runOn(p, sh.stdout.trim());
    assert.deepEqual(r.shots.filter((s) => s.scrollDriven).map((s) => s.id), ['how-it-works', 'problem']);
    assert.deepEqual(pngSize(join(out, `${PIN_ENTRY}@problem.png`)), [800, 600]);
    for (const y of [0, 300, 599]) assert.deepEqual(rgbAt(join(out, `${PIN_ENTRY}@problem.png`), 400, y), CARD_RGB[0], `row ${y}: card 1, not the last card`);
    for (const y of [0, 300, 599]) assert.deepEqual(rgbAt(join(out, `${PIN_ENTRY}@how-it-works.png`), 400, y), STEP_RGB[0], `row ${y}: step 1`);
  } finally {
    await p.context().close();
  }
});

browserTest('browser shoot: the first step is the same picture however long the agent waited between the steps', async () => {
  const shoot = async (gap) => {
    const p = await pinSession();
    try {
      const a = attribute(await measurePin(p, DRIVEN));
      await p.waitForTimeout(gap);
      const out = mkdtempSync(join(tmpdir(), 'sections-pin-'));
      const { targets, scroller } = shootTargets(a, { only: ['how-it-works', 'problem'] });
      await runOn(p, buildShootCode({ targets, scroller, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
      return out;
    } finally {
      await p.context().close();
    }
  };
  const [one, two] = [await shoot(300), await shoot(2500)];
  for (const id of ['how-it-works', 'problem']) {
    const c = comparePngs(readFileSync(join(one, `${PIN_ENTRY}@${id}.png`)), readFileSync(join(two, `${PIN_ENTRY}@${id}.png`)));
    assert.equal(c.percent, 0, `${id}: ${c.reason}`);
  }
});

browserTest('browser pinned: after the page is scrolled to the second step, the pinned command shoots that screen as it stands, named after the state', async () => {
  const p = await pinSession();
  try {
    await p.evaluate(() => window.scrollTo(0, 460 + 800));
    await runOn(p, buildStepCode(100));
    assert.equal(await p.evaluate(() => document.getElementById('step').textContent), 'Step 2');
    const out = mkdtempSync(join(tmpdir(), 'sections-pin-'));
    const r = await runOn(p, buildPinnedCode({ state: 'p-home--how-it-works-step-2', ...SETTINGS, outDir: out }));
    assert.equal(r.shots.length, 1);
    const [shot] = r.shots;
    assert.deepEqual([shot.id, shot.file, shot.width, shot.height, shot.uncontrolled, shot.scrollY], ['p-home--how-it-works-step-2', 'p-home--how-it-works-step-2.png', 800, 600, false, 1260]);
    assert.match(r.clock, /present/);
    const file = join(out, shot.file);
    assert.deepEqual(pngSize(file), [800, 600]);
    for (const y of [0, 300, 599]) assert.deepEqual(rgbAt(file, 400, y), STEP_RGB[1], `row ${y}: step 2`);
    assert.equal(await p.evaluate(() => Math.round(window.scrollY)), 1260, 'the page was not scrolled');
    assert.equal(await p.evaluate(() => document.getElementById('step').textContent), 'Step 2');
  } finally {
    await p.context().close();
  }
});

browserTest('browser pinned: a conveyor turned to its second card is shot as the second card — and flagged uncontrolled when something the page time cannot hold moves in it', async () => {
  const p = await pinSession();
  try {
    await p.evaluate(() => window.scrollTo(0, 2860 + 300));
    await runOn(p, buildStepCode(100));
    assert.equal(await p.evaluate(() => document.getElementById('card').textContent), 'Card 2');
    const out = mkdtempSync(join(tmpdir(), 'sections-pin-'));
    const r = await runOn(p, buildPinnedCode({ state: 'p-home--problem-card-2', ...SETTINGS, outDir: out }));
    assert.equal(r.shots[0].uncontrolled, false);
    assert.deepEqual(rgbAt(join(out, 'p-home--problem-card-2.png'), 400, 300), CARD_RGB[1]);
    // a Worker counts real milliseconds into the pinned screen: nothing the page clock can hold
    await p.evaluate(() => {
      const live = document.createElement('div');
      live.id = 'live';
      live.style.cssText = 'position:fixed;left:300px;top:200px;font:48px sans-serif;background:#fff';
      document.body.appendChild(live);
      const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(Math.floor(performance.now() / 30)), 30)'])));
      w.onmessage = (e) => { live.textContent = 'tick ' + e.data; };
    });
    await p.waitForTimeout(200);
    const moving = await runOn(p, buildPinnedCode({ state: 'p-home--problem-card-2', ...SETTINGS, outDir: out }));
    const [shot] = moving.shots;
    assert.equal(shot.uncontrolled, true);
    assert.ok(shot.diffBox.width > 0 && shot.diffBox.x >= 300 && shot.diffBox.y >= 200, JSON.stringify(shot.diffBox));
  } finally {
    await p.context().close();
  }
});

browserTest('browser pinned: a page whose time was never started is said to have come too late', async () => {
  const p = await freshPage();
  try {
    await p.goto(pinUrl());
    const r = await runOn(p, buildPinnedCode({ state: 'p-home--late', ...SETTINGS, outDir: mkdtempSync(join(tmpdir(), 'sections-pin-')) }));
    assert.match(r.clock, /装晚了/);
  } finally {
    await p.context().close();
  }
});

// ---------- a state on a page that is not taller than the screen: shot as one screen, on the same stopped time ----------
//
//   800×600 viewport · a bar 60 tall, then two bands of 180: tabs (every 2 s a setInterval shows the next tab) and
//   css (a 1 s progress line per tab; when it ends — `animationend` — the next tab is shown); `live` adds a band
//   fed by a Worker that counts real milliseconds. The whole page is 520 tall: one screen.

const screenPage = ({ live = false } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px sans-serif; }
  header { height: 60px; background: #eee; }
  section { height: 180px; box-sizing: border-box; padding: 20px; }
  #tabs { background: #eef; }
  #css { background: #efe; }
  #live { height: 100px; background: #ffe; }
  .tab, .c { display: inline-block; width: 120px; height: 36px; margin: 0 4px 0 0; padding: 0; border: 0; background: #fff; color: #000; font: 16px sans-serif; text-align: left; vertical-align: top; }
  .tab[aria-selected=true], .c[aria-selected=true] { background: #333; color: #fff; }
  .c { position: relative; }
  .prog { position: absolute; left: 0; bottom: 0; height: 4px; width: 0; background: #06c; }
  .on .prog { animation: fill 1s linear forwards; }
  @keyframes fill { to { width: 100%; } }
  .panel { font-size: 28px; margin-top: 16px; }
</style></head><body>
<header><a href="/">Home</a></header>
<section id="tabs"><div role="tablist" id="tl"><button role="tab" class="tab" aria-selected="true">Listen</button><button role="tab" class="tab" aria-selected="false">Speak</button><button role="tab" class="tab" aria-selected="false">Write</button></div><div class="panel" id="panel">Listen panel</div></section>
<section id="css"><div role="tablist" id="ct"><button role="tab" class="c on" aria-selected="true">One<span class="prog"></span></button><button role="tab" class="c" aria-selected="false">Two<span class="prog"></span></button><button role="tab" class="c" aria-selected="false">Three<span class="prog"></span></button></div><div class="panel" id="cpanel">One panel</div></section>
${live ? '<section id="live"><div id="feed" style="font-size:40px">0</div></section>' : ''}
<script>
const tabs = [...document.querySelectorAll('.tab')]; let i = 0;
const show = (k) => { i = k; tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === k))); panel.textContent = tabs[k].textContent + ' panel'; };
tabs.forEach((t, k) => t.addEventListener('click', () => show(k)));
setInterval(() => show((i + 1) % 3), 2000);
const cs = [...document.querySelectorAll('.c')];
const cshow = (k) => { cs.forEach((t, j) => { t.classList.toggle('on', j === k); t.setAttribute('aria-selected', String(j === k)); }); cpanel.textContent = cs[k].firstChild.textContent + ' panel'; };
cs.forEach((t, k) => { t.addEventListener('click', () => cshow(k)); t.querySelector('.prog').addEventListener('animationend', () => cshow((k + 1) % 3)); });
${live ? "const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(Math.floor(performance.now() / 30)), 30)']))); w.onmessage = (e) => { feed.textContent = 'tick ' + e.data; };" : ''}
</script></body></html>`;

const SCREEN_STATE = 's-login--entry';
const screenUrl = (variant) => `data:text/html;charset=utf-8,${encodeURIComponent(screenPage(variant))}`;

/** The way a single-screen state used to be shot: wait for the network, put the no-animation style in, shoot; the page's own time runs. */
async function oldWayShot(gap) {
  const p = await freshPage();
  try {
    await p.goto(screenUrl());
    try {
      await p.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (e) {
      // as it stands
    }
    await p.evaluate(() => document.fonts.ready);
    await p.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important }' });
    await p.waitForTimeout(gap);
    return await p.screenshot();
  } finally {
    await p.context().close();
  }
}

/** Start the page time, do `beforeShot`, wait `gap` ms of real time (an agent thinking), shoot the screen. */
async function screenShot(gap, { variant, state = SCREEN_STATE, beforeShot } = {}) {
  const p = await freshPage();
  try {
    await p.goto(screenUrl(variant));
    await runOn(p, buildTimeCode(SETTINGS));
    if (beforeShot) await beforeShot(p);
    await p.waitForTimeout(gap);
    const out = mkdtempSync(join(tmpdir(), 'sections-screen-'));
    const r = await runOn(p, buildScreenCode({ state, ...SETTINGS, outDir: out }));
    return { out, r, file: join(out, `${state}.png`) };
  } finally {
    await p.context().close();
  }
}

browserTest('browser screen: a single-screen state on a page that moves on its own — a timer carousel and a CSS progress line — is the same picture however long the agent waits; the old way, with the no-animation style and no stopped time, is not', async () => {
  const one = await screenShot(1000);
  const two = await screenShot(4000);
  const c = comparePngs(readFileSync(one.file), readFileSync(two.file));
  assert.equal(c.within, true, c.reason);
  assert.equal(c.percent, 0, c.reason);
  for (const run of [one, two]) {
    assert.equal(run.r.shots.length, 1);
    assert.equal(run.r.shots[0].uncontrolled, false);
    assert.equal(run.r.shots[0].diffBox, undefined);
    assert.equal(run.r.shots[0].stable, undefined);
  }
  const old = comparePngs(await oldWayShot(200), await oldWayShot(2800));
  assert.equal(old.within, false, `the timer carousel has moved on between the two old-way shots: ${old.reason}`);
});

browserTest('browser screen: the picture is as big as the main viewport and is named after the state', async () => {
  const { r, file } = await screenShot(0);
  assert.deepEqual(pngSize(file), [800, 600]);
  assert.deepEqual(r.shots.map((s) => [s.id, s.file, s.width, s.height]), [[SCREEN_STATE, `${SCREEN_STATE}.png`, 800, 600]]);
  assert.equal(r.shots[0].heightDrift, 0, 'the page is one screen: it is not taller than the viewport');
  assert.match(r.clock, /present/);
});

browserTest('browser screen: a state reached by clicking is the state in the picture — a step of page time after the click, then however long the agent waits', async () => {
  const click = async (p) => {
    await p.getByRole('tab', { name: 'Write' }).click();
    await runOn(p, buildStepCode(200));
  };
  const { r, file } = await screenShot(3500, { beforeShot: click });
  const img = decodePng(readFileSync(file));
  const at = (x, y) => [0, 1, 2].map((k) => img.data[(y * img.width + x) * 4 + k]);
  const p = await freshPage();
  let boxes;
  try {
    await p.goto(screenUrl());
    boxes = await p.locator('#tl .tab').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left) + 4, y: Math.round(b.top) + 4 }; }));
  } finally {
    await p.context().close();
  }
  assert.deepEqual(boxes.map((b) => at(b.x, b.y)), [[255, 255, 255], [255, 255, 255], [51, 51, 51]], 'Write is the dark one');
  assert.equal(r.shots[0].uncontrolled, false);
});

browserTest('browser screen: something the page time cannot hold (a Worker counting real time) is flagged on the screen shot, with the box where the two shots differ', async () => {
  const { r } = await screenShot(0, { variant: { live: true } });
  const [s] = r.shots;
  assert.equal(s.uncontrolled, true);
  assert.ok(s.diffBox && s.diffBox.width > 0 && s.diffBox.height > 0, JSON.stringify(s));
  assert.ok(s.diffBox.y >= 420, `the counter is in the band below the two carousels: ${JSON.stringify(s.diffBox)}`);
});
