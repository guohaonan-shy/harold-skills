import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRound, isPlateau, validateFindings } from './critic-score.mjs';

const gap = (kind = 'craft', extra = {}) => ({ kind, where: '首页 · 默认态 · 顶部卡片', detail: '标题和数字一样重', why: '眼睛落不到要看的数字上', ...extra });

test('a finding is exactly kind / where / detail / why, with a known kind', () => {
  assert.deepEqual(validateFindings([gap(), gap('pattern'), gap('direction')]), []);
  assert.match(validateFindings([{ ...gap(), severity: 'P1' }]).join(), /unknown field "severity"/);
  assert.match(validateFindings([{ kind: 'craft', where: 'x', detail: 'y' }]).join(), /missing field "why"/);
  assert.match(validateFindings([gap('taste')]).join(), /kind "taste"/);
  assert.match(validateFindings([gap('craft', { where: null })]).join(), /where must be a string/);
  assert.match(validateFindings('x').join(), /must be an array/);
});

test('a direction gap stops the loop whatever the score', () => {
  assert.equal(checkRound([gap('direction')], 9).stop, '方向');
});

test('9 and up passes; below it continues', () => {
  assert.equal(checkRound([gap()], 9).stop, '通过');
  assert.equal(checkRound([], 10).stop, '通过');
  assert.equal(checkRound([gap()], 8, [6, 7]).stop, '继续');
});

test('three rounds in a row without beating the best before them is a bottleneck', () => {
  assert.equal(isPlateau([6, 6, 6]), false);
  assert.equal(isPlateau([6, 6, 6, 6]), true);
  assert.equal(isPlateau([5, 7, 7, 6, 7]), true);
  assert.equal(isPlateau([5, 7, 7, 6, 8]), false);
  assert.equal(checkRound([gap()], 7, [5, 7, 7, 6]).stop, '瓶颈');
  assert.equal(checkRound([gap()], 8, [5, 7, 7, 6]).stop, '继续');
});

test('an out-of-range score or a malformed history is an invalid round', () => {
  for (const score of [0, 11, 7.5, '8', null]) assert.equal(checkRound([gap()], score).valid, false, String(score));
  assert.equal(checkRound([gap()], 7, ['P1']).valid, false);
  assert.equal(checkRound([gap()], 7, ['P1']).stop, null);
});

test('the CLI exits 2 on an invalid round and prints the stop on a valid one', () => {
  const script = fileURLToPath(new URL('./critic-score.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'critic-'));
  writeFileSync(join(dir, 'ok.json'), JSON.stringify({ findings: [gap()], score: 9, history: [7, 8] }));
  writeFileSync(join(dir, 'bad.json'), JSON.stringify({ findings: [gap('taste')], score: 9 }));
  const ok = spawnSync(process.execPath, [script, join(dir, 'ok.json')], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /通过/);
  assert.equal(spawnSync(process.execPath, [script, join(dir, 'bad.json')], { encoding: 'utf8' }).status, 2);
});
