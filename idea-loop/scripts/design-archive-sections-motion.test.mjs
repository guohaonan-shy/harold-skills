/**
 * Sections that keep moving after the motion was switched off (references/design-archive.md §10).
 *
 * Switching animations off in a page is not the same as the page holding still: a loop driven by a script
 * (the product demo embedded in a landing page), a carousel on a timer. The measurement therefore looks
 * twice — the picture, then again a beat later — and compares the two section by section; and reads which
 * tab of each tab group is selected before and after. The comparisons are pure functions over pixels and
 * lists (they are also written into the page, where the pixels come from a canvas); the pictures and
 * readings here are built by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MKT } from './design-archive-fixture.mjs';
import { attribute, buildMeasureCode, framesInMotion, movingSections, tabGroupChanges } from './design-archive-sections.mjs';

const CLI = fileURLToPath(new URL('./design-archive-sections.mjs', import.meta.url));
const run = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'design-archive-motion-'));

const RGBA = (width, height, [r, g, b] = [255, 255, 255]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
  return { width, height, data };
};
const paint = (img, x0, y0, x1, y1, [r, g, b]) => {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) img.data.set([r, g, b, 255], (y * img.width + x) * 4);
  return img;
};
const RANGES = [
  { id: 'header', ref: `${MKT}#header`, start: 0, end: 100 },
  { id: 'hero', ref: `${MKT}#hero`, start: 100, end: 900 },
  { id: 'feature-a', ref: `${MKT}#feature-a`, start: 900, end: 1500 },
];

// ---------- is a section still moving? ----------

test('movingSections: two identical shots → nothing is moving', () => {
  assert.deepEqual(movingSections(RGBA(200, 1500), RGBA(200, 1500), RANGES), []);
});

test('movingSections: a patch repainted between the shots names the section it is in, with the count and the box (page coordinates)', () => {
  const b = paint(RGBA(200, 1500), 20, 300, 80, 360, [200, 0, 0]);
  const r = movingSections(RGBA(200, 1500), b, RANGES);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'hero');
  assert.equal(r[0].ref, `${MKT}#hero`);
  assert.equal(r[0].changedPixels, 60 * 60);
  assert.deepEqual(r[0].box, { x0: 20, y0: 300, x1: 80, y1: 360 });
  assert.ok(Math.abs(r[0].ratio - 3600 / (200 * 800)) < 1e-9);
});

test('movingSections: a change in one section is not charged to its neighbours, right at the cut either', () => {
  const b = paint(RGBA(200, 1500), 0, 899, 200, 901, [0, 0, 0]); // the last row of hero and the first of feature-a
  assert.deepEqual(movingSections(RGBA(200, 1500), b, RANGES).map((x) => [x.id, x.changedPixels]), [['hero', 200], ['feature-a', 200]]);
});

test('movingSections: a faint difference (a few levels per channel) and a speck are noise, not motion', () => {
  const faint = paint(RGBA(200, 1500), 0, 100, 200, 400, [250, 250, 250]);
  assert.deepEqual(movingSections(RGBA(200, 1500), faint, RANGES), [], 'five levels apart');
  const speck = paint(RGBA(200, 1500), 10, 10, 18, 18, [0, 0, 0]); // 64 pixels
  assert.deepEqual(movingSections(RGBA(200, 1500), speck, RANGES), []);
  const patch = paint(RGBA(200, 1500), 10, 10, 20, 20, [0, 0, 0]); // 100 pixels
  assert.deepEqual(movingSections(RGBA(200, 1500), patch, RANGES).map((x) => x.id), ['header']);
});

test('movingSections: a picture taken at 2× is read at twice the CSS coordinates, and the box is back in CSS pixels', () => {
  const b = paint(RGBA(400, 3000), 40, 600, 160, 720, [0, 0, 200]);
  const r = movingSections(RGBA(400, 3000), b, RANGES, { scale: 2 });
  assert.deepEqual(r.map((x) => [x.id, x.changedPixels, x.box]), [['hero', 120 * 120, { x0: 20, y0: 300, x1: 80, y1: 360 }]]);
});

test('movingSections: the page grew between the shots → rows only one shot has count as changed; a different width → every section is moving', () => {
  const grown = movingSections(RGBA(200, 1400), RGBA(200, 1500), RANGES);
  assert.deepEqual(grown.map((x) => x.id), ['feature-a'], 'only feature-a reaches past row 1400');
  assert.equal(grown[0].changedPixels, 100 * 200);
  const wider = movingSections(RGBA(200, 1500), RGBA(210, 1500), RANGES);
  assert.deepEqual(wider.map((x) => x.id), ['header', 'hero', 'feature-a']);
  assert.match(wider[0].reason, /尺寸/);
});

// ---------- which embedded page is the one that moves ----------

const MOVING = [{ id: 'hero', ref: `${MKT}#hero`, box: { x0: 20, y0: 300, x1: 80, y1: 360 } }];
const IFRAMES = [
  { src: '/hero/journey.html?x=1', left: 0, right: 600, top: 250, bottom: 550 },
  { src: '/embed/static.html', left: 700, right: 1300, top: 250, bottom: 550 },
];
const FRAMES = [
  { url: 'https://site.test/interview', injected: true },
  { url: 'https://site.test/hero/journey.html?x=1', injected: true },
  { url: 'https://site.test/embed/static.html', injected: true },
];

test('framesInMotion: an embedded page whose box meets the moving patch is "not frozen" — with its section and whether the style got in', () => {
  assert.deepEqual(framesInMotion(MOVING, IFRAMES, FRAMES, 'https://site.test/interview'), [
    { url: 'https://site.test/hero/journey.html?x=1', section: 'hero', injected: true },
  ]);
});

test('framesInMotion: a cross-origin one that moves is named with the reason the style could not reach it; nothing moving → nothing reported, whatever the injection said', () => {
  const ad = [{ src: 'https://ads.example/slot', left: 0, right: 600, top: 250, bottom: 550 }];
  const report = [{ url: 'https://ads.example/slot', injected: false, why: '跨域的内嵌页面，样式注入不进去' }];
  assert.deepEqual(framesInMotion(MOVING, ad, report, 'https://site.test/interview'), [
    { url: 'https://ads.example/slot', section: 'hero', injected: false, why: '跨域的内嵌页面，样式注入不进去' },
  ]);
  assert.deepEqual(framesInMotion([], IFRAMES, FRAMES, 'https://site.test/interview'), []);
});

test('framesInMotion: a patch that moves with no embedded page under it lists no frame (a script in the page itself is moving)', () => {
  assert.deepEqual(framesInMotion(MOVING, [IFRAMES[1]], FRAMES, 'https://site.test/interview'), []);
});

// ---------- tab groups ----------

const GROUPS = (...sel) => sel.map((s, i) => ({ key: `group-${i}`, tabs: ['a', 'b', 'c'], selected: s }));

test('tabGroupChanges: a group whose selected tab differs between the two readings is reported with both', () => {
  assert.deepEqual(tabGroupChanges(GROUPS(['a'], ['b']), GROUPS(['a'], ['c'])), [{ group: 'group-1', from: ['b'], to: ['c'] }]);
});

test('tabGroupChanges: nothing changed → empty; a group only the later reading has (it hydrated meanwhile) is not a change', () => {
  assert.deepEqual(tabGroupChanges(GROUPS(['a']), GROUPS(['a'])), []);
  assert.deepEqual(tabGroupChanges([], GROUPS(['a'])), []);
  assert.deepEqual(tabGroupChanges(null, null), []);
});

test('tabGroupChanges: a group there at the start and gone at the end is reported (to: null); groups are matched by key, not by position', () => {
  const before = [{ key: 'x', tabs: ['a', 'b'], selected: ['a'] }, { key: 'y', tabs: ['c', 'd'], selected: ['c'] }];
  const after = [{ key: 'y', tabs: ['c', 'd'], selected: ['d'] }];
  assert.deepEqual(tabGroupChanges(before, after), [{ group: 'x', from: ['a'], to: null }, { group: 'y', from: ['c'], to: ['d'] }]);
});

// ---------- handed on through attribute ----------

const HEADER = { id: 'header', locate: { role: 'banner' }, found: true, top: 0, bottom: 100, block: -1 };
const HERO = { id: 'hero', locate: { role: 'heading', name: '一个价格' }, found: true, top: 300, bottom: 340, block: 0 };
const FOOTER = { id: 'footer', locate: { role: 'contentinfo' }, found: true, top: 900, bottom: 1000, block: -1 };
const measurement = (overrides = {}) => ({
  state: `${MKT}--entry`,
  page: MKT,
  pageSize: { width: 1440, height: 1000 },
  blocks: [{ top: 100, bottom: 900 }],
  contentinfo: { top: 900, bottom: 1000 },
  sections: [HEADER, HERO, FOOTER],
  clickables: [],
  ...overrides,
});
const MOVED = [{ id: 'hero', ref: `${MKT}#hero`, changedPixels: 5000, ratio: 0.02, box: { x0: 0, y0: 100, x1: 600, y1: 400 } }];
const TABS = { changed: [{ group: 'Features', from: ['One'], to: ['Two'] }] };

test('attribute: what the measurement says is moving or switched passes through to the result and does not fail the run', () => {
  const r = attribute(measurement({ moving: MOVED, tabs: TABS }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.moving, MOVED);
  assert.deepEqual(r.tabsChanged, TABS.changed);
  const plain = attribute(measurement());
  assert.deepEqual(plain.moving, []);
  assert.deepEqual(plain.tabsChanged, []);
});

test('cli attribute: moving sections and switched tab groups are said on stderr (and what to do about them); the exit code stays 0', () => {
  const f = join(tmp(), 'm.json');
  writeFileSync(f, JSON.stringify(measurement({ moving: MOVED, tabs: TABS })));
  const r = run('attribute', f);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /还在动的段 1 个.*hero.*unstable/s);
  assert.match(r.stderr, /标签组.*Features/s);
  const quiet = join(tmp(), 'q.json');
  writeFileSync(quiet, JSON.stringify(measurement()));
  const q = run('attribute', quiet);
  assert.equal(q.status, 0);
  assert.equal(q.stderr, '');
});

// ---------- the generated code ----------

const SECTIONS = [{ id: 'hero', locate: { role: 'heading', name: '一个价格' } }, { id: 'footer', locate: { role: 'contentinfo' } }];
const config = (c) => JSON.parse(c.match(/\)\(page, (\{.*\})\);\s*\}$/s)[1]);

test('buildMeasureCode: two shots a beat apart, the tab groups read before and after, the comparison written into the page, the summary names what moved', () => {
  const code = buildMeasureCode({ sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'light' });
  assert.match(code, /waitForTimeout\(C\.settleMs\)/);
  assert.equal((code.match(/page\.screenshot\(/g) ?? []).length, 2, 'the picture and the second look');
  assert.match(code, /function movingSections/, 'the function the unit tests run');
  assert.match(code, /function computeRanges/, 'the ranges the second look is cut by are the ones attribute computes');
  const C = config(code);
  assert.ok(C.settleMs >= 800 && C.settleMs <= 1500, `about a second, got ${C.settleMs}`);
  assert.doesNotThrow(() => new Function(`return ${C.compareExpr}`));
  assert.doesNotThrow(() => new Function(`return ${C.tabsExpr}`));
  assert.match(C.compareExpr, /function movingSections/);
  assert.match(C.compareExpr, /createImageBitmap/);
  assert.match(code, /moving,/);
  assert.match(code, /tabsChanged/);
  assert.match(code, /function tabGroupChanges/);
  assert.match(code, /function framesInMotion/);
});

test('buildMeasureCode: an embedded page counts as frozen by what was measured — the injection report only says whether the style got in', () => {
  const code = buildMeasureCode({ sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'light' });
  assert.doesNotMatch(code, /frozen: true|frozen: false/);
  assert.match(code, /injected: true/);
  assert.match(code, /notFrozen: framesInMotion/);
});
