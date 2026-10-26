/**
 * The sections script's seams: its pure functions (`attribute`, `shootTargets`) fed hand-written
 * measurements, and its command line (exit codes, stdout). The generated code actually running in a
 * browser is in design-archive-sections-browser.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { BASE, MKT, MKT_ENTRY, MKT_ENTRY_FILE, compliantFiles, marketingFiles, writeRepo } from './design-archive-fixture.mjs';
import { attribute, buildMeasureCode, buildPinnedCode, buildScreenCode, buildShootCode, buildStepCode, buildTimeCode, screenTargets, shootTargets } from './design-archive-sections.mjs';

const CLI = fileURLToPath(new URL('./design-archive-sections.mjs', import.meta.url));
const run = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'design-archive-sections-'));

// ---------- a hand-written measurement of a 1440×6000 marketing page ----------
//
//   0     banner (0–100)
//   100   block 0: hero (heading at 300)
//   900   block 1: feature-a (heading at 1000), 3600 tall
//   4500  block 2: feature-b (heading at 4600)
//   5800  contentinfo (5800–6000)

const HERO = { id: 'hero', locate: { role: 'heading', name: '一个价格' }, found: true, top: 300, bottom: 340, block: 0 };
const FEATURE_A = { id: 'feature-a', locate: { role: 'heading', name: '无限菜谱' }, found: true, top: 1000, bottom: 1040, block: 1 };
const FEATURE_B = { id: 'feature-b', locate: { role: 'heading', name: '食材库同步' }, found: true, top: 4600, bottom: 4640, block: 2 };
const HEADER = { id: 'header', locate: { role: 'banner' }, found: true, top: 0, bottom: 100, block: -1 };
const FOOTER = { id: 'footer', locate: { role: 'contentinfo' }, found: true, top: 5800, bottom: 6000, block: -1 };

const CLICKS = [
  { role: 'link', name: '跳过导航', top: 20, bottom: 40, landmark: null }, // before the first heading section
  { role: 'link', name: '菜谱', top: 50, bottom: 70, landmark: 'banner' },
  { role: 'button', name: '开始使用', top: 500, bottom: 548, landmark: null },
  { role: 'link', name: '看功能', top: 600, bottom: 620, landmark: null },
  { role: 'button', name: '展开细节', top: 4700, bottom: 4740, landmark: null },
  { role: 'link', name: '条款', top: 5900, bottom: 5920, landmark: 'contentinfo' },
];

const measurement = (sections, overrides = {}) => ({
  state: MKT_ENTRY,
  page: MKT,
  pageSize: { width: 1440, height: 6000 },
  blocks: [{ top: 100, bottom: 900 }, { top: 900, bottom: 4500 }, { top: 4500, bottom: 5800 }],
  contentinfo: { top: 5800, bottom: 6000 },
  sections,
  clickables: CLICKS,
  ...overrides,
});
const ALL = [HEADER, HERO, FEATURE_A, FEATURE_B, FOOTER];

test('attribute: every section gets a range — a heading section its whole block, a landmark its own box, the last one up to the footer', () => {
  const r = attribute(measurement(ALL));
  assert.deepEqual(r.ranges.map((x) => [x.id, x.start, x.end]), [
    ['header', 0, 100], ['hero', 100, 900], ['feature-a', 900, 4500], ['feature-b', 4500, 5800], ['footer', 5800, 6000],
  ]);
  assert.equal(r.ranges[0].ref, `${MKT}#header`);
  assert.deepEqual(r.coverage, { gaps: [], overlaps: [] }, 'the five ranges meet end to start and cover the page');
});

test('attribute: a heading section ends where the next starts; with no section after it, at the first contentinfo even if undeclared', () => {
  const r = attribute(measurement([HEADER, HERO, FEATURE_A, FEATURE_B]));
  assert.deepEqual(r.ranges.find((x) => x.id === 'feature-b'), { id: 'feature-b', ref: `${MKT}#feature-b`, by: 'heading', role: 'heading', start: 4500, end: 5800, height: 1300 });
  // no contentinfo at all: to the bottom of the page
  const none = attribute(measurement([HEADER, HERO, FEATURE_A, FEATURE_B], { contentinfo: null }));
  assert.equal(none.ranges.find((x) => x.id === 'feature-b').end, 6000);
});

test('attribute: two declared headings in one block — the block top goes to neither, each starts at its own heading', () => {
  const second = { ...FEATURE_B, top: 2000, bottom: 2040, block: 1 }; // now in the same block as feature-a
  const r = attribute(measurement([HEADER, HERO, FEATURE_A, second, FOOTER]));
  assert.deepEqual(r.ranges.filter((x) => ['feature-a', 'feature-b'].includes(x.id)).map((x) => [x.id, x.start, x.end]), [
    ['feature-a', 1000, 2000],
    ['feature-b', 2000, 5800],
  ]);
});

test('attribute: a `position` section is that block\'s own box', () => {
  const pos = { id: 'hero', locate: { position: 1 }, found: true, top: 100, bottom: 900, block: 0 };
  const r = attribute(measurement([HEADER, pos, FEATURE_A, FEATURE_B, FOOTER]));
  assert.deepEqual(r.ranges.find((x) => x.id === 'hero'), { id: 'hero', ref: `${MKT}#hero`, by: 'position', role: null, start: 100, end: 900, height: 800 });
});

test('attribute: an element before the first section and one in an undeclared footer are orphans; declaring header and footer clears them', () => {
  const without = attribute(measurement([HERO, FEATURE_A, FEATURE_B]));
  assert.equal(without.ok, false);
  assert.deepEqual(without.orphans.map((o) => o.name).sort(), ['条款', '跳过导航', '菜谱'].sort());
  assert.match(without.orphans.find((o) => o.name === '条款').reason, /contentinfo/);
  assert.match(without.orphans.find((o) => o.name === '跳过导航').reason, /之前/);
  const withBoth = attribute(measurement(ALL));
  assert.equal(withBoth.ok, true);
  assert.deepEqual(withBoth.orphans, []);
});

test('attribute: each clickable element is given the section it leaves from (what the edge\'s `from` copies)', () => {
  const r = attribute(measurement(ALL));
  assert.deepEqual(
    r.clickables.map((c) => [c.name, c.section]),
    [['跳过导航', 'header'], ['菜谱', 'header'], ['开始使用', 'hero'], ['看功能', 'hero'], ['展开细节', 'feature-b'], ['条款', 'footer']],
  );
  assert.equal(r.clickables[2].ref, `${MKT}#hero`);
});

test('attribute: an element inside the banner / contentinfo belongs to that landmark\'s section whatever its vertical position', () => {
  // a sticky header's link measured far down the page still belongs to the header
  const r = attribute(measurement(ALL, { clickables: [{ role: 'link', name: '粘性导航', top: 3000, bottom: 3020, landmark: 'banner' }] }));
  assert.equal(r.clickables[0].section, 'header');
});

test('attribute: a section that cannot be located is listed and fails the run', () => {
  const lost = { id: 'faq', locate: { role: 'heading', name: '常见问题' }, found: false, reason: '页面上没有这个定位对应的元素（标题改名了？）' };
  const r = attribute(measurement([HEADER, HERO, FEATURE_A, lost, FEATURE_B, FOOTER]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.notFound.map((x) => [x.id, x.ref, x.locate]), [['faq', `${MKT}#faq`, { role: 'heading', name: '常见问题' }]]);
  assert.match(r.notFound[0].reason, /标题/);
  assert.equal(r.ranges.some((x) => x.id === 'faq'), false);
});

test('attribute: sections listed in a different order from the page are reported', () => {
  const r = attribute(measurement([HEADER, FEATURE_A, HERO, FEATURE_B, FOOTER]));
  assert.equal(r.ok, false);
  assert.ok(r.outOfOrder.length >= 1, JSON.stringify(r.outOfOrder));
});

// ---------- after the trial scan ----------

test('attribute: a see-through clickable is not placed (nor an orphan) — it is listed as hidden; a fixed one is placed where it first showed up', () => {
  const clicks = [
    { role: 'button', name: '开始使用', top: 500, bottom: 548, landmark: null, opacity: 1 },
    // a contents list pinned to the screen, fade-in only in feature-a: at scroll 0 it measures at y 377–523 (hero), it appears at scroll 1000
    { role: 'link', name: '01 目录', top: 377, bottom: 523, landmark: null, opacity: 0, fixed: true, appearance: { scrollY: 1000, top: 377, bottom: 523 } },
    { role: 'link', name: '一直透明', top: 700, bottom: 720, landmark: null, opacity: 0 },
    { role: 'link', name: '从没出现', top: 300, bottom: 320, landmark: null, opacity: 1, fixed: true, appearance: null },
  ];
  const r = attribute(measurement(ALL, { clickables: clicks }));
  assert.equal(r.ok, true, JSON.stringify(r.orphans));
  assert.deepEqual(r.clickables.map((c) => [c.name, c.section]), [['开始使用', 'hero'], ['01 目录', 'feature-a']]);
  assert.equal(r.clickables[1].y, 1450);
  assert.equal(r.clickables[1].fixed, true);
  assert.deepEqual(r.hidden.map((h) => h.name), ['一直透明', '从没出现']);
  assert.match(r.hidden[0].reason, /透明度/);
  assert.match(r.hidden[1].reason, /固定/);
});

test('attribute: a clickable inside the banner that is see-through is hidden too, one that is fixed there and showed up still belongs to the header', () => {
  const r = attribute(measurement(ALL, {
    clickables: [
      { role: 'link', name: '关着的菜单项', top: 50, bottom: 70, landmark: 'banner', opacity: 0 },
      { role: 'link', name: '固定顶栏', top: 10, bottom: 40, landmark: 'banner', opacity: 1, fixed: true, appearance: { scrollY: 0, top: 10, bottom: 40 } },
    ],
  }));
  assert.deepEqual(r.hidden.map((h) => h.name), ['关着的菜单项']);
  assert.deepEqual(r.clickables.map((c) => [c.name, c.section]), [['固定顶栏', 'header']]);
});

test('attribute: two sections whose ranges overlap fail like an orphan, naming both and the rows they share', () => {
  // a `position` section on the block that also holds the faq heading: the heading section starts at the block top too
  const pos = { id: 'trust', locate: { position: 2 }, found: true, top: 900, bottom: 4500, block: 1 };
  const faq = { id: 'faq', locate: { role: 'heading', name: '常见问题' }, found: true, top: 1000, bottom: 1040, block: 1 };
  const r = attribute(measurement([HEADER, HERO, pos, faq, FOOTER]));
  assert.equal(r.ok, false);
  assert.equal(r.overlaps.length, 1);
  assert.deepEqual([r.overlaps[0].with, r.overlaps[0].at, r.overlaps[0].from, r.overlaps[0].to], ['trust', 'faq', 900, 4500]);
  assert.match(r.overlaps[0].reason, /重叠/);
  assert.deepEqual(r.coverage.overlaps, r.overlaps);
});

test('attribute: a header that floats over the top of the content overlaps by geometry only — not a failure', () => {
  const floating = { ...HEADER, bottom: 160 };
  const r = attribute(measurement([floating, HERO, FEATURE_A, FEATURE_B, FOOTER]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.overlaps, []);
});

test('attribute: clickables role + name cannot find are listed with the section they are in; headings come with their full names', () => {
  const r = attribute(measurement(ALL, {
    clickables: [
      { role: 'button', name: '什么是模考', top: 4700, bottom: 4740, landmark: null, byRole: false, matches: 0, textMatches: 1 },
      { role: 'button', name: '开始使用', top: 500, bottom: 548, landmark: null, byRole: true, matches: 1 },
    ],
    headings: [{ level: 2, name: '读一篇，答一篇。', byRole: true, matches: 1, top: 300, bottom: 340 }, { level: 2, name: '食材库同步', byRole: true, matches: 1, top: 4600, bottom: 4640 }],
  }));
  assert.deepEqual(r.roleUnresolved, [{ role: 'button', name: '什么是模考', section: 'feature-b', textMatches: 1 }]);
  assert.deepEqual(r.headings.map((h) => [h.level, h.name, h.section]), [[2, '读一篇，答一篇。', 'hero'], [2, '食材库同步', 'feature-b']]);
});

test('attribute: carries the shooting settings and which state it was measured for', () => {
  const r = attribute(measurement(ALL, { entry: MKT_ENTRY, section: 'faq', viewport: { width: 1440, height: 900 }, theme: 'dark', motion: 'reduce' }));
  assert.deepEqual([r.entry, r.section, r.viewport, r.theme, r.motion], [MKT_ENTRY, 'faq', { width: 1440, height: 900 }, 'dark', 'reduce']);
});

test('shootTargets: one per section named <entry>@<section>.png, the 3600-tall one whole; --section narrows; a range with no height is skipped', () => {
  const a = attribute(measurement(ALL));
  const all = shootTargets(a);
  assert.deepEqual(all.targets.map((t) => [t.file, t.start, t.end]), [
    [`${MKT_ENTRY}@header.png`, 0, 100], [`${MKT_ENTRY}@hero.png`, 100, 900], [`${MKT_ENTRY}@feature-a.png`, 900, 4500],
    [`${MKT_ENTRY}@feature-b.png`, 4500, 5800], [`${MKT_ENTRY}@footer.png`, 5800, 6000],
  ]);
  assert.equal(all.targets[2].end - all.targets[2].start, 3600);
  assert.deepEqual(shootTargets(a, { only: ['feature-b', 'hero'] }).targets.map((t) => t.id), ['hero', 'feature-b']);
  assert.throws(() => shootTargets(a, { only: ['nowhere'] }), /nowhere.*header、hero/);
  const flat = { ...a, ranges: [...a.ranges, { id: 'tail', ref: 'p#tail', start: 6100, end: 6100 }] };
  assert.deepEqual(shootTargets(flat).skipped.map((s) => s.id), ['tail']);
});

// ---------- scroll-driven sections: a pin that holds a screen while the page scrolls under it ----------
//
// feature-a (900–4500) holds a 800-tall element pinned to the top of the screen inside a 2400-tall container (1000–3400)

const PIN = {
  kind: 'sticky', tag: 'div', label: 'Step 1', height: 800, container: { top: 1000, bottom: 3400 },
  stuck: { from: 1000, to: 2600, count: 5 }, texts: ['Step 1', 'Step 2', 'Step 3'],
};
const declared = (s) => ({ ...s, declaredScrollDriven: true });

test('attribute: a pinned element inside a section makes it scroll-driven; without `scrollDriven` declared it fails the run and says why', () => {
  const r = attribute(measurement(ALL, { pins: [PIN] }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.scrollDriven.map((x) => [x.id, x.ref, x.detected, x.declared]), [['feature-a', `${MKT}#feature-a`, true, false]]);
  assert.deepEqual(r.undeclaredScrollDriven.map((x) => [x.id, x.ref]), [['feature-a', `${MKT}#feature-a`]]);
  const evidence = r.undeclaredScrollDriven[0].evidence.join('；');
  assert.match(evidence, /position: sticky/);
  assert.match(evidence, /800/, 'how tall the pinned element is');
  assert.match(evidence, /2400/, 'how tall its container is');
  assert.match(evidence, /3 种/, 'the pinned text changed with the scroll');
  assert.match(r.undeclaredScrollDriven[0].reason, /scrollDriven: true/);
  assert.deepEqual(r.orphans, []);
  assert.deepEqual(r.declaredNotDetected, []);
});

test('attribute: a scroll-driven section that is declared passes, and the evidence is still given', () => {
  const r = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { pins: [PIN] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.undeclaredScrollDriven, []);
  assert.deepEqual(r.scrollDriven.map((x) => [x.id, x.detected, x.declared]), [['feature-a', true, true]]);
  assert.ok(r.scrollDriven[0].evidence.length > 0);
});

test('attribute: declared but not detected only gets a hint — it does not fail the run', () => {
  const r = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.declaredNotDetected.map((x) => x.id), ['feature-a']);
  assert.deepEqual(r.scrollDriven.map((x) => [x.id, x.detected, x.declared]), [['feature-a', false, true]]);
});

test('attribute: a pin is given to the section its container sits in; one outside every section is nobody\'s; no pins at all is as before', () => {
  const inFeatureB = { ...PIN, container: { top: 4600, bottom: 5200 } };
  assert.deepEqual(attribute(measurement(ALL, { pins: [inFeatureB] })).undeclaredScrollDriven.map((x) => x.id), ['feature-b']);
  const nowhere = { ...PIN, container: { top: 7000, bottom: 9400 } };
  const r = attribute(measurement(ALL, { pins: [nowhere] }));
  assert.equal(r.ok, true);
  assert.deepEqual([r.scrollDriven, r.undeclaredScrollDriven, r.declaredNotDetected], [[], [], []]);
  const plain = attribute(measurement(ALL));
  assert.equal(plain.ok, true);
  assert.deepEqual([plain.scrollDriven, plain.undeclaredScrollDriven, plain.declaredNotDetected], [[], [], []]);
});

test('attribute: a pin whose text never changed is still evidence — the pinned screen can change in ways that are not text', () => {
  const r = attribute(measurement(ALL, { pins: [{ ...PIN, texts: ['Step 1'] }] }));
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.undeclaredScrollDriven[0].evidence.join('；'), /随滚动变了/);
});

test('shootTargets: a section declared scroll-driven is shot as the one screen its pin holds, from the top of the pin\'s container — not its whole range — and the others as before', () => {
  const a = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { pins: [PIN], viewport: { width: 1440, height: 900 }, theme: 'light' }));
  const { targets } = shootTargets(a);
  assert.deepEqual(targets.map((t) => [t.id, t.start, t.end, t.scrollDriven === true]), [
    ['header', 0, 100, false], ['hero', 100, 900, false], ['feature-a', 1000, 1900, true], ['feature-b', 4500, 5800, false], ['footer', 5800, 6000, false],
  ]);
  assert.equal(targets.find((t) => t.id === 'feature-a').file, `${MKT_ENTRY}@feature-a.png`);
  assert.deepEqual(shootTargets(a, { only: ['feature-a'] }).targets.map((t) => t.id), ['feature-a']);
});

test('shootTargets: the screen is the viewport\'s height whatever the section\'s range, starts at the section\'s top when the pin does, and a state inside a scroll-driven section is shot as the section it sits in', () => {
  const viewport = { width: 1440, height: 900 };
  const a = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { pins: [PIN], viewport, theme: 'light' }));
  assert.equal(a.ranges.find((r) => r.id === 'feature-a').end, 4500, 'the range is still the whole block');
  assert.equal(shootTargets(a).targets.find((t) => t.id === 'feature-a').end, 1900);
  const atTop = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { pins: [{ ...PIN, container: { top: 900, bottom: 3300 } }], viewport, theme: 'light' }));
  assert.deepEqual(shootTargets(atTop).targets.find((t) => t.id === 'feature-a'), { id: 'feature-a', ref: `${MKT}#feature-a`, file: `${MKT_ENTRY}@feature-a.png`, start: 900, end: 1800, inScroller: false, scrollDriven: true });
  const noPin = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { viewport, theme: 'light' }));
  assert.deepEqual(shootTargets(noPin).targets.find((t) => t.id === 'feature-a').start, 900, 'declared but not detected: shot from the section\'s top');
  const inside = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { pins: [PIN], viewport, theme: 'light', state: `${MKT}--feature-a-step-2`, entry: MKT_ENTRY, section: 'feature-a' }));
  const t = shootTargets(inside).targets;
  assert.deepEqual(t.map((x) => [x.id, x.file, x.start, x.end, x.scrollDriven === true]), [['feature-a', `${MKT}--feature-a-step-2.png`, 900, 4500, false]]);
});

test('buildShootCode: a scroll-driven target brings the page time with it — put back at its fixed start and reloaded for the shot — and no other shot does', () => {
  const viewport = { width: 1440, height: 900 };
  const a = attribute(measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { pins: [PIN], viewport, theme: 'light' }));
  const code = buildShootCode({ targets: shootTargets(a).targets, viewport, theme: 'light', motion: 'default', pageHeight: 6000, outDir: '/tmp/shots' });
  assert.equal(runInNewContext(code).constructor.name, 'AsyncFunction');
  assert.match(code, /"scrollDriven":true/);
  assert.match(code, /clock\.install/);
  assert.match(code, /reload\(\)/);
  const plain = shootTargets(attribute(measurement(ALL, { viewport, theme: 'light' }))).targets;
  assert.doesNotMatch(buildShootCode({ targets: plain, viewport, theme: 'light', motion: 'default', pageHeight: 6000, outDir: '/tmp/shots' }), /clock\.install|runFor/);
});

test('cli attribute: an undeclared scroll-driven section is exit 1 and names the section and the field to add; declared is exit 0; declared but not detected is a hint at exit 0', () => {
  const dir = tmp();
  const write = (name, m) => {
    const f = join(dir, name);
    writeFileSync(f, JSON.stringify(m));
    return f;
  };
  const bad = run('attribute', write('undeclared.json', measurement(ALL, { pins: [PIN] })));
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).undeclaredScrollDriven.length, 1);
  assert.match(bad.stderr, /滚动驱动/);
  assert.match(bad.stderr, /feature-a/);
  assert.match(bad.stderr, /scrollDriven: true/);
  const ok = run('attribute', write('declared.json', measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER], { pins: [PIN] })));
  assert.equal(ok.status, 0, ok.stderr);
  const hint = run('attribute', write('hint.json', measurement([HEADER, HERO, declared(FEATURE_A), FEATURE_B, FOOTER])));
  assert.equal(hint.status, 0, hint.stderr);
  assert.match(hint.stderr, /feature-a/);
  assert.match(hint.stderr, /没检出/);
});

test('cli measure: `scrollDriven` on a section of the entry state is passed to the code; on a section given by --sections it has to be `true`', () => {
  const files = marketingFiles();
  files[MKT_ENTRY_FILE] = files[MKT_ENTRY_FILE].replace('  - { id: feature-a, locate: { role: heading, name: 无限菜谱 } }', '  - { id: feature-a, locate: { role: heading, name: 无限菜谱 }, scrollDriven: true }');
  const r = run('measure', writeRepo(files), MKT_ENTRY);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"id":"feature-a","locate":\{"role":"heading","name":"无限菜谱"\},"scrollDriven":true/);
  assert.doesNotMatch(r.stdout, /"id":"hero","locate":\{[^}]*\},"scrollDriven"/);
  const root = writeRepo(marketingFiles());
  const given = run('measure', root, '--state', MKT_ENTRY, '--page', MKT, '--sections', '[{"id":"hero","locate":{"position":1},"scrollDriven":true}]');
  assert.equal(given.status, 0, given.stderr);
  assert.match(given.stdout, /"scrollDriven":true/);
  const wrong = run('measure', root, '--state', MKT_ENTRY, '--page', MKT, '--sections', '[{"id":"hero","locate":{"position":1},"scrollDriven":"yes"}]');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /scrollDriven.*true/);
});

const SHELL_SCROLLER = { kind: 'element', selector: 'body > div:nth-child(1) > main:nth-child(2)', tag: 'main', top: 60, left: 0, width: 800, contentHeight: 2100, visibleHeight: 540, others: [] };

test('attribute: carries the scroll container the page was measured with, for `shoot` to scroll — null for an older measurement', () => {
  assert.deepEqual(attribute(measurement(ALL, { scroller: SHELL_SCROLLER })).scroller, SHELL_SCROLLER);
  assert.equal(attribute(measurement(ALL)).scroller, null);
});

test('shootTargets: hands the scroll container on; a target that starts inside it is shot from it, one above it as a page shot', () => {
  const a = attribute({
    state: 'app-home--entry', page: 'app-home', scroller: SHELL_SCROLLER, pageSize: { width: 800, height: 2160 },
    blocks: [{ top: 60, bottom: 760 }, { top: 760, bottom: 1660 }, { top: 1660, bottom: 2160 }], contentinfo: null, clickables: [],
    sections: [
      { id: 'header', locate: { role: 'banner' }, found: true, top: 0, bottom: 60, block: -1 },
      { id: 'hero', locate: { role: 'heading', name: 'A' }, found: true, top: 80, bottom: 120, block: 0 },
      { id: 'list', locate: { role: 'heading', name: 'B' }, found: true, top: 800, bottom: 840, block: 1 },
      { id: 'form', locate: { role: 'heading', name: 'C' }, found: true, top: 1700, bottom: 1740, block: 2 },
    ],
  });
  const picked = shootTargets(a);
  assert.deepEqual(picked.scroller, SHELL_SCROLLER);
  assert.deepEqual(picked.targets.map((t) => [t.id, t.start, t.end, t.inScroller]), [['header', 0, 60, false], ['hero', 60, 760, true], ['list', 760, 1660, true], ['form', 1660, 2160, true]]);
  const doc = shootTargets(attribute(measurement(ALL, { scroller: { kind: 'document', selector: null, top: 0, contentHeight: 6000, visibleHeight: 900 } })));
  assert.ok(doc.targets.every((t) => t.inScroller === false), 'a scrolling document is shot as before: page shots');
  assert.equal(shootTargets(attribute(measurement(ALL))).scroller, null);
});

test('buildShootCode: the scroll container is in the code for the browser to scroll — and only when there is one', () => {
  const { targets, scroller } = shootTargets(attribute(measurement(ALL, { scroller: SHELL_SCROLLER })));
  const code = buildShootCode({ targets, scroller, viewport: { width: 800, height: 600 }, theme: 'light', motion: 'default', pageHeight: 6000, outDir: '/tmp/shots' });
  assert.equal(runInNewContext(code).constructor.name, 'AsyncFunction');
  assert.ok(code.includes(JSON.stringify(SHELL_SCROLLER.selector)), 'the selector the measurement found');
  assert.match(code, /"inScroller":false/);
  const plain = buildShootCode({ targets, viewport: { width: 800, height: 600 }, theme: 'light', motion: 'default', pageHeight: 6000, outDir: '/tmp/shots' });
  assert.match(plain, /"scroller":null/);
});

test('shootTargets: for a state inside a section it is the one section, named after the state', () => {
  const a = attribute(measurement(ALL, { state: `${MKT}--feature-b-expanded`, entry: MKT_ENTRY, section: 'feature-b' }));
  const { targets } = shootTargets(a);
  assert.deepEqual(targets.map((t) => [t.id, t.file, t.start, t.end]), [['feature-b', `${MKT}--feature-b-expanded.png`, 4500, 5800]]);
  assert.throws(() => shootTargets({ ...a, section: null }), /在哪一段/);
});

test('buildShootCode: a single async function of `page` that shoots with a clip in page coordinates and never moves the page time', () => {
  const targets = shootTargets(attribute(measurement(ALL))).targets;
  const code = buildShootCode({ targets, viewport: { width: 1440, height: 900 }, theme: 'light', motion: 'default', pageHeight: 6000, outDir: '/tmp/shots' });
  const fn = runInNewContext(code);
  assert.equal(fn.constructor.name, 'AsyncFunction');
  assert.match(code, /fullPage: true/);
  assert.match(code, /\/tmp\/shots/);
  assert.match(code, new RegExp(`${MKT_ENTRY}@feature-a\\.png`));
  assert.doesNotMatch(code, /pauseAt|resume\(|runFor|clock\.install/, 'shoot does not freeze, resume or step the page clock');
  assert.doesNotMatch(code, /animations: 'disabled'/, 'a shot that fast-forwards CSS animations to their end flips a carousel away');
  assert.match(code, /uncontrolled/);
  assert.doesNotMatch(code, /\bstable\b/, '`stable` is replaced by `uncontrolled`');
  assert.doesNotMatch(code, /^\s*\/\//m, 'full-line comments are not sent to the tool');
});

test('screenTargets: a state with no sections is one section, the main viewport, named after the state', () => {
  const { targets, skipped, scroller, pageHeight } = screenTargets({ state: `${MKT}--entry`, viewport: { width: 1440, height: 900 } });
  assert.deepEqual(targets, [{ id: `${MKT}--entry`, ref: `${MKT}--entry`, file: `${MKT}--entry.png`, start: 0, end: 900, inScroller: false }]);
  assert.deepEqual(skipped, []);
  assert.equal(scroller, null);
  assert.equal(pageHeight, 900);
  for (const bad of [{ state: '', viewport: { width: 1, height: 1 } }, { state: 'a/b', viewport: { width: 1, height: 1 } }, { state: '.x', viewport: { width: 1, height: 1 } }, { state: 'x', viewport: { width: 1, height: 0 } }, { state: 'x' }]) {
    assert.throws(() => screenTargets(bad), /状态|视口/, JSON.stringify(bad));
  }
});

test('buildScreenCode: the same code `shoot` runs — a single async function that shoots one clip, flags what the page time cannot hold, and never moves or fast-forwards the page time', () => {
  const code = buildScreenCode({ state: `${MKT}--entry`, viewport: { width: 1440, height: 900 }, theme: 'light', motion: 'default', outDir: '/tmp/shots' });
  const fn = runInNewContext(code);
  assert.equal(fn.constructor.name, 'AsyncFunction');
  assert.match(code, new RegExp(`${MKT}--entry\\.png`));
  assert.match(code, /\/tmp\/shots/);
  assert.match(code, /"pageHeight":900/);
  assert.match(code, /fullPage: true/);
  assert.match(code, /uncontrolled/);
  assert.doesNotMatch(code, /pauseAt|resume\(|runFor|clock\.install/, 'it does not freeze, resume or step the page clock');
  assert.doesNotMatch(code, /animations: 'disabled'/);
  assert.doesNotMatch(code, /animation: none/, 'no style that switches animations off is put into the page');
  assert.doesNotMatch(code, /^\s*\/\//m, 'full-line comments are not sent to the tool');
});

test('cli attribute: prints the result as JSON; exit 0 with nothing orphaned, 1 with orphans or an unlocated section, 2 for bad input', () => {
  const dir = tmp();
  const write = (name, m) => {
    const f = join(dir, name);
    writeFileSync(f, JSON.stringify(m));
    return f;
  };
  const good = run('attribute', write('good.json', measurement(ALL)));
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).ok, true);
  const orphaned = run('attribute', write('orphans.json', measurement([HERO, FEATURE_A, FEATURE_B])));
  assert.equal(orphaned.status, 1);
  assert.equal(JSON.parse(orphaned.stdout).orphans.length, 3);
  assert.match(orphaned.stderr, /落空 3/);
  const lost = run('attribute', write('lost.json', measurement([HEADER, { id: 'faq', locate: { role: 'heading', name: 'x' }, found: false }, FOOTER])));
  assert.equal(lost.status, 1);
  assert.match(lost.stderr, /定位失败 1/);
  assert.equal(run('attribute').status, 2);
  assert.equal(run('attribute', join(dir, 'nope.json')).status, 2);
  writeFileSync(join(dir, 'junk.json'), '{ not json');
  assert.equal(run('attribute', join(dir, 'junk.json')).status, 2);
});

// ---------- measure: the code handed to Playwright ----------

const SECTIONS = [{ id: 'hero', locate: { role: 'heading', name: '一个价格' } }, { id: 'footer', locate: { role: 'contentinfo' } }, { id: 'feature-b', locate: { position: 3 } }];

test('buildMeasureCode: a single async function of `page` that carries the config and locates through the accessibility tree', () => {
  const code = buildMeasureCode({ state: 'p--entry', page: 'p', sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'light', motion: 'default' });
  const fn = runInNewContext(code);
  assert.equal(typeof fn, 'function');
  assert.equal(fn.constructor.name, 'AsyncFunction');
  assert.match(code, /"id":"hero"/);
  assert.match(code, /"viewport":\{"width":1440,"height":900\}/);
  assert.match(code, /"theme":"light"/);
  assert.match(code, /"motion":"default"/);
  assert.match(code, /getByRole\('heading', \{ name: sec\.locate\.name, exact: true \}\)/);
  assert.match(code, /scrollTo/);
  assert.match(code, /display === 'contents'/, 'a wrapper that takes no room is looked through');
  assert.match(code, /clock\.install/);
  assert.match(code, /window\.__dsMeasure/, 'the result stays in the page, where browser_evaluate can save it');
  assert.doesNotMatch(code, /fullPage/, 'measuring takes no picture any more; each section is shot by itself');
  assert.doesNotMatch(code, /^\s*\/\//m, 'full-line comments are not sent to the tool');
});

test('buildMeasureCode: an entry state may reload the page to put the clock under it; a state reached by interacting must not', () => {
  const base = { sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'light' };
  assert.match(buildMeasureCode(base), /"reload":true/);
  assert.match(buildMeasureCode({ ...base, reload: false }), /"reload":false/);
});

test('buildMeasureCode: reduced motion is only asked for when the settings say so', () => {
  const base = { sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'dark' };
  assert.match(buildMeasureCode({ ...base, motion: 'reduce' }), /"motion":"reduce"/);
  assert.match(buildMeasureCode(base), /"motion":"default"/);
});

test('buildTimeCode: a single async function of `page` that stops the page clock and the CSS animation timeline, reloads, and steps the page a fixed amount', () => {
  const code = buildTimeCode({ viewport: { width: 1440, height: 900 }, theme: 'dark', motion: 'default' });
  const fn = runInNewContext(code);
  assert.equal(fn.constructor.name, 'AsyncFunction');
  assert.match(code, /"viewport":\{"width":1440,"height":900\}/);
  assert.match(code, /"theme":"dark"/);
  assert.match(code, /clock\.install/);
  assert.match(code, /pauseAt/);
  assert.match(code, /Animation\.setPlaybackRate/);
  assert.match(code, /playbackRate: 0/);
  assert.match(code, /reload\(\)/);
  assert.match(code, /runFor/);
  assert.doesNotMatch(code, /^\s*\/\//m, 'full-line comments are not sent to the tool');
  assert.match(buildTimeCode({ viewport: { width: 1, height: 1 }, theme: 'light', motion: 'reduce' }), /"motion":"reduce"/);
});

test('buildStepCode: steps the page time by the given milliseconds, and only a positive whole number of them', () => {
  const code = buildStepCode(500);
  assert.equal(runInNewContext(code).constructor.name, 'AsyncFunction');
  assert.match(code, /"ms":500/);
  assert.match(code, /runFor/);
  for (const bad of [0, -5, 1.5, NaN, '200', 120000]) assert.throws(() => buildStepCode(bad), /毫秒/, String(bad));
});

// ---------- the command line: measure ----------

const withIndex = (extra = '') => {
  const files = marketingFiles();
  files[`${BASE}/index.md`] = files[`${BASE}/index.md`].replace('locale: zh-CN', `locale: zh-CN${extra}`);
  return files;
};

test('cli measure: takes the sections from the entry state and the viewport / theme from prod/index.md', () => {
  const r = run('measure', writeRepo(marketingFiles()), MKT_ENTRY);
  assert.equal(r.status, 0, r.stderr);
  const code = r.stdout;
  assert.equal(typeof runInNewContext(code), 'function');
  for (const id of ['header', 'hero', 'feature-a', 'feature-b', 'footer']) assert.match(code, new RegExp(`"id":"${id}"`));
  assert.match(code, /"viewport":\{"width":1440,"height":900\}/);
  assert.match(code, /"theme":"light"/);
  assert.match(code, /"motion":"default"/, 'the plugin default when index.md has no motion');
  assert.match(code, new RegExp(`"page":"${MKT}"`));
  assert.match(r.stderr, /5 段/);
  assert.match(r.stderr, /zh-CN/);
});

test('cli measure: `motion` in prod/index.md and flags override; a flag beats the index', () => {
  const root = writeRepo(withIndex('\nmotion: reduce'));
  assert.match(run('measure', root, MKT_ENTRY).stdout, /"motion":"reduce"/);
  const flagged = run('measure', root, MKT_ENTRY, '--motion', 'default', '--viewport', '1280x800', '--theme', 'dark');
  assert.match(flagged.stdout, /"motion":"default"/);
  assert.match(flagged.stdout, /"viewport":\{"width":1280,"height":800\}/);
  assert.match(flagged.stdout, /"theme":"dark"/);
});

test('cli measure: before the state is in the archive (first scan) the sections come from the command line', () => {
  const root = writeRepo(compliantFiles());
  const list = JSON.stringify([{ id: 'hero', locate: { role: 'heading', name: '标语' } }, { id: 'footer', locate: { role: 'contentinfo' } }]);
  const r = run('measure', root, '--state', 'mkt-home--entry', '--page', 'mkt-home', '--sections', list);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"state":"mkt-home--entry"/);
  assert.match(r.stdout, /"id":"hero"/);
  const file = join(tmp(), 'sections.json');
  writeFileSync(file, list);
  assert.equal(run('measure', root, '--state', 'mkt-home--entry', '--page', 'mkt-home', '--sections-file', file).status, 0);
});

test('cli measure: the settings missing from prod/index.md are an error, not a guess', () => {
  const files = marketingFiles();
  files[`${BASE}/index.md`] = files[`${BASE}/index.md`].replace('viewport: 1440x900\n', '');
  const r = run('measure', writeRepo(files), MKT_ENTRY);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /viewport/);
  assert.equal(run('measure', writeRepo(files), MKT_ENTRY, '--viewport', '1440x900').status, 0);
});

test('cli measure: usage errors exit 2 and say why', () => {
  const root = writeRepo(marketingFiles());
  const cases = [
    [['measure'], /仓库根/],
    [['measure', root], /入口状态/],
    [['measure', root, 'nope--entry'], /没有状态/],
    [['measure', root, 'cookbook--list'], /没有 sections/],
    [['measure', root, 'cookbook--search-loading'], /不是入口状态/],
    [['measure', root, MKT_ENTRY, '--bogus', 'x'], /不认识的选项/],
    [['measure', root, MKT_ENTRY, '--theme', 'sepia'], /主题/],
    [['measure', root, MKT_ENTRY, '--motion', 'fast'], /motion/],
    [['measure', root, MKT_ENTRY, '--delta', 'no-such-spec'], /设计差异/],
    [['measure', root, '--state', 'x--entry', '--sections', '{}'], /非空的 JSON 数组/],
    [['measure', root, '--state', 'x--entry', '--sections', '[{"id":"hero","locate":{"role":"link","name":"x"}}]'], /locate/],
    [['measure', root, '--state', 'x--entry', '--sections', '[not json'], /不是 JSON/],
    [['galaxy'], /子命令/],
    [[], /子命令/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, pattern, args.join(' '));
  }
  const bare = run('measure', writeRepo({ 'README.md': 'x' }), 'a--entry');
  assert.equal(bare.status, 2);
  assert.match(bare.stderr, /不是目标仓库的根/);
});

test('cli measure: with --delta the sections come from the requirement\'s delta/', () => {
  const files = marketingFiles();
  const entry = `${BASE}/pages/${MKT}/${MKT_ENTRY}.md`;
  files[`docs/design/tmp/demo-spec/delta/pages/${MKT}/${MKT_ENTRY}.md`] = files[entry].replace('  - { id: footer, locate: { role: contentinfo } }', '  - { id: faq, locate: { role: heading, name: 常见问题 } }\n  - { id: footer, locate: { role: contentinfo } }').replace('from: mkt-pricing#footer', 'from: mkt-pricing#faq');
  const root = writeRepo(files);
  assert.doesNotMatch(run('measure', root, MKT_ENTRY).stdout, /"id":"faq"/);
  assert.match(run('measure', root, MKT_ENTRY, '--delta', 'demo-spec').stdout, /"id":"faq"/);
  assert.ok(existsSync(root));
});

test('cli time: prints the code that starts the page time, with the settings from prod/index.md or the flags; a missing viewport or theme is an error', () => {
  const root = writeRepo(marketingFiles());
  const r = run('time', root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(typeof runInNewContext(r.stdout), 'function');
  assert.match(r.stdout, /"viewport":\{"width":1440,"height":900\}/);
  assert.match(r.stdout, /"theme":"light"/);
  assert.match(r.stderr, /browser_navigate/, 'says when to run it: after navigating to the entry, before any interaction');
  const flagged = run('time', root, '--viewport', '1280x800', '--theme', 'dark', '--motion', 'reduce');
  assert.match(flagged.stdout, /"viewport":\{"width":1280,"height":800\}/);
  assert.match(flagged.stdout, /"motion":"reduce"/);
  const files = marketingFiles();
  files[`${BASE}/index.md`] = files[`${BASE}/index.md`].replace('viewport: 1440x900\n', '');
  const bare = run('time', writeRepo(files));
  assert.equal(bare.status, 2);
  assert.match(bare.stderr, /viewport/);
  assert.equal(run('time', writeRepo(files), '--viewport', '1440x900').status, 0);
  assert.equal(run('time').status, 2);
  assert.equal(run('time', root, '--bogus', 'x').status, 2);
  assert.equal(run('time', writeRepo({ 'README.md': 'x' })).status, 2);
});

test('cli step: prints the code that moves the page time on by N milliseconds; anything but a positive whole number is a usage error', () => {
  const r = run('step', '400');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(typeof runInNewContext(r.stdout), 'function');
  assert.match(r.stdout, /"ms":400/);
  for (const args of [[], ['0'], ['-3'], ['1.5'], ['abc'], ['400', '500'], ['400', '--ms', '5']]) {
    const bad = run('step', ...args);
    assert.equal(bad.status, 2, args.join(' '));
    assert.match(bad.stderr, /毫秒|不认识/, args.join(' '));
  }
});

test('cli measure --for: a state inside a section is measured as it stands (no reload), named after the state, with its section from the archive or --section', () => {
  const root = writeRepo(marketingFiles());
  const r = run('measure', root, MKT_ENTRY, '--for', `${MKT}--feature-b-expanded`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`"state":"${MKT}--feature-b-expanded"`));
  assert.match(r.stdout, new RegExp(`"entry":"${MKT_ENTRY}"`));
  assert.match(r.stdout, /"section":"feature-b"/);
  assert.match(r.stdout, /"reload":false/);
  assert.match(r.stderr, /不重载/);
  // a state the archive does not have yet (first scan) needs --section
  const first = run('measure', root, MKT_ENTRY, '--for', `${MKT}--hero-menu`);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /--section/);
  const given = run('measure', root, MKT_ENTRY, '--for', `${MKT}--hero-menu`, '--section', 'hero');
  assert.equal(given.status, 0, given.stderr);
  assert.match(given.stdout, /"section":"hero"/);
  assert.equal(run('measure', root, MKT_ENTRY, '--for', 'x--y', '--section', 'nowhere').status, 2);
  assert.equal(run('measure', root, MKT_ENTRY, '--section', 'hero').status, 2, '--section alone means nothing');
});

// ---------- the command line: shoot ----------

const attributionFile = (overrides = {}) => {
  const f = join(tmp(), 'attribution.json');
  writeFileSync(f, JSON.stringify({ ...attribute(measurement(ALL, { viewport: { width: 1440, height: 900 }, theme: 'light', motion: 'default' })), ...overrides }));
  return f;
};

test('cli shoot: prints the code for every section, or only the --section ones, and says what files it will write', () => {
  const out = join(tmp(), 'shots');
  const all = run('shoot', attributionFile(), '--out', out);
  assert.equal(all.status, 0, all.stderr);
  assert.equal(typeof runInNewContext(all.stdout), 'function');
  for (const id of ['header', 'hero', 'feature-a', 'feature-b', 'footer']) assert.match(all.stdout, new RegExp(`${MKT_ENTRY}@${id}\\.png`));
  assert.match(all.stdout, /"viewport":\{"width":1440,"height":900\}/);
  assert.ok(all.stdout.includes(JSON.stringify(out)), 'the output directory is written into the code');
  assert.match(all.stderr, /5 张/);
  const only = run('shoot', attributionFile(), '--out', out, '--section', 'hero,footer');
  assert.equal(only.status, 0, only.stderr);
  assert.doesNotMatch(only.stdout, /@feature-a/);
  assert.match(only.stderr, /2 张/);
});

test('cli shoot: --include is passed on as a locator for an overlay; it has to be one of role / text / selector', () => {
  const out = join(tmp(), 'shots');
  const ok = run('shoot', attributionFile(), '--out', out, '--section', 'header', '--include', '{"role":"menu","name":"产品"}');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /"include":\{"role":"menu","name":"产品"\}/);
  assert.equal(run('shoot', attributionFile(), '--out', out, '--include', '{"color":"red"}').status, 2);
  assert.equal(run('shoot', attributionFile(), '--out', out, '--include', 'menu').status, 2);
});

test('cli shoot: usage errors exit 2 and say why', () => {
  const out = join(tmp(), 'shots');
  const good = attributionFile();
  const cases = [
    [['shoot'], /归属结果/],
    [['shoot', good], /--out/],
    [['shoot', join(tmp(), 'nope.json'), '--out', out], /读不出来/],
    [['shoot', good, '--out', out, '--section', 'nowhere'], /nowhere/],
    [['shoot', attributionFile({ ok: false }), '--out', out], /没通过/],
    [['shoot', attributionFile({ viewport: null }), '--out', out], /viewport/],
    [['shoot', attributionFile({ ranges: undefined }), '--out', out], /ranges/],
    [['shoot', good, '--out', out, '--bogus', 'x'], /不认识的选项/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, pattern, args.join(' '));
  }
});

test('cli shoot: an attribution made for a state inside a section shoots that section only, to <state>.png', () => {
  const f = attributionFile({ state: `${MKT}--feature-b-expanded`, entry: MKT_ENTRY, section: 'feature-b' });
  const r = run('shoot', f, '--out', join(tmp(), 'shots'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`${MKT}--feature-b-expanded\\.png`));
  assert.doesNotMatch(r.stdout, /@hero/);
  assert.match(r.stderr, /1 张/);
});

test('cli shoot: an attribution that failed because of an undeclared scroll-driven section is refused, and the reason says so', () => {
  const f = attributionFile({ ok: false, undeclaredScrollDriven: [{ id: 'feature-a', ref: `${MKT}#feature-a`, evidence: [], reason: 'x' }] });
  const r = run('shoot', f, '--out', join(tmp(), 'shots'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /滚动驱动/);
});

// ---------- pinned: the screen a scroll-driven section holds, shot where the page stands ----------

test('buildPinnedCode: a single async function of `page` that shoots the viewport as it stands, named after the state, and never moves the page time or the scroll', () => {
  const code = buildPinnedCode({ state: `${MKT}--feature-a-step-2`, viewport: { width: 1440, height: 900 }, theme: 'light', motion: 'default', outDir: '/tmp/shots' });
  assert.equal(runInNewContext(code).constructor.name, 'AsyncFunction');
  assert.match(code, new RegExp(`${MKT}--feature-a-step-2\\.png`));
  assert.match(code, /uncontrolled/);
  assert.doesNotMatch(code, /pauseAt|runFor|clock\.install|scrollTo|animations: 'disabled'/);
  assert.doesNotMatch(code, /^\s*\/\//m, 'full-line comments are not sent to the tool');
});

test('cli pinned: prints the code with the settings from prod/index.md or the flags and says which file it will write; a missing state, --out or an unknown option is a usage error', () => {
  const root = writeRepo(marketingFiles());
  const out = join(tmp(), 'shots');
  const r = run('pinned', root, `${MKT}--feature-a-step-2`, '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(typeof runInNewContext(r.stdout), 'function');
  assert.match(r.stdout, /"viewport":\{"width":\d+,"height":\d+\}/);
  assert.ok(r.stdout.includes(JSON.stringify(out)));
  assert.match(r.stderr, new RegExp(`${MKT}--feature-a-step-2\\.png`));
  const flags = run('pinned', root, 'x--y', '--out', out, '--viewport', '800x600', '--theme', 'dark');
  assert.match(flags.stdout, /"viewport":\{"width":800,"height":600\}/);
  assert.match(flags.stdout, /"theme":"dark"/);
  for (const [args, pattern] of [
    [['pinned'], /仓库根/],
    [['pinned', root], /状态/],
    [['pinned', root, 'x--y'], /--out/],
    [['pinned', root, 'x--y', '--out', out, '--bogus', '1'], /不认识的选项/],
    [['pinned', root, 'x--y', 'z', '--out', out], /多出/],
    [['pinned', tmp(), 'x--y', '--out', out], /docs/],
  ]) {
    const e = run(...args);
    assert.equal(e.status, 2, args.join(' '));
    assert.match(e.stderr, pattern, args.join(' '));
  }
});

// ---------- the command line: screen ----------

test('cli screen: prints the code that shoots a state with no sections as one screen — no measure or attribute first — with the settings from prod/index.md or the flags', () => {
  const root = writeRepo(marketingFiles());
  const out = join(tmp(), 'shots');
  const r = run('screen', root, 's-login--entry', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(typeof runInNewContext(r.stdout), 'function');
  assert.match(r.stdout, /s-login--entry\.png/);
  assert.match(r.stdout, /"viewport":\{"width":1440,"height":900\}/);
  assert.match(r.stdout, /"theme":"light"/);
  assert.match(r.stdout, /"pageHeight":900/);
  assert.ok(r.stdout.includes(JSON.stringify(out)), 'the output directory is written into the code');
  assert.match(r.stderr, /1 张/);
  assert.match(r.stderr, /装时间|time/, 'says the page time has to be started first');
  const flagged = run('screen', root, 's-login--entry', '--out', out, '--viewport', '390x844', '--theme', 'dark', '--motion', 'reduce');
  assert.match(flagged.stdout, /"viewport":\{"width":390,"height":844\}/);
  assert.match(flagged.stdout, /"pageHeight":844/);
  assert.match(flagged.stdout, /"motion":"reduce"/);
});

test('cli screen: usage errors exit 2 and say why', () => {
  const root = writeRepo(marketingFiles());
  const out = join(tmp(), 'shots');
  const files = marketingFiles();
  files[`${BASE}/index.md`] = files[`${BASE}/index.md`].replace('viewport: 1440x900\n', '');
  const cases = [
    [['screen'], /仓库根/],
    [['screen', root], /状态 id/],
    [['screen', root, 's-login--entry'], /--out/],
    [['screen', root, 's-login--entry', 'extra', '--out', out], /多出/],
    [['screen', root, 'a/b', '--out', out], /状态/],
    [['screen', writeRepo(files), 's-login--entry', '--out', out], /viewport/],
    [['screen', root, 's-login--entry', '--out', out, '--bogus', 'x'], /不认识的选项/],
    [['screen', writeRepo({ 'README.md': 'x' }), 's-login--entry', '--out', out], /docs/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, pattern, args.join(' '));
  }
  assert.equal(run('screen', writeRepo(files), 's-login--entry', '--out', out, '--viewport', '1440x900').status, 0);
});
