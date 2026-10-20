import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkResearchPage } from './research-check.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'research-check.mjs');

/**
 * One well-formed source section; every test starts from this and bends one thing.
 * A step is [thumbnail, label] or [thumbnail, label, zoomTarget]; the zoom target defaults to the
 * thumbnail's larger sibling, and `null` leaves the picture unwrapped (not clickable).
 */
const source = ({ title = 'Acme · 退出确认', steps = [['shots/acme-1.png', '点右上角 X'], ['shots/acme-2.png', '弹出确认']], scene = '练习中途想退出', logic = '二次确认防误触' } = {}) => `
<section data-source>
  <h2 data-part="source-title">${title}</h2>
  <ol data-part="flow">
${steps
  .map(([src, label, zoom = src.replace('.png', '-full.png')]) => {
    const img = `<img src="${src}" alt="">`;
    return `    <li>${zoom === null ? img : `<a data-part="zoom" href="${zoom}">${img}</a>`}${label === null ? '' : `<p>${label}</p>`}</li>`;
  })
  .join('\n')}
  </ol>
  <div data-part="scene">${scene}</div>
  <div data-part="logic">${logic}</div>
</section>`;

const page = ({
  humanWords = '练习做到一半点退出时要弹一个确认：入口用 X 还是返回箭头？',
  question = '退出确认：入口用 X 还是箭头、弹窗怎么摆',
  context = 'Toeflair 的口语练习，移动端；DESIGN.md 在项目根。',
  general = '<p>多数产品用二次确认，危险按钮在下。</p>',
  decisions = '<ol><li>入口：X 还是返回箭头？Acme 用 X，Beta 用箭头。</li></ol>',
  sources = [source()],
} = {}) => `<!doctype html>
<html><head><meta charset="utf-8"><title>调研</title><style>.x{color:red}</style></head><body>
<h1 data-part="question">${question}</h1>
<section data-part="brief"><div data-part="human-words">${humanWords}</div><div data-part="context">${context}</div></section>
<section data-part="conclusion"><div data-part="general">${general}</div><div data-part="decisions">${decisions}</div></section>
${sources.join('\n')}
</body></html>`;

const everything = () => true;
const errorsOf = (html, io = { fileExists: everything }) => checkResearchPage(html, io).errors;

test('a page with the asked block, a two-block conclusion and one complete source is valid', () => {
  const r = checkResearchPage(page(), { fileExists: everything });
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.equal(r.sources, 1);
});

for (const part of ['human-words', 'question', 'context']) {
  test(`an empty or missing ${part} fails and names it`, () => {
    const missing = page().replace(new RegExp(`(<(\\w+) data-part="${part}">)[\\s\\S]*?(</\\2>)`), '');
    assert.ok(errorsOf(missing).some((e) => e.includes(part)), errorsOf(missing).join('\n'));
    const blank = page().replace(new RegExp(`(<(\\w+) data-part="${part}">)[\\s\\S]*?(</\\2>)`), '$1  $3');
    assert.ok(errorsOf(blank).some((e) => e.includes(part)), errorsOf(blank).join('\n'));
  });
}

for (const part of ['general', 'decisions']) {
  test(`a conclusion without ${part}, or with it empty, fails and names it`, () => {
    const missing = page().replace(new RegExp(`<div data-part="${part}">[\\s\\S]*?</div>`), '');
    assert.ok(errorsOf(missing).some((e) => e.includes(part)), errorsOf(missing).join('\n'));
    const blank = page({ [part]: '  ' });
    assert.ok(errorsOf(blank).some((e) => e.includes(part)), errorsOf(blank).join('\n'));
  });
}

test('general and decisions count only inside the conclusion', () => {
  const outside = page().replace(/<section data-part="conclusion">[\s\S]*?<\/section>/, '<section data-part="conclusion"><p>结论</p></section><div data-part="general">x</div><div data-part="decisions">y</div>');
  const e = errorsOf(outside);
  assert.ok(e.some((x) => x.includes('general')) && e.some((x) => x.includes('decisions')), e.join('\n'));
});

for (const [part, over] of [['scene', { scene: '' }], ['logic', { logic: '' }]]) {
  test(`a source whose ${part} is empty fails, and the error says which source`, () => {
    const r = checkResearchPage(page({ sources: [source(), source({ title: 'Beta · 退出', ...over })] }), { fileExists: everything });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('Beta · 退出') && e.includes(part)), r.errors.join('\n'));
  });
}

test('the retired parts fail: a standalone cannot-answer block, and a for-us reading in a source', () => {
  const withCannot = page().replace('</body>', '<section data-part="cannot-answer"><p>…</p></section></body>');
  assert.ok(errorsOf(withCannot).some((e) => e.includes('cannot-answer') && e.includes('取消')), errorsOf(withCannot).join('\n'));
  const withForUs = page({ sources: [source().replace('</section>', '<div data-part="for-us">保留二次确认</div></section>')] });
  assert.ok(errorsOf(withForUs).some((e) => e.includes('for-us') && e.includes('取消')), errorsOf(withForUs).join('\n'));
});

test('a source with no flow, or a flow step with no label, fails', () => {
  const noFlow = source().replace(/<ol data-part="flow">[\s\S]*?<\/ol>/, '');
  let r = checkResearchPage(page({ sources: [noFlow] }), { fileExists: everything });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('flow')));

  r = checkResearchPage(page({ sources: [source({ steps: [['shots/a.png', '点 X'], ['shots/b.png', null]] })] }), { fileExists: everything });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('第 2 步') && e.includes('说明')), r.errors.join('\n'));
});

test('a flow step without a screenshot fails', () => {
  const md = source().replace('<img src="shots/acme-2.png" alt="">', '');
  const r = checkResearchPage(page({ sources: [md] }), { fileExists: everything });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('第 2 步') && e.includes('截图')), r.errors.join('\n'));
});

test('a screenshot that cannot be clicked to enlarge fails', () => {
  const e = errorsOf(page({ sources: [source({ steps: [['shots/a.png', '点 X', null]] })] }));
  assert.ok(e.some((x) => x.includes('第 1 步') && x.includes('放大')), e.join('\n'));
  // a link without data-part="zoom" is not the contract
  const plain = source().replace(/<a data-part="zoom" href="[^"]*">(<img[^>]*>)<\/a>/g, '<a href="shots/x.png">$1</a>');
  assert.ok(errorsOf(page({ sources: [plain] })).some((x) => x.includes('放大')));
});

test('every referenced image and zoom target must exist next to the page', () => {
  const seen = [];
  const r = checkResearchPage(page(), { fileExists: (p) => (seen.push(p), p !== 'shots/acme-2.png' && p !== 'shots/acme-1-full.png') });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('shots/acme-2.png') && /不存在/.test(e)));
  assert.ok(r.errors.some((e) => e.includes('shots/acme-1-full.png') && /不存在/.test(e)));
  assert.deepEqual([...new Set(seen)].sort(), ['shots/acme-1-full.png', 'shots/acme-1.png', 'shots/acme-2-full.png', 'shots/acme-2.png']);
});

for (const bad of ['https://images.refero.design/a.png', 'http://x/a.png', '//cdn/a.png', '/abs/a.png', 'file:///tmp/a.png', '../outside.png', 'data:image/png;base64,AAAA']) {
  test(`image address ${bad} is not a relative path inside the drop directory`, () => {
    const r = checkResearchPage(page({ sources: [source({ steps: [[bad, '点 X']] })] }), { fileExists: everything });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes(bad) && /相对/.test(e)), r.errors.join('\n'));
  });

  test(`zoom address ${bad} is not a relative path inside the drop directory`, () => {
    const r = checkResearchPage(page({ sources: [source({ steps: [['shots/a.png', '点 X', bad]] })] }), { fileExists: everything });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes(bad) && /相对/.test(e)), r.errors.join('\n'));
  });
}

test('a page with no source and no no-source reason fails; with a reason it passes', () => {
  let r = checkResearchPage(page({ sources: [] }), { fileExists: everything });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('来源')));

  r = checkResearchPage(page({ sources: ['<section data-part="no-source">搜了 screens 与 flows 三页，没有一个能呈现目标状态。</section>'] }), { fileExists: everything });
  assert.equal(r.valid, true);
  assert.equal(r.sources, 0);
});

test('markup inside comments, scripts and styles is not read as page content', () => {
  const md = page({ general: '' }).replace('<body>', '<body><!-- <div data-part="general">hidden</div> --><script>var s = \'<div data-part="general">x</div>\'</script>');
  assert.ok(errorsOf(md).some((e) => e.includes('general')));
});

test('CLI: green exits 0, a bad page exits 2 naming the problem, a missing file or no argument exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'research-check-'));
  mkdirSync(join(dir, 'shots'));
  for (const f of ['acme-1', 'acme-2']) for (const suffix of ['', '-full']) writeFileSync(join(dir, `shots/${f}${suffix}.png`), 'x');
  writeFileSync(join(dir, 'index.html'), page());
  let r = spawnSync('node', [SCRIPT, join(dir, 'index.html')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /green/);

  writeFileSync(join(dir, 'index.html'), page({ sources: [source({ steps: [['shots/gone.png', '点 X']] })] }));
  r = spawnSync('node', [SCRIPT, join(dir, 'index.html')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /shots\/gone\.png/);

  const json = spawnSync('node', [SCRIPT, join(dir, 'index.html'), '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(json.stdout).valid, false);

  assert.equal(spawnSync('node', [SCRIPT, join(dir, 'nope.html')], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status, 1);
});
