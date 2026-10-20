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
import { attribute, buildMeasureCode, encodePng, sliceImage } from './design-archive-sections.mjs';
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
