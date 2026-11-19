import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRound, validateFindings, validateReasoning } from './critic-score.mjs';

const script = fileURLToPath(new URL('./critic-score.mjs', import.meta.url));

// The state list of this canvas version and the reasoning ids the human wrote this round.
const context = { states: ['首页 · 默认态', '首页 · 加载中', '详情 · 默认态'], thoughts: ['1.1', '1.2'] };

const finding = (kind = 'craft', extra = {}) => ({
  kind,
  state: '首页 · 默认态',
  where: '顶部卡片',
  detail: '标题和数字一样重',
  why: '眼睛落不到要看的数字上',
  reference: '一张把数字放大到标题两倍的看板截图',
  ...extra,
});
const thought = (id, verdict = '成立', extra = {}) => ({ id, verdict, why: '卡片确实是用户先看的东西', ...extra });
const round = (extra = {}) => ({
  findings: [finding()],
  reasoning: [thought('1.1'), thought('1.2', '存疑')],
  score: 7,
  note: null,
  ...extra,
});

test('a well-formed round is valid and says which findings are direction', () => {
  const ok = checkRound(round(), context);
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.score, 7);
  assert.deepEqual(ok.direction, []);

  const withDirection = checkRound(
    round({ findings: [finding('craft'), finding('direction', { state: '详情 · 默认态', where: '整页版式' }), finding('pattern'), finding('direction')] }),
    context,
  );
  assert.equal(withDirection.valid, true);
  assert.deepEqual(
    withDirection.direction.map((d) => [d.n, d.state, d.where]),
    [
      [2, '详情 · 默认态', '整页版式'],
      [4, '首页 · 默认态', '顶部卡片'],
    ],
  );
});

test('no gaps and no reasoning to assess is a valid round', () => {
  const quiet = checkRound({ findings: [], reasoning: [], score: 10, note: '没有想动的地方' }, { states: ['首页 · 默认态'], thoughts: [] });
  assert.equal(quiet.valid, true);
});

test('a finding missing a field, or carrying an unknown one, is rejected', () => {
  const { reference, ...noReference } = finding();
  assert.match(validateFindings([noReference], context.states).join(), /missing field "reference"/);
  const { state, ...noState } = finding();
  assert.match(validateFindings([noState], context.states).join(), /missing field "state"/);
  assert.match(validateFindings([finding('craft', { severity: 'P1' })], context.states).join(), /unknown field "severity"/);
  assert.equal(checkRound(round({ findings: [noReference] }), context).valid, false);
  assert.equal(validateFindings('x', context.states)[0], 'findings must be an array');
});

test('a finding without a reference, or with an empty or non-string field, is rejected', () => {
  assert.match(validateFindings([finding('craft', { reference: '' })], context.states).join(), /reference must be a non-empty string/);
  assert.match(validateFindings([finding('craft', { reference: '  ' })], context.states).join(), /reference must be a non-empty string/);
  assert.match(validateFindings([finding('craft', { where: null })], context.states).join(), /where must be a non-empty string/);
});

test('a kind outside direction / pattern / craft is rejected', () => {
  assert.match(validateFindings([finding('taste')], context.states).join(), /kind "taste"/);
  assert.equal(checkRound(round({ findings: [finding('taste')] }), context).valid, false);
});

test('a state that is not in the state list is rejected', () => {
  const errors = validateFindings([finding('craft', { state: '设置 · 默认态' })], context.states).join();
  assert.match(errors, /state "设置 · 默认态" is not in this version's state list/);
  assert.equal(checkRound(round({ findings: [finding('craft', { state: '设置 · 默认态' })] }), context).valid, false);
});

test('a score outside 1–10, or not an integer, is rejected', () => {
  for (const score of [0, 11, 7.5, '8', null, undefined]) assert.equal(checkRound(round({ score }), context).valid, false, String(score));
  for (const score of [1, 10]) assert.equal(checkRound(round({ score }), context).valid, true, String(score));
});

test('a verdict outside 成立 / 存疑 is rejected', () => {
  assert.match(validateReasoning([thought('1.1', '同意'), thought('1.2')], context.thoughts).join(), /verdict "同意"/);
  assert.equal(checkRound(round({ reasoning: [thought('1.1', '同意'), thought('1.2')] }), context).valid, false);
});

test('a reasoning item missing a field or carrying an unknown one is rejected', () => {
  const { why, ...noWhy } = thought('1.1');
  assert.match(validateReasoning([noWhy, thought('1.2')], context.thoughts).join(), /missing field "why"/);
  assert.match(validateReasoning([thought('1.1', '成立', { score: 3 }), thought('1.2')], context.thoughts).join(), /unknown field "score"/);
});

test('a reasoning id the human wrote but the critic skipped is rejected', () => {
  const errors = validateReasoning([thought('1.1')], context.thoughts).join();
  assert.match(errors, /id "1\.2" has no assessment/);
  assert.equal(checkRound(round({ reasoning: [thought('1.1')] }), context).valid, false);
});

test('a reasoning id the human did not write this round is rejected, including one kept after discussion', () => {
  const errors = validateReasoning([thought('1.1'), thought('1.2'), thought('0.3')], context.thoughts).join();
  assert.match(errors, /id "0\.3" is not one of this round's reasoning/);
  assert.equal(checkRound(round({ reasoning: [thought('1.1'), thought('1.2'), thought('0.3')] }), context).valid, false);
  assert.match(validateReasoning([thought('1.1'), thought('1.1'), thought('1.2')], context.thoughts).join(), /id "1\.1" is assessed twice/);
});

test('reasoning ids compare as text, so 1 and "1" are the same id', () => {
  assert.equal(checkRound(round({ reasoning: [thought(1), thought('2')] }), { ...context, thoughts: ['1', 2] }).valid, true);
});

test('a missing or unknown top-level field is rejected', () => {
  const { note, ...noNote } = round();
  assert.match(checkRound(noNote, context).errors.join(), /missing field "note"/);
  assert.match(checkRound({ ...round(), history: [6, 7] }, context).errors.join(), /unknown field "history"/);
  assert.equal(checkRound('x', context).valid, false);
  assert.equal(checkRound(null, context).valid, false);
});

test('a malformed context is a caller error, not an invalid round', () => {
  assert.throws(() => checkRound(round(), { states: 'x', thoughts: [] }), /context.states/);
  assert.throws(() => checkRound(round(), undefined), /context must be an object/);
});

test('the CLI exits 0 and names the direction findings on a valid round, and exits 2 on an invalid one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'critic-'));
  const write = (name, value) => writeFileSync(join(dir, name), JSON.stringify(value));
  write('context.json', context);
  write('ok.json', round({ findings: [finding('craft'), finding('direction')] }));
  write('bad.json', round({ findings: [finding('craft', { state: '不存在' })] }));
  const run = (file, ...extra) => spawnSync(process.execPath, [script, join(dir, file), '--context', join(dir, 'context.json'), ...extra], { encoding: 'utf8' });

  const ok = run('ok.json');
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /合格/);
  assert.match(ok.stdout, /分数：7/);
  assert.match(ok.stdout, /方向性意见：1 条：#2 首页 · 默认态 · 顶部卡片/);
  const parsed = JSON.parse(run('ok.json', '--json').stdout);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.direction.map((d) => d.n), [2]);

  const none = (write('none.json', round()), run('none.json'));
  assert.equal(none.status, 0);
  assert.match(none.stdout, /方向性意见：无/);

  const bad = run('bad.json');
  assert.equal(bad.status, 2);
  assert.match(bad.stdout, /不合格/);
  assert.match(bad.stdout, /state "不存在"/);
});

test('the CLI exits 1 when called without the context or with an unreadable one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'critic-'));
  writeFileSync(join(dir, 'ok.json'), JSON.stringify(round()));
  writeFileSync(join(dir, 'broken.json'), '{ not json');
  writeFileSync(join(dir, 'wrong.json'), JSON.stringify({ states: 'x' }));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(run(join(dir, 'ok.json')).status, 1);
  assert.equal(run(join(dir, 'ok.json'), '--context', join(dir, 'broken.json')).status, 1);
  assert.equal(run(join(dir, 'ok.json'), '--context', join(dir, 'wrong.json')).status, 1);
});

test('the script decides nothing about stopping: no stop verdicts, no 9-point threshold, no plateau', () => {
  const source = readFileSync(script, 'utf8');
  for (const word of ['通过', '瓶颈', '继续', 'STOP_THRESHOLD', 'PLATEAU', 'isPlateau', 'history']) {
    assert.ok(!source.includes(word), `critic-score.mjs still mentions ${word}`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'critic-'));
  writeFileSync(join(dir, 'context.json'), JSON.stringify(context));
  for (const [name, value] of [['hi.json', round({ score: 10 })], ['lo.json', round({ score: 2 })], ['bad.json', round({ score: 99 })]]) {
    writeFileSync(join(dir, name), JSON.stringify(value));
    const out = spawnSync(process.execPath, [script, join(dir, name), '--context', join(dir, 'context.json')], { encoding: 'utf8' }).stdout;
    assert.doesNotMatch(out, /通过|瓶颈|继续|停止/, `${name}: ${out}`);
  }
});
