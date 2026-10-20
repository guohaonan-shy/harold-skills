import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkResearchPage } from './research-check.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'research-check.mjs');

/** One well-formed source section; every test starts from this and bends one thing. */
const source = ({ title = 'Acme · 退出确认', steps = [['shots/acme-1.png', '点右上角 X'], ['shots/acme-2.png', '弹出确认']], scene = '练习中途想退出', logic = '二次确认防误触', forUs = '保留二次确认；不要照抄红色大按钮' } = {}) => `
<section data-source>
  <h2 data-part="source-title">${title}</h2>
  <ol data-part="flow">
${steps.map(([src, label]) => `    <li><img src="${src}" alt="">${label === null ? '' : `<p>${label}</p>`}</li>`).join('\n')}
  </ol>
  <div data-part="scene">${scene}</div>
  <div data-part="logic">${logic}</div>
  <div data-part="for-us">${forUs}</div>
</section>`;

const page = ({ question = '退出确认弹窗怎么摆', conclusion = '多数产品用二次确认。', cannot = '弹窗出现时要不要暂停计时：静态截图答不了。', sources = [source()] } = {}) => `<!doctype html>
<html><head><meta charset="utf-8"><title>调研</title><style>.x{color:red}</style></head><body>
<h1 data-part="question">${question}</h1>
<p data-part="conclusion">${conclusion}</p>
<section data-part="cannot-answer">${cannot}</section>
${sources.join('\n')}
</body></html>`;

const everything = () => true;

test('a page with question, conclusion, cannot-answer and one complete source is valid', () => {
  const r = checkResearchPage(page(), { fileExists: everything });
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.equal(r.sources, 1);
});

for (const part of ['question', 'conclusion', 'cannot-answer']) {
  test(`an empty or missing ${part} fails and names it`, () => {
    const missing = page().replace(new RegExp(`(<(\\w+) data-part="${part}">)[\\s\\S]*?(</\\2>)`), '');
    assert.equal(checkResearchPage(missing, { fileExists: everything }).valid, false);
    assert.ok(checkResearchPage(missing, { fileExists: everything }).errors.some((e) => e.includes(part)));
    const blank = page().replace(new RegExp(`(<(\\w+) data-part="${part}">)[\\s\\S]*?(</\\2>)`), '$1  $3');
    const r = checkResearchPage(blank, { fileExists: everything });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes(part)));
  });
}

for (const [part, over] of [['scene', { scene: '' }], ['logic', { logic: '' }], ['for-us', { forUs: '' }]]) {
  test(`a source whose ${part} is empty fails, and the error says which source`, () => {
    const r = checkResearchPage(page({ sources: [source(), source({ title: 'Beta · 退出', ...over })] }), { fileExists: everything });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('Beta · 退出') && e.includes(part)), r.errors.join('\n'));
  });
}

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

test('every referenced image must exist next to the page', () => {
  const seen = [];
  const r = checkResearchPage(page(), { fileExists: (p) => (seen.push(p), p !== 'shots/acme-2.png') });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('shots/acme-2.png') && /不存在/.test(e)));
  assert.deepEqual(seen.sort(), ['shots/acme-1.png', 'shots/acme-2.png']);
});

for (const bad of ['https://images.refero.design/a.png', 'http://x/a.png', '//cdn/a.png', '/abs/a.png', 'file:///tmp/a.png', '../outside.png', 'data:image/png;base64,AAAA']) {
  test(`image address ${bad} is not a relative path inside the drop directory`, () => {
    const r = checkResearchPage(page({ sources: [source({ steps: [[bad, '点 X']] })] }), { fileExists: everything });
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
  const md = page({ conclusion: '' }).replace('<body>', '<body><!-- <p data-part="conclusion">hidden</p> --><script>var s = \'<p data-part="conclusion">x</p>\'</script>');
  const r = checkResearchPage(md, { fileExists: everything });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('conclusion')));
});

test('CLI: green exits 0, a bad page exits 2 naming the problem, a missing file or no argument exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'research-check-'));
  mkdirSync(join(dir, 'shots'));
  writeFileSync(join(dir, 'shots/acme-1.png'), 'x');
  writeFileSync(join(dir, 'shots/acme-2.png'), 'x');
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
