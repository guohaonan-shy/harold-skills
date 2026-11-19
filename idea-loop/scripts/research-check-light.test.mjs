/**
 * The light-use mode of research-check: the deterministic gate on the file `idea-loop:uiux-researcher`
 * hands back each design round (one item per judge opinion, a user path with pictures, a new design
 * intent). The full-page checks live in research-check.test.mjs and stay untouched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLightReturn } from './research-check.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'research-check.mjs');

const step = (over = {}) => ({
  source: 'Acme',
  saw: '练习页右上角有一个 X',
  did: '点 X',
  then: '弹出确认，危险按钮在下',
  images: ['shots/acme-1.jpg'],
  reading: '先确认再退出，防止误触丢进度',
  ...over,
});

const item = (over = {}) => ({
  covers: [1],
  path: [step(), step({ saw: '确认弹窗', did: '点「继续练习」', then: '回到练习页', images: ['shots/acme-2.jpg'] })],
  intent: '退出入口留在右上角，点后先弹确认',
  ...over,
});

const ok = (over = {}) => ({ mode: 'light', mobbin: 'connected', items: [item()], ...over });
const ctx = (over = {}) => ({ fileExists: () => true, opinions: [1], ...over });
const errorsOf = (data, c = ctx()) => checkLightReturn(data, c).errors;

test('a return with a complete item covering the one opinion is valid', () => {
  const r = checkLightReturn(ok(), ctx());
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.equal(r.items, 1);
});

test('an item without a path, or with an empty one, fails', () => {
  for (const path of [undefined, []]) {
    const e = errorsOf(ok({ items: [item({ path })] }));
    assert.ok(e.some((x) => x.includes('用户路径')), e.join('\n'));
  }
});

test('a step without a picture fails; so does one with more than two', () => {
  for (const images of [undefined, [], ['shots/a.jpg', 'shots/b.jpg', 'shots/c.jpg']]) {
    const e = errorsOf(ok({ items: [item({ path: [step({ images })] })] }));
    assert.ok(e.some((x) => x.includes('第 1 步') && x.includes('图')), e.join('\n'));
  }
});

test('a step whose picture is not a relative path inside the drop directory, or does not exist, fails', () => {
  for (const bad of ['https://mobbin.com/api/mcp/short/abcd1234', '/tmp/a.jpg', '../a.jpg', 'data:image/jpeg;base64,AAAA']) {
    const e = errorsOf(ok({ items: [item({ path: [step({ images: [bad] })] })] }));
    assert.ok(e.some((x) => x.includes(bad)), `${bad}: ${e.join('\n')}`);
  }
  const e = errorsOf(ok(), ctx({ fileExists: (p) => p !== 'shots/acme-1.jpg' }));
  assert.ok(e.some((x) => x.includes('shots/acme-1.jpg') && x.includes('不存在')), e.join('\n'));
});

test('a step without its reading fails; so does a blank one', () => {
  for (const reading of [undefined, '', '  ']) {
    const e = errorsOf(ok({ items: [item({ path: [step({ reading })] })] }));
    assert.ok(e.some((x) => x.includes('第 1 步') && x.includes('解读')), e.join('\n'));
  }
});

test('a step must say what was seen, what was done and what came next', () => {
  for (const field of ['saw', 'did', 'then']) {
    const e = errorsOf(ok({ items: [item({ path: [step({ [field]: '' })] })] }));
    assert.ok(e.some((x) => x.includes('第 1 步') && x.includes(field)), `${field}: ${e.join('\n')}`);
  }
});

test('an item without the new design intent fails', () => {
  for (const intent of [undefined, '', '  ']) {
    const e = errorsOf(ok({ items: [item({ intent })] }));
    assert.ok(e.some((x) => x.includes('设计意图')), e.join('\n'));
  }
});

test('an overturn needs a ledger number and a reason', () => {
  const withOverturn = (o) => ok({ items: [item({ overturns: [o] })] });
  assert.deepEqual(errorsOf(withOverturn({ ledger: '1.2', why: '这条决定让退出入口藏在二级菜单，用户找不到' }), ctx({ ledger: ['1.1', '1.2'] })), []);

  for (const why of [undefined, '', '  ']) {
    const e = errorsOf(withOverturn({ ledger: '1.2', why }), ctx({ ledger: ['1.2'] }));
    assert.ok(e.some((x) => x.includes('推翻') && x.includes('理由')), e.join('\n'));
  }
  for (const ledger of [undefined, '', 'abc']) {
    const e = errorsOf(withOverturn({ ledger, why: '理由' }));
    assert.ok(e.some((x) => x.includes('推翻') && x.includes('编号')), e.join('\n'));
  }
  const unknown = errorsOf(withOverturn({ ledger: '3.9', why: '理由' }), ctx({ ledger: ['1.1'] }));
  assert.ok(unknown.some((x) => x.includes('3.9') && x.includes('ledger')), unknown.join('\n'));
});

test('an opinion no item covers fails, unless the return says why it was left out', () => {
  const two = ctx({ opinions: [1, 2] });
  const e = errorsOf(ok(), two);
  assert.ok(e.some((x) => x.includes('评委意见 2') && x.includes('没有被覆盖')), e.join('\n'));

  assert.deepEqual(errorsOf(ok({ uncovered: [{ opinion: 2, why: 'Mobbin 搜不到能呈现这个状态的参考' }] }), two), []);
  const blank = errorsOf(ok({ uncovered: [{ opinion: 2, why: ' ' }] }), two);
  assert.ok(blank.some((x) => x.includes('评委意见 2') && x.includes('没有被覆盖')), blank.join('\n'));
});

test('one item may merge several opinions; an opinion in two items, or one the judge never gave, fails', () => {
  const three = ctx({ opinions: [1, 2, 3] });
  assert.deepEqual(errorsOf(ok({ items: [item({ covers: [1, 2] }), item({ covers: [3] })] }), three), []);

  const twice = errorsOf(ok({ items: [item({ covers: [1, 2] }), item({ covers: [2, 3] })] }), three);
  assert.ok(twice.some((x) => x.includes('评委意见 2') && x.includes('两项')), twice.join('\n'));

  const stray = errorsOf(ok({ items: [item({ covers: [1, 7] })] }), three);
  assert.ok(stray.some((x) => x.includes('7')), stray.join('\n'));

  const none = errorsOf(ok({ items: [item({ covers: [] })] }));
  assert.ok(none.some((x) => x.includes('covers')), none.join('\n'));
});

test('"Mobbin not connected" is a valid return: the standard line, a reason, no items', () => {
  const down = { mode: 'light', mobbin: 'unavailable', message: '这一轮没有参考图：Mobbin 没连上', reason: 'search_screens 返回要先登录', items: [] };
  const r = checkLightReturn(down, ctx({ opinions: [1, 2] }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);

  const noReason = errorsOf({ ...down, reason: '' });
  assert.ok(noReason.some((x) => x.includes('reason')), noReason.join('\n'));
  const noLine = errorsOf({ ...down, message: '没连上' });
  assert.ok(noLine.some((x) => x.includes('这一轮没有参考图：Mobbin 没连上')), noLine.join('\n'));
  const withItems = errorsOf({ ...down, items: [item()] });
  assert.ok(withItems.some((x) => x.includes('items')), withItems.join('\n'));
});

test('an unknown mode, an unknown field, or a non-object return fails', () => {
  assert.ok(errorsOf(ok({ mode: 'page' })).some((x) => x.includes('mode')));
  assert.ok(errorsOf(ok({ extra: 1 })).some((x) => x.includes('extra')));
  assert.ok(errorsOf(ok({ items: [item({ extra: 1 })] })).some((x) => x.includes('extra')));
  assert.ok(errorsOf(ok({ items: [item({ path: [step({ extra: 1 })] })] })).some((x) => x.includes('extra')));
  assert.equal(checkLightReturn([], ctx()).valid, false);
  assert.equal(checkLightReturn(null, ctx()).valid, false);
});

test('CLI --light: green exits 0, a gap exits 2 naming it, a bad --opinions or an unreadable file exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'research-light-'));
  mkdirSync(join(dir, 'shots'));
  for (const f of ['acme-1', 'acme-2']) writeFileSync(join(dir, `shots/${f}.jpg`), 'x');
  const file = join(dir, 'research-light.json');
  writeFileSync(file, JSON.stringify(ok()));

  let r = spawnSync('node', [SCRIPT, '--light', file, '--opinions=1'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /green/);

  r = spawnSync('node', [SCRIPT, '--light', file, '--opinions=1,2'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /评委意见 2/);

  r = spawnSync('node', [SCRIPT, '--light', file, '--opinions=1', '--ledger=1.1,1.2', '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(r.stdout).valid, true);

  assert.equal(spawnSync('node', [SCRIPT, '--light', file], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync('node', [SCRIPT, '--light', join(dir, 'nope.json'), '--opinions=1'], { encoding: 'utf8' }).status, 1);
  writeFileSync(file, '{not json');
  assert.equal(spawnSync('node', [SCRIPT, '--light', file, '--opinions=1'], { encoding: 'utf8' }).status, 1);
});
