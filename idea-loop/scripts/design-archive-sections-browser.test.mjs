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
import { attribute, buildMeasureCode, buildShootCode, shootTargets } from './design-archive-sections.mjs';
import { decodePng } from './ui-png-compare.mjs';

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

browserTest('browser shoot: the page clock is frozen for the shot — a counter that ticks by itself is the same in the two frozen shots, while it was not settled before', async () => {
  const a = attribute(await measure());
  const out = mkdtempSync(join(tmpdir(), 'sections-shoot-'));
  const { targets } = shootTargets(a, { only: ['hero'] });
  const r = await runCode(buildShootCode({ targets, ...SETTINGS, pageHeight: a.pageHeight, outDir: out }));
  const [hero] = r.shots;
  assert.equal(hero.settled, false, 'the counter changes every 40 ms, so two shots 300 ms apart never agree');
  assert.equal(hero.clockFrozen, true);
  assert.equal(hero.stable, true, 'with the clock frozen nothing moves');
  // and time runs again afterwards
  const t1 = await page.evaluate(() => document.getElementById('tick').textContent);
  await page.waitForTimeout(300);
  assert.notEqual(await page.evaluate(() => document.getElementById('tick').textContent), t1);
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
  assert.equal(r.shots.find((s) => s.id === 'list').clockFrozen, true);
  assert.equal(r.shots.find((s) => s.id === 'list').stable, true);
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
