/**
 * The sections script's seams: its pure functions (`attribute`, `sliceImage`) fed hand-written
 * measurements and PNGs encoded here with node's own zlib, and its command line (exit codes, stdout).
 * The browser side — the generated code actually running in Playwright — has no unit test, like
 * `ui-measure.mjs`; it is covered by running it on a real page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { BASE, MKT, MKT_ENTRY, compliantFiles, marketingFiles, writeRepo } from './design-archive-fixture.mjs';
import { attribute, buildMeasureCode, encodePng, freezeFrames, selectBlocks, sliceImage } from './design-archive-sections.mjs';
import { comparePngs, decodePng } from './ui-png-compare.mjs';

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

test('attribute: two declared headings in one block — the first starts at the block top, the second at its own heading', () => {
  const second = { ...FEATURE_B, top: 2000, bottom: 2040, block: 1 }; // now in the same block as feature-a
  const r = attribute(measurement([HEADER, HERO, FEATURE_A, second, FOOTER]));
  assert.deepEqual(r.ranges.filter((x) => ['feature-a', 'feature-b'].includes(x.id)).map((x) => [x.id, x.start, x.end]), [
    ['feature-a', 900, 2000],
    ['feature-b', 2000, 5800],
  ]);
});

test('attribute: the first section of a block starts at the lower of "block top" and "end of the section before" — a banner that overlays the block pushes it down', () => {
  // the main block begins under a sticky banner (block top 0, banner 0–100): hero must not start inside the banner
  const r = attribute(measurement([HEADER, HERO, FEATURE_A, FEATURE_B, FOOTER], { blocks: [{ top: 0, bottom: 900 }, { top: 900, bottom: 4500 }, { top: 4500, bottom: 5800 }] }));
  assert.deepEqual(r.ranges.find((x) => x.id === 'hero'), { id: 'hero', ref: `${MKT}#hero`, by: 'heading', role: 'heading', start: 100, end: 900, height: 800 });
  assert.deepEqual(r.coverage, { gaps: [], overlaps: [] });
});

test('attribute: a block\'s first heading takes the block top (the eyebrow and white space above its title go in its picture); later ones in the block start at their own heading', () => {
  // pricing-like: hero / plans / free in one block (123–2000), headings at 203, 600, 1500
  const hero = { id: 'hero', locate: { role: 'heading', name: 'h' }, found: true, top: 203, bottom: 260, block: 0 };
  const plans = { id: 'pricing', locate: { role: 'heading', name: 'p' }, found: true, top: 600, bottom: 640, block: 0 };
  const free = { id: 'pricing-free', locate: { role: 'heading', name: 'f' }, found: true, top: 1500, bottom: 1540, block: 0 };
  const r = attribute(measurement([HEADER, hero, plans, free], { blocks: [{ top: 123, bottom: 2000 }], contentinfo: { top: 2000, bottom: 2100 }, pageSize: { width: 1440, height: 2100 }, clickables: [] }));
  assert.deepEqual(r.ranges.map((x) => [x.id, x.start, x.end]), [['header', 0, 100], ['hero', 123, 600], ['pricing', 600, 1500], ['pricing-free', 1500, 2000]]);
});

test('attribute: ranges are whole pixels, and a section whose content did not change keeps its height when the section above it grows', () => {
  // real layout positions are fractional: faq is 1353.46 tall; the section above grows by 18.3 and moves it
  const mk = (shift) => measurement([
    { id: 'hero', locate: { role: 'heading', name: 'a' }, found: true, top: 6010, bottom: 6050, block: 0 },
    { id: 'faq', locate: { role: 'heading', name: 'b' }, found: true, top: 7040.94 + shift, bottom: 7090 + shift, block: 1 },
    { id: 'final-cta', locate: { role: 'heading', name: 'c' }, found: true, top: 8394.4 + shift, bottom: 8440 + shift, block: 2 },
  ], {
    blocks: [{ top: 6000, bottom: 7040.94 + shift }, { top: 7040.94 + shift, bottom: 8394.4 + shift }, { top: 8394.4 + shift, bottom: 9000 + shift }],
    contentinfo: null, clickables: [], pageSize: { width: 1440, height: 9000 + shift },
  });
  const heightOf = (m, id) => attribute(m).ranges.find((r) => r.id === id).height;
  assert.equal(heightOf(mk(0), 'faq'), heightOf(mk(18.3), 'faq'), 'same content, same height');
  assert.equal(heightOf(mk(0), 'faq'), 1353);
  for (const r of [...attribute(mk(0)).ranges, ...attribute(mk(18.3)).ranges]) {
    assert.ok(Number.isInteger(r.start) && Number.isInteger(r.end) && Number.isInteger(r.height), JSON.stringify(r));
    assert.equal(r.end - r.start, r.height);
  }
});

test('attribute: rounding may leave a pixel between two neighbouring sections; that is not reported as a gap or an overlap', () => {
  const r = attribute(measurement([
    { id: 'hero', locate: { role: 'heading', name: 'a' }, found: true, top: 100, bottom: 140, block: 0 },
    { id: 'faq', locate: { role: 'heading', name: 'b' }, found: true, top: 1000.6, bottom: 1040, block: 1 },
    { id: 'final-cta', locate: { role: 'heading', name: 'c' }, found: true, top: 2000.4, bottom: 2040, block: 2 },
  ], { blocks: [{ top: 100, bottom: 1000.6 }, { top: 1000.6, bottom: 2000.4 }, { top: 2000.4, bottom: 3000 }], contentinfo: null, clickables: [], pageSize: { width: 1440, height: 3000 } }));
  assert.deepEqual(r.coverage, { gaps: [{ from: 0, to: 100 }], overlaps: [] }, 'only the real gap above the first section');
});

// a page whose section headings are all h2 (the hero's is the h1), some of them left out of `sections`
const lrHeading = (id, level, top, block) => ({ id, locate: { role: 'heading', name: id }, found: true, level, top, bottom: top + 40, block });
const LR_BLOCKS = [{ top: 100, bottom: 900 }, { top: 900, bottom: 2000 }, { top: 2000, bottom: 3000 }, { top: 3000, bottom: 4000 }, { top: 4000, bottom: 5000 }];
const LR_HEADINGS = [
  { level: 1, name: 'hero', top: 300, bottom: 340 },
  { level: 2, name: 'trust', top: 1000, bottom: 1040 },
  { level: 3, name: 'a card inside trust', top: 1200, bottom: 1230 },
  { level: 2, name: 'faq', top: 2100, bottom: 2140 },
  { level: 2, name: 'related-content', top: 3100, bottom: 3140 },
  { level: 2, name: 'final-cta', top: 4100, bottom: 4140 },
];
const lrMeasurement = (sections, headings = LR_HEADINGS) => measurement(sections, {
  blocks: LR_BLOCKS, contentinfo: { top: 5000, bottom: 5200 }, pageSize: { width: 1440, height: 5200 }, headings,
  clickables: [
    { role: 'button', name: 'q1', top: 2200, bottom: 2230, landmark: null }, // in faq
    { role: 'link', name: 'post', top: 3200, bottom: 3230, landmark: null }, // in related-content
  ],
});
const LR_ALL = [HEADER, lrHeading('hero', 1, 300, 0), lrHeading('trust', 2, 1000, 1), lrHeading('faq', 2, 2100, 2), lrHeading('related-content', 2, 3100, 3), lrHeading('final-cta', 2, 4100, 4), { ...FOOTER, top: 5000, bottom: 5200 }];

test('attribute: every section declared → nothing undeclared; the sub-heading of a card (a deeper level) is not a section', () => {
  const r = attribute(lrMeasurement(LR_ALL));
  assert.deepEqual(r.undeclaredHeadings, []);
  assert.equal(r.ok, true);
});

test('attribute: two sections left out in the middle — the one before swallows them, nothing is orphaned, and the same-level headings are listed so the run fails', () => {
  const r = attribute(lrMeasurement(LR_ALL.filter((s) => s.id !== 'faq' && s.id !== 'related-content')));
  assert.equal(r.orphans.length, 0, 'the elements were silently handed to trust — which is exactly what must not pass');
  assert.equal(r.clickables.find((c) => c.name === 'q1').section, 'trust');
  assert.equal(r.ok, false);
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.level, h.in, h.ref]), [
    ['faq', 2, 'trust', `${MKT}#trust`],
    ['related-content', 2, 'trust', `${MKT}#trust`],
  ]);
  assert.match(r.undeclaredHeadings[0].reason, /补一段|改定位/);
});

test('attribute: an undeclared h2 inside the hero (an h1 section) is still a miss — "same level" is the level the page\'s sections use, not only the owner\'s', () => {
  const r = attribute(lrMeasurement(LR_ALL.filter((s) => s.id !== 'trust')));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.in]), [['trust', 'hero']]);
});

test('attribute: a heading inside a landmark is not a section\'s; a measurement with no headings list behaves as before', () => {
  const inFooter = lrMeasurement(LR_ALL, [...LR_HEADINGS, { level: 2, name: 'Product', top: 5050, bottom: 5080, landmark: 'contentinfo' }]);
  assert.deepEqual(attribute(inFooter).undeclaredHeadings, []);
  assert.deepEqual(attribute(measurement(ALL)).undeclaredHeadings, []);
});

test('cli attribute: an undeclared heading exits 1 and the message counts it', () => {
  const f = join(tmp(), 'm.json');
  writeFileSync(f, JSON.stringify(lrMeasurement(LR_ALL.filter((s) => s.id !== 'faq'))));
  const r = run('attribute', f);
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).undeclaredHeadings.length, 1);
  assert.match(r.stderr, /没声明的同级标题 1/);
});

// ---------- a pricing page measured on a real site (positions as measured; the copy is not the site's) ----------
//
// One top-level block holds the title, a row of three plan cards and a "not ready" box. The page was
// declared as five sections (header, pricing = the whole first block, feature-grid, faq, footer) and
// the check reported four headings of that very block as left-out sections.

const PR_BLOCKS = [{ top: 123, bottom: 1185.38 }, { top: 1225.38, bottom: 1854.22 }, { top: 1902.22, bottom: 2331.72 }];
const prHeading = (id, level, name, top, bottom, block) => ({ id, level, name, top, bottom, block, landmark: null });
const PR_HEADINGS = [
  prHeading(0, 1, 'Simple, Honest Pricing', 203, 329, 0),
  prHeading(1, 2, '1 Month', 517.38, 545.88, 0),
  prHeading(2, 2, '3 Months', 518.38, 546.88, 0),
  prHeading(3, 2, '6 Months', 517.38, 545.88, 0), // exactly the box of 1 Month
  prHeading(4, 2, 'Not ready to commit?', 1040.38, 1067.38, 0),
  prHeading(5, 2, 'What Pro Keeps Unlocking', 1329.38, 1368.38, 1),
  prHeading(6, 3, 'Your Learning Profile', 1495.38, 1517.88, 1),
  prHeading(7, 2, 'Frequently asked questions', 2041.72, 2073.72, 2),
];
const prSection = (id, heading, block) => {
  const h = PR_HEADINGS[heading];
  return { id, locate: { role: 'heading', name: h.name }, found: true, top: h.top, bottom: h.bottom, block, level: h.level, heading };
};
const PR_HEADER = { id: 'header', locate: { role: 'banner' }, found: true, top: 0, bottom: 79, block: -1, level: 2 };
const PR_FOOTER = { id: 'footer', locate: { role: 'contentinfo' }, found: true, top: 2395.72, bottom: 2513.22, block: -1, level: 2 };
const prMeasurement = (sections, headings = PR_HEADINGS) => ({
  state: 'mkt-pricing--entry', page: 'mkt-pricing', pageSize: { width: 1440, height: 2513 },
  blocks: PR_BLOCKS, contentinfo: { top: 2395.72, bottom: 2513.22 }, sections, clickables: [], headings,
});
const PR_FIVE = [PR_HEADER, prSection('pricing', 0, 0), prSection('feature-grid', 5, 1), prSection('faq', 7, 2), PR_FOOTER];
const stripIdentity = (hs) => hs.map(({ id, block, ...h }) => h); // a measurement from before headings carried one
const stripHeading = (ss) => ss.map(({ heading, ...s }) => s);

test('attribute: the pricing page declared as five sections reports nothing — the card row and the box in the block declared whole are not left-out sections', () => {
  const r = attribute(prMeasurement(PR_FIVE));
  assert.deepEqual(r.undeclaredHeadings, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ranges.map((x) => [x.id, x.start, x.end]), [
    ['header', 0, 79], ['pricing', 123, 1225], ['feature-grid', 1225, 1902], ['faq', 1902, 2395], ['footer', 2396, 2513],
  ]);
});

test('attribute: the same page measured the old way (no identity on headings or sections) gives the same answer', () => {
  const r = attribute(prMeasurement(stripHeading(PR_FIVE), stripIdentity(PR_HEADINGS)));
  assert.deepEqual(r.undeclaredHeadings, []);
});

test('attribute: a different heading with the same box as a declared one is not taken for it — judged on the element, not on coordinates', () => {
  // "1 Month" is a section (a card taken for one); "6 Months" has the very same box and used to be waved through
  const r = attribute(prMeasurement([PR_HEADER, prSection('hero', 0, 0), prSection('pricing', 1, 0), prSection('pricing-free', 4, 0), prSection('feature-grid', 5, 1), prSection('faq', 7, 2), PR_FOOTER]));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.in]), [['6 Months', 'pricing'], ['3 Months', 'pricing']]);
  assert.match(r.undeclaredHeadings[1].reason, /1 Month/, 'it says which declared heading it sits beside');
  assert.match(r.undeclaredHeadings[1].reason, /整块声明成一段/);
  assert.equal(r.ok, false);
});

// a block split into sections is checked; a row of undeclared headings inside it is not a section
const PR_SPLIT = [PR_HEADER, prSection('hero', 0, 0), prSection('pricing-free', 4, 0), prSection('feature-grid', 5, 1), prSection('faq', 7, 2), PR_FOOTER];

test('attribute: where a block is split into several sections, a row of undeclared same-level headings (a card grid) is still not a section', () => {
  const r = attribute(prMeasurement(PR_SPLIT));
  assert.deepEqual(r.undeclaredHeadings, [], 'hero ends where pricing-free starts; the three cards sit in a row inside hero');
});

test('attribute: where a block is split into several sections, a lone undeclared same-level heading in it is a miss', () => {
  const lone = [...PR_HEADINGS, prHeading(8, 2, 'Money back', 700, 730, 0)];
  const r = attribute(prMeasurement(PR_SPLIT, lone));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.in]), [['Money back', 'hero']]);
});

test('attribute: a heading in a block that no section opens is a miss, even when the section before it is a block declared whole', () => {
  // feature-grid is left out: its heading sits in block 1, and pricing-free (block 0) swallows it
  const r = attribute(prMeasurement(PR_SPLIT.filter((x) => x.id !== 'feature-grid')));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.in]), [['What Pro Keeps Unlocking', 'pricing-free']]);
});

// ---------- "same level" is every level the declared section headings use, not one picked by count ----------

test('attribute: only the header, the h1 "pricing" and the footer declared — the two h2 sections below are swallowed by pricing and listed (used to report nothing)', () => {
  const r = attribute(prMeasurement([PR_HEADER, prSection('pricing', 0, 0), PR_FOOTER]));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.level, h.in]), [
    ['What Pro Keeps Unlocking', 2, 'pricing'],
    ['Frequently asked questions', 2, 'pricing'],
  ]);
  assert.equal(r.ok, false);
  // the box inside the block declared whole and the row of plan cards are still its own content
  assert.ok(!r.undeclaredHeadings.some((h) => h.name === 'Not ready to commit?' || /Month/.test(h.name)));
});

test('attribute: "feature-grid" left out of the five — pricing (h1) and faq (h2) tie on count, and the h2 in between is still listed', () => {
  const r = attribute(prMeasurement(PR_FIVE.filter((x) => x.id !== 'feature-grid')));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.in]), [['What Pro Keeps Unlocking', 'pricing']]);
  assert.equal(r.ok, false);
});

test('attribute: the h3 headings of the plan cards stay content when the declared sections are h1 and h2', () => {
  const r = attribute(prMeasurement(PR_FIVE.filter((x) => x.id !== 'faq')));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.in]), [['Frequently asked questions', 'feature-grid']], 'only the h2; the six h3 card titles are not listed');
});

test('attribute: a level used by only one declared section still counts — an undeclared heading of that level is a miss though h2 is the common one', () => {
  // hero h1, trust h2, related-content declared at h3, final-cta h2; the block between them has no section and
  // starts with an h3. Counting levels kept only h2 and let it through.
  const sections = [HEADER, lrHeading('hero', 1, 300, 0), lrHeading('trust', 2, 1000, 1), lrHeading('related-content', 3, 3100, 3), lrHeading('final-cta', 2, 4100, 4), { ...FOOTER, top: 5000, bottom: 5200 }];
  const headings = [
    { level: 1, name: 'hero', top: 300, bottom: 340 },
    { level: 2, name: 'trust', top: 1000, bottom: 1040 },
    { level: 3, name: 'a heading nobody declared', top: 2100, bottom: 2140 },
    { level: 3, name: 'related-content', top: 3100, bottom: 3140 },
    { level: 2, name: 'final-cta', top: 4100, bottom: 4140 },
  ];
  const r = attribute(lrMeasurement(sections, headings));
  assert.deepEqual(r.undeclaredHeadings.map((h) => [h.name, h.level, h.in]), [['a heading nobody declared', 3, 'trust']]);
});

test('attribute: the two exemptions stay — a row of same-level headings is not a miss, and a block declared as one section keeps its own headings', () => {
  // the card row (h2 side by side) sits in block 0, which the pricing section holds whole
  assert.deepEqual(attribute(prMeasurement([PR_HEADER, prSection('pricing', 0, 0), prSection('feature-grid', 5, 1), prSection('faq', 7, 2), PR_FOOTER])).undeclaredHeadings, []);
  // block 0 split in two: the card row inside hero is a row, not sections
  assert.deepEqual(attribute(prMeasurement(PR_SPLIT)).undeclaredHeadings, []);
});

test('attribute: no section ends past the bottom of the page — the footer of a page 2513 tall ends at 2513, not 2514', () => {
  const r = attribute(prMeasurement(PR_FIVE));
  const footer = r.ranges.find((x) => x.id === 'footer');
  assert.deepEqual([footer.start, footer.end, footer.height], [2396, 2513, 117]);
  assert.ok(r.ranges.every((x) => x.end <= 2513));
  // cut from a picture as tall as the page, every piece is as tall as its range says
  const pieces = sliceImage(bandedPng(100, 2513, () => [10, 20, 30]), { ...r, pageWidth: 100 });
  assert.deepEqual(pieces.map((x) => x.height), r.ranges.map((x) => x.height));
});

test('attribute: each clickable carries the link address the measurement gave it', () => {
  const r = attribute(measurement(ALL, { clickables: [{ role: 'link', name: '看功能', top: 600, bottom: 620, landmark: null, href: '/pricing#faq' }, { role: 'button', name: '展开', top: 700, bottom: 720, landmark: null }] }));
  assert.equal(r.clickables[0].href, '/pricing#faq');
  assert.equal('href' in r.clickables[1], false, 'a button has none');
});

// ---------- which elements count as top-level blocks: the rule the browser code runs, over a fake tree ----------

const el = (name, props = {}, children = []) => ({ name, display: 'block', visible: true, skip: false, ...props, children });
const adapter = { display: (e) => e.display, children: (e) => e.children, shown: (e) => e.visible, skip: (e) => e.skip };
const namesOf = (list) => list.map((e) => e.name);

test('selectBlocks: the children of <main>, the visible ones', () => {
  const main = el('main', {}, [el('a'), el('b', { visible: false }), el('c')]);
  assert.deepEqual(namesOf(selectBlocks(main, adapter, { hasMain: true })), ['a', 'c']);
});

test('selectBlocks: an element that takes no space (display: contents) is replaced by its children, however deep', () => {
  const main = el('main', {}, [
    el('island1', { display: 'contents', visible: false }, [el('hero'), el('island-in-island', { display: 'contents', visible: false }, [el('demo')])]),
    el('faq'),
    el('island2', { display: 'contents', visible: false }, [el('final-cta')]),
  ]);
  assert.deepEqual(namesOf(selectBlocks(main, adapter, { hasMain: true })), ['hero', 'demo', 'faq', 'final-cta']);
});

test('selectBlocks: without <main>, the <body> children minus the skipped (landmarks, script, style) are the blocks', () => {
  const body = el('body', {}, [el('header', { skip: true }), el('s1'), el('script', { skip: true, visible: false }), el('s2'), el('footer', { skip: true })]);
  assert.deepEqual(namesOf(selectBlocks(body, adapter, { hasMain: false })), ['s1', 's2']);
});

test('selectBlocks: without <main>, a lone wrapper is gone through to the level that has several children — through single-child chains too', () => {
  const body = el('body', {}, [el('wrapper', {}, [el('inner', {}, [el('header', { skip: true }), el('hero'), el('features'), el('footer', { skip: true })])])]);
  assert.deepEqual(namesOf(selectBlocks(body, adapter, { hasMain: false })), ['hero', 'features']);
});

test('selectBlocks: a wrapper behind a display: contents element is still seen; a lone element with nothing visible inside stays the one block', () => {
  const body = el('body', {}, [el('island', { display: 'contents', visible: false }, [el('wrapper', {}, [el('a'), el('b')])])]);
  assert.deepEqual(namesOf(selectBlocks(body, adapter, { hasMain: false })), ['a', 'b']);
  const lone = el('body', {}, [el('only', {}, [el('hidden', { visible: false })])]);
  assert.deepEqual(namesOf(selectBlocks(lone, adapter, { hasMain: false })), ['only']);
});

test('selectBlocks: with <main>, a lone child is not gone through (the page said where its sections are)', () => {
  const main = el('main', {}, [el('container', {}, [el('a'), el('b')])]);
  assert.deepEqual(namesOf(selectBlocks(main, adapter, { hasMain: true })), ['container']);
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

// ---------- PNGs: built here with a different encoder from the one under test ----------

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};

/** An RGB PNG (colour type 2, no filter) whose rows come from `rowColor(y) → [r, g, b]`, with optional `patch`. */
function bandedPng(width, height, rowColor, patch = null) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const [r, g, b] = rowColor(y);
    const at = y * (stride + 1) + 1;
    for (let x = 0; x < width; x += 1) {
      const [pr, pg, pb] = patch && patch.test(x, y) ? patch.color : [r, g, b];
      raw[at + x * 3] = pr;
      raw[at + x * 3 + 1] = pg;
      raw[at + x * 3 + 2] = pb;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BAND_EDGES = [0, 100, 900, 4500, 5800, 6000]; // header hero feature-a feature-b footer
const BAND_COLORS = [[250, 0, 0], [0, 250, 0], [0, 0, 250], [250, 250, 0], [0, 250, 250]];
const bandOf = (y) => BAND_EDGES.findIndex((e, i) => y >= e && y < BAND_EDGES[i + 1]);
const longPage = (patch) => bandedPng(1440, 6000, (y) => BAND_COLORS[bandOf(y)], patch);

test('sliceImage: a 1440×6000 page cut into five, each as tall as its range; the 3600 one is whole', () => {
  const attribution = attribute(measurement(ALL));
  const pieces = sliceImage(longPage(), attribution);
  assert.deepEqual(pieces.map((p) => [p.file, p.width, p.height]), [
    [`${MKT_ENTRY}@header.png`, 1440, 100],
    [`${MKT_ENTRY}@hero.png`, 1440, 800],
    [`${MKT_ENTRY}@feature-a.png`, 1440, 3600],
    [`${MKT_ENTRY}@feature-b.png`, 1440, 1300],
    [`${MKT_ENTRY}@footer.png`, 1440, 200],
  ]);
  assert.equal(pieces.reduce((n, p) => n + p.height, 0), 6000, 'the five meet end to start and add up to the page');
  assert.deepEqual(pieces.skipped, []);
  // what is in each: its own band, top row to bottom row
  pieces.forEach((p, i) => {
    const img = decodePng(p.png);
    assert.equal(img.height, p.height);
    const px = (y) => [...img.data.subarray(y * 1440 * 4, y * 1440 * 4 + 3)];
    assert.deepEqual(px(0), BAND_COLORS[i], `${p.id} first row`);
    assert.deepEqual(px(img.height - 1), BAND_COLORS[i], `${p.id} last row`);
  });
});

test('sliceImage: a picture at 2× is cut at twice the CSS coordinates; a range outside the picture is skipped and named', () => {
  const png = bandedPng(2880, 400, (y) => [y < 200 ? 250 : 0, 0, 0]);
  const att = { state: 'p--entry', pageWidth: 1440, ranges: [{ id: 'hero', ref: 'p#hero', start: 0, end: 100 }, { id: 'tail', ref: 'p#tail', start: 400, end: 500 }] };
  const pieces = sliceImage(png, att);
  assert.deepEqual(pieces.map((p) => [p.id, p.width, p.height]), [['hero', 2880, 200]]);
  assert.deepEqual(pieces.skipped.map((s) => s.id), ['tail']);
});

test('cli slice: writes <state>@<section>.png into the directory and lists them; exit 2 for a missing picture, attribution or --out', () => {
  const dir = tmp();
  const attFile = join(dir, 'attribution.json');
  const fullFile = join(dir, 'full.png');
  writeFileSync(attFile, JSON.stringify(attribute(measurement(ALL))));
  writeFileSync(fullFile, longPage());
  const out = join(dir, 'slices');
  const r = run('slice', attFile, fullFile, '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(out).sort(), ['footer', 'feature-a', 'feature-b', 'header', 'hero'].map((s) => `${MKT_ENTRY}@${s}.png`).sort());
  assert.equal(JSON.parse(r.stdout).slices.length, 5);
  assert.equal(decodePng(readFileSync(join(out, `${MKT_ENTRY}@feature-a.png`))).height, 3600);
  assert.equal(run('slice', attFile, join(dir, 'none.png'), '--out', out).status, 2);
  assert.equal(run('slice', join(dir, 'none.json'), fullFile, '--out', out).status, 2);
  assert.equal(run('slice', attFile, fullFile).status, 2);
  writeFileSync(join(dir, 'not-a-png.png'), 'hello');
  assert.equal(run('slice', attFile, join(dir, 'not-a-png.png'), '--out', out).status, 2);
});

test('encodePng: what it writes decodes back to the same pixels', () => {
  const data = Buffer.alloc(5 * 3 * 4);
  for (let i = 0; i < data.length; i += 1) data[i] = (i * 37) % 251;
  const back = decodePng(encodePng({ width: 5, height: 3, data }));
  assert.deepEqual([back.width, back.height], [5, 3]);
  assert.deepEqual([...back.data], [...data]);
});

test('compare per section: of two groups of slices only the one whose pixels changed is beyond the tolerance', () => {
  const before = sliceImage(longPage(), attribute(measurement(ALL)));
  // a 600×400 block turns white inside feature-a (page rows 1500–1900)
  const patch = { test: (x, y) => x >= 100 && x < 700 && y >= 1500 && y < 1900, color: [255, 255, 255] };
  const after = sliceImage(longPage(patch), attribute(measurement(ALL)));
  const verdicts = Object.fromEntries(before.map((b, i) => [b.id, comparePngs(b.png, after[i].png)]));
  assert.deepEqual(Object.entries(verdicts).filter(([, v]) => !v.within).map(([id]) => id), ['feature-a']);
  assert.ok(verdicts['feature-a'].percent > 1);
});

test('compare per section: a section that got taller is beyond the tolerance by size alone', () => {
  const taller = attribute(measurement(ALL.map((s) => (s.id === 'feature-b' ? { ...s, top: 4600 } : s))));
  const base = sliceImage(longPage(), attribute(measurement(ALL)));
  const grown = { ...taller, ranges: taller.ranges.map((r) => (r.id === 'feature-b' ? { ...r, end: r.end + 100 } : r)) };
  const wider = sliceImage(longPage(), grown);
  const [b, g] = [base, wider].map((l) => l.find((p) => p.id === 'feature-b'));
  assert.equal(comparePngs(b.png, g.png).within, false);
  assert.match(comparePngs(b.png, g.png).reason, /尺寸不同/);
});

// ---------- measure: the code handed to Playwright ----------

const SECTIONS = [{ id: 'hero', locate: { role: 'heading', name: '一个价格' } }, { id: 'footer', locate: { role: 'contentinfo' } }, { id: 'feature-b', locate: { position: 3 } }];

test('buildMeasureCode: a single async function of `page` that carries the config and locates through the accessibility tree', () => {
  const code = buildMeasureCode({ state: 'p--entry', page: 'p', sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'light', motion: 'default', out: '/tmp/x.png' });
  const fn = runInNewContext(code);
  assert.equal(typeof fn, 'function');
  assert.equal(fn.constructor.name, 'AsyncFunction');
  assert.match(code, /"id":"hero"/);
  assert.match(code, /"viewport":\{"width":1440,"height":900\}/);
  assert.match(code, /"theme":"light"/);
  assert.match(code, /"motion":"default"/);
  assert.match(code, /getByRole\('heading', \{ name: sec\.locate\.name, exact: true \}\)/);
  assert.match(code, /fullPage: true/);
  assert.match(code, /scrollTo/);
  assert.match(code, /animation: none !important/);
  assert.match(code, /\/tmp\/x\.png/);
});

test('buildMeasureCode: the generated function carries the frame-freezing code, freezes the page and its embedded pages, and passes the report on', () => {
  const code = buildMeasureCode({ sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'light' });
  assert.match(code, /async function freezeFrames/);
  assert.match(code, /freezeFrames\(page, C\.freezeCss, \{ watch: true \}\)/, 'before the measuring');
  assert.match(code, /await freezeFrames\(page, C\.freezeCss\);/, 'once more before the shot');
  assert.doesNotMatch(code, /addStyleTag/, 'the style no longer goes only into the outer document');
  assert.match(code, /notFrozen/, 'the summary names the pages that could not be frozen');
});

test('buildMeasureCode: the page-side look is the tested block rule written in, takes each link\'s address and every heading, and the measurement is left on the page to be saved', () => {
  const code = buildMeasureCode({ sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'light' });
  assert.match(code, /function selectBlocks/, 'the same function the unit tests run');
  assert.match(code, /=== 'contents'/);
  assert.match(code, /getAttribute\('href'\)/);
  assert.match(code, /h1,h2,h3,h4,h5,h6/);
  assert.match(code, /window\.__designArchiveMeasure = m/);
  assert.match(code, /browser_evaluate/, 'the summary it returns says how to save the file');
  // the page-side function is an expression that it calls the embedded block rule
  const C = JSON.parse(code.match(/\)\(page, (\{.*\})\);\s*\}$/s)[1]);
  assert.doesNotThrow(() => new Function(`return ${C.collectExpr}`));
  assert.match(C.collectExpr, /function selectBlocks/);
});

// ---------- freezing motion in embedded pages: the Playwright side, over a fake page ----------
//
// `freezeFrames(page, css)` is the code that runs in the Playwright process (it is serialised into the
// generated function); the fake page is the system boundary it talks to: a frame knows its url, runs a
// function in its document, and a browser-side document is a small object here.

const fakeDoc = () => ({ styles: new Map(), noHead: false });
const fakeFrame = (url, { doc = fakeDoc(), fail = false } = {}) => ({
  url: () => url,
  doc,
  async evaluate(fn, arg) {
    if (fail) throw new Error('Execution context was destroyed');
    // a stand-in `document` for the injected function: it only needs getElementById / createElement / append
    const document = {
      head: doc.noHead ? null : { append: (n) => doc.styles.set(n.id, n.textContent) },
      documentElement: { append: (n) => doc.styles.set(n.id, n.textContent) },
      getElementById: (id) => (doc.styles.has(id) ? {} : null),
      createElement: () => ({}),
    };
    return runInNewContext(`(${fn})(${JSON.stringify(arg)})`, { document });
  },
});
const fakePage = (mainUrl, children = []) => {
  const main = fakeFrame(mainUrl);
  const frames = [main, ...children];
  return { url: () => mainUrl, mainFrame: () => main, frames: () => frames, add: (f) => frames.push(f), main };
};
const CSS = '* { animation: none !important; }';

test('freezeFrames: the page itself and every same-origin embedded page get the style; a cross-origin one does not, and is reported', async () => {
  const demo = fakeFrame('https://site.test/embed/demo');
  const blank = fakeFrame('about:blank');
  const ad = fakeFrame('https://ads.example/slot');
  const page = fakePage('https://site.test/interview', [demo, blank, ad]);
  const report = await freezeFrames(page, CSS);
  assert.equal(page.main.doc.styles.size, 1);
  assert.equal([...demo.doc.styles.values()][0], CSS, 'the same text the page got');
  assert.equal(blank.doc.styles.size, 1, 'a blank or srcdoc frame is the parent\'s origin');
  assert.equal(ad.doc.styles.size, 0, 'cross-origin: not touched');
  assert.deepEqual(report.map((r) => [r.url, r.frozen]), [
    ['https://site.test/interview', true], ['https://site.test/embed/demo', true], ['about:blank', true], ['https://ads.example/slot', false],
  ]);
  assert.match(report[3].why, /跨域/);
});

test('freezeFrames: a frame that loaded after the first pass is frozen by the next one, and a frame already frozen is not given the style twice', async () => {
  const page = fakePage('https://site.test/interview');
  await freezeFrames(page, CSS);
  const late = fakeFrame('https://site.test/embed/late');
  page.add(late);
  const second = await freezeFrames(page, CSS);
  assert.equal(late.doc.styles.size, 1);
  assert.equal(page.main.doc.styles.size, 1, 'one style element, not two');
  assert.equal(second.filter((r) => r.frozen).length, 2);
});

test('freezeFrames: a document with no <head> yet takes the style on its root element', async () => {
  const early = fakeFrame('https://site.test/embed/early', { doc: { styles: new Map(), noHead: true } });
  const page = fakePage('https://site.test/p', [early]);
  await freezeFrames(page, CSS);
  assert.equal(early.doc.styles.size, 1);
});

test('freezeFrames: a frame the browser refuses (detached, navigating away) is reported with the reason and does not stop the others', async () => {
  const gone = fakeFrame('https://site.test/embed/gone', { fail: true });
  const ok = fakeFrame('https://site.test/embed/ok');
  const report = await freezeFrames(fakePage('https://site.test/p', [gone, ok]), CSS);
  assert.deepEqual(report.map((r) => r.frozen), [true, false, true]);
  assert.match(report[1].why, /destroyed/);
});

test('freezeFrames: a frame navigating after the first pass is frozen as soon as it commits', async () => {
  const handlers = {};
  const page = { ...fakePage('https://site.test/p'), on: (ev, fn) => { handlers[ev] = fn; } };
  await freezeFrames(page, CSS, { watch: true });
  const late = fakeFrame('https://site.test/embed/late');
  page.add(late);
  await handlers.framenavigated(late);
  assert.equal(late.doc.styles.size, 1);
});

test('buildMeasureCode: reduced motion is only asked for when the settings say so', () => {
  const base = { sections: SECTIONS, viewport: { width: 1440, height: 900 }, theme: 'dark' };
  assert.match(buildMeasureCode({ ...base, motion: 'reduce' }), /"motion":"reduce"/);
  assert.match(buildMeasureCode(base), /"motion":"default"/);
});

// ---------- the command line: measure ----------

const withIndex = (extra = '') => {
  const files = marketingFiles();
  files[`${BASE}/index.md`] = files[`${BASE}/index.md`].replace('locale: zh-CN', `locale: zh-CN${extra}`);
  return files;
};

test('cli measure: takes the sections from the entry state and the viewport / theme from prod/index.md', () => {
  const r = run('measure', writeRepo(marketingFiles()), MKT_ENTRY, '--out', '/tmp/full.png');
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
