/**
 * Tripwire — the ui-measure skill says what the script does after the matrix-gaps change.
 *
 * Spec ui-measure-matrix-gaps: colors are brought to 8-bit sRGB before the exact comparison, margin and gap are
 * no longer compared, a cell may carry `reducedMotion`, and the pixel layer looks one pixel around a pixel
 * that is not close. The behaviour itself is covered by ui-compare.test.mjs; this file keeps the words that
 * tell an implementer (and `uiux-refine`'s freeze record) about it from drifting away.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = readFileSync(join(pluginRoot, 'skills', 'engineering', 'ui-measure', 'SKILL.md'), 'utf8');
const freeze = readFileSync(join(pluginRoot, 'skills', 'design', 'uiux-refine', 'references', 'freeze.md'), 'utf8');

const row = (label) => skill.split('\n').find((l) => l.startsWith('|') && l.includes(label));

test('the position row of the default tolerances lists top / left / width / height / padding, and neither margin nor gap', () => {
  const position = row('位置类');
  assert.ok(position, 'no 位置类 row');
  assert.match(position, /padding/);
  assert.doesNotMatch(position, /margin|gap/);
});

test('the skill says margin and gap are not compared, so a layout written either way gives the same verdict', () => {
  assert.match(skill, /margin[^\n]*gap[^\n]*不比|不比[^\n]*margin[^\n]*gap/);
});

test('colors are converted to 8-bit sRGB first and then compared exactly; one level off is still a finding', () => {
  assert.match(skill, /8 位 sRGB/);
  assert.match(skill, /oklch/);
  assert.match(skill, /换算[^\n]*精确|精确[^\n]*换算/);
  assert.match(skill, /颜色差一个色阶是一条发现/);
});

test('the matrix example and its field notes carry reducedMotion with both values', () => {
  assert.match(skill, /"reducedMotion": "reduce"/);
  assert.match(skill, /`reducedMotion`[^\n]*`"reduce"`[^\n]*`"no-preference"`/);
});

test('the pixel layer describes the 3×3 neighbourhood check, and still says it is not the position tolerance', () => {
  const antialias = row('抗锯齿');
  assert.ok(antialias, 'no 抗锯齿 row');
  assert.match(skill, /3×3/);
  assert.match(skill, /双向|两个方向/);
  assert.match(antialias, /它跟位置容差是两回事，各管各的/);
});

test('the freeze record lists reduced motion among the dimensions of a matrix cell', () => {
  const line = freeze.split('\n').find((l) => l.startsWith('- **矩阵**'));
  assert.ok(line, 'no 矩阵 line in the freeze summary');
  assert.match(line, /减弱动效/);
});
