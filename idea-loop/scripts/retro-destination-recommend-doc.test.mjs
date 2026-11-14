/**
 * Tripwire — retro recommends a destination for each candidate it puts to the human.
 *
 * Before: candidate-pool.md's 「摆给人时怎么回」 said "去处由人定，你不给推荐" and retro/SKILL.md step 4 said it
 * "更不替人选去处", so every approved candidate left the human to work out the destination alone. Now retro
 * recommends: 默认进候选池 while the kind has come up 1 or 2 times, 开 issue from the 3rd (the pool's threshold);
 * the human still chooses; a bare 「批」 follows the recommendation. The rule is written once, in
 * candidate-pool.md; SKILL.md step 4 only points at it. These checks read the two files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const retroDir = join(pluginRoot, 'skills', 'productivity', 'retro');
const skill = readFileSync(join(retroDir, 'SKILL.md'), 'utf8');
const pool = readFileSync(join(retroDir, 'references', 'candidate-pool.md'), 'utf8');

const replySection = pool.split(/^## /m).find((s) => s.startsWith('摆给人时怎么回'));
const step4 = skill.split(/^## /m).find((s) => s.startsWith('4. 逐条摆给人'));

test('candidate-pool.md recommends 默认进候选池 for the 1st and 2nd time, 开 issue from the 3rd, and leaves the choice to the human', () => {
  assert.ok(replySection, 'candidate-pool.md 里没有「摆给人时怎么回」一节');
  assert.match(replySection, /默认进候选池/);
  assert.match(replySection, /第 3 次起推荐开 issue/);
  assert.match(replySection, /仍由人(选|定)/);
});

test('candidate-pool.md no longer says retro gives no recommendation', () => {
  assert.doesNotMatch(pool, /不给推荐/);
  assert.doesNotMatch(pool, /去处由人定/);
});

test('a bare 「批」 follows the recommendation and says which way it went; it is no longer a question', () => {
  assert.ok(replySection);
  assert.match(replySection, /只回了「批」[^\n]*推荐/);
  assert.doesNotMatch(replySection, /问一句去哪/);
});

test('the recommendation is written together with 「这是第 N 次，并进 <那一份>」', () => {
  assert.ok(replySection);
  assert.match(replySection, /这是第 N 次，并进/);
  assert.match(replySection, /推荐[^\n]*这是第 N 次|这是第 N 次[^\n]*推荐/);
});

test('retro/SKILL.md step 4 gives a recommendation, points at candidate-pool, and does not repeat the count or the old line', () => {
  assert.ok(step4, 'retro/SKILL.md 里没有第 4 步');
  assert.doesNotMatch(skill, /更不替人选去处/);
  assert.match(step4, /推荐/);
  assert.match(step4, /candidate-pool/);
  assert.doesNotMatch(step4, /第 3 次|3 次|三次/, '次数只写在 candidate-pool.md，SKILL.md 不重复');
});
