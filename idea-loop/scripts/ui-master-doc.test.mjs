/**
 * Tripwire — the critic is an advisor: its definition names the new inputs and the new output shape,
 * and carries no stop line.
 *
 * Spec refine-judge-advisor: whether a refine round stops is the human's call. The critic is not told
 * what score is good enough to ship, has no separate subtraction round, and every finding carries a
 * `reference` and every one of the human's lines of reasoning an assessment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const text = readFileSync(join(pluginRoot, 'agents', 'ui-master.md'), 'utf8');
const [, frontmatter, body] = text.split(/^---$/m);

test('the inputs include the human\'s intent and reasoning (numbered) and the 不算差距 list; the old 人保留 input is gone', () => {
  assert.match(body, /人这一轮的意图与思路/);
  assert.match(body, /每条带编号/);
  assert.match(body, /「不算差距」清单/);
  assert.doesNotMatch(body, /人保留/);
});

test('the output shape carries state, reference and reasoning, and says both are required', () => {
  for (const field of ['"state"', '"reference"', '"reasoning"', '"verdict"']) assert.ok(body.includes(field), `output shape lacks ${field}`);
  assert.match(body, /每条意见都带 `reference`/);
  assert.match(body, /`reasoning` 对「人这一轮的意图与思路」里的每一条各给一项/);
  assert.match(body, /成立 \| 存疑/);
});

test('the two standing angles are named, and there is no separate subtraction round', () => {
  assert.match(body, /每一轮，你都带着两个角度看/);
  assert.match(body, /\*\*哪里可以没有\*\*/);
  assert.match(body, /\*\*AI tells\*\*/);
  assert.doesNotMatch(body, /\*\*减法\*\*/);
});

test('motion is judged from still frames like a static', () => {
  assert.match(body, /定格帧截图/);
  assert.match(body, /照静态一样评/);
});

test('no stop line is given to the critic', () => {
  assert.doesNotMatch(text, /9 及以上|会原样发布|质量门槛|通过|瓶颈/);
  assert.match(body, /由人定/);
});

test('the description names the job and the delivery only', () => {
  const description = frontmatter.match(/^description: (.*)$/m)[1];
  assert.match(description, /设计顾问/);
  assert.match(description, /意见/);
  assert.ok(description.length < 60, `description grew: ${description}`);
  assert.doesNotMatch(description, /fable|JSON|critic-score|停|轮/);
});
