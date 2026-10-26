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
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { attribute, buildMeasureCode, buildShootCode, buildStepCode, buildTimeCode, shootTargets } from './design-archive-sections.mjs';
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
