/**
 * Doc test — whoever runs a replay reads the two products and answers the judge's question themselves, then compares.
 *
 * Spec replay-run-large-now, ticket 06. For a large case that is the orchestrator of `idea-loop:implement`
 * (`references/replay-result.md`); for a small case it is the implementer (`references/rule-tickets.md`, read from `agents/implementer.md`). A disagreement with
 * the judge stops the run and is put to the human (orchestrator) or handed back as `blocked` (implementer); neither
 * changes the verdict by itself. No script is involved: reading a product is judgement. This test reads the documents
 * and catches a sentence being dropped; it cannot tell whether a session then does what the text says.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const result = read('skills', 'engineering', 'implement', 'references', 'replay-result.md');
// the rule-ticket steps moved out of agents/implementer.md into implement's references/rule-tickets.md
// (spec implementer-start-point-non-destructive, ticket 02); the implementer reads it behind a pointer.
const implementer = read('skills', 'engineering', 'implement', 'references', 'rule-tickets.md');
const smallLine = implementer.split('\n').find((l) => l.startsWith('  - **小的**'));

test('replay-result.md: read both products, answer the question yourself, compare with the judge', () => {
  assert.match(result, /before\/artifact\.md/, 'the before product');
  assert.match(result, /after\/artifact\.md/, 'the after product');
  assert.match(result, /是\/否题/, 'the yes/no question of the case');
  assert.match(result, /先自己答/, 'answer before looking at the judge');
  assert.match(result, /评委.*答案与出处/s, 'the judge\'s answers and cites');
});

test('replay-result.md: a disagreement stops the run before review and puts the three rulings to the human', () => {
  const m = result.match(/有一边不一致[^\n]*/);
  assert.ok(m, 'no disagreement branch');
  const branch = m[0];
  assert.match(branch, /停下，不进 review/);
  assert.match(branch, /自己对两边的答案与出处/, 'your own answers and cites');
  assert.match(branch, /评委对改前改后的答案与出处/);
  assert.match(branch, /判定对.*判定错.*用例有问题/s, 'the three rulings');
  assert.match(branch, /推荐/, 'a recommendation: your own reading');
  assert.match(result, /一致[\s\S]*按结果走/, 'agreement goes on to 「按结果走」');
});

test('replay-result.md: the comparison comes before the outcome branches, and the old outcome branches are intact', () => {
  assert.ok(result.indexOf('## 先读产物，跟评委对照') < result.indexOf('## 按结果走'));
  assert.match(result, /\*\*全过\*\*/);
  assert.match(result, /\*\*有不过的\*\*/);
  assert.match(result, /unknown argument/);
  assert.doesNotMatch(result, /夜|队列|macOS 通知|会话间消息|当场跑/);
});

test('implementer: a small case reads both products and compares with the judge; a disagreement is returned as blocked', () => {
  assert.ok(smallLine, 'the 小的 bullet is gone');
  assert.match(smallLine, /artifact\.md/, 'the products');
  assert.match(smallLine, /是\/否题/);
  assert.match(smallLine, /自己对那道是\/否题各答一次/);
  assert.match(smallLine, /评委的答案与出处/);
  assert.match(smallLine, /不一致[^。]*不自己改判，按 `blocked` 交回/);
  assert.match(smallLine, /你的答案与出处/, 'your own answers and cites');
  assert.match(smallLine, /判定对 \/ 判定错 \/ 用例有问题/, 'the three rulings');
  assert.match(smallLine, /推荐写你的读法/);
});

test('implementer: the paragraph on a judge you disagree with points at blocked, not just a remark', () => {
  assert.match(implementer, /判定会话的结论你不同意时，不自己改判：按 `blocked` 交回/);
});

test('this change added no script: the comparison is judgement, written only in the two documents', () => {
  assert.doesNotMatch(result, /node .*compare|--compare/);
  assert.doesNotMatch(smallLine, /--compare/);
});

// Review round 2 of spec skill-change-verify, ticket 01: the replay entry gives a goal case that was already done before the
// change its own options (take the rule out / the judge is wrong / a different case), so the document that tells the
// orchestrator what to put to the human must not list only the three options of a quoted case anywhere.
test('replay-result.md: every place that lists the options to the human gives both sets, by the kind of case', () => {
  const listing = result.split('\n').filter((l) => /用例有问题/.test(l));
  assert.ok(listing.length >= 1, 'no line lists the options at all');
  for (const l of listing) {
    assert.match(l, /本来不用加/, `a list of options without the already-done goal case's set: ${l.slice(0, 60)}`);
    assert.match(l, /换一个改前做不到的用例/, `a list of options without the replacement case: ${l.slice(0, 60)}`);
  }
});

test('replay-result.md: a case that did not pass is put to the human with the options its entry gives, by the kind of case', () => {
  const m = result.match(/\*\*有不过的\*\*[^\n]*/);
  assert.ok(m, 'no 有不过的 branch');
  assert.doesNotMatch(m[0], /选项就是条目里的三个处理（判定对 \/ 判定错 \/ 用例有问题）/, 'still the quoted case\'s three options for every case');
  assert.match(m[0], /选项就是条目里给这个用例写的那组/, 'the options are the entry\'s own, per case');
  assert.match(m[0], /改前就做得到的目标用例/, 'the already-done goal case is named');
  assert.match(m[0], /本来不用加/, 'its first option: the rule was not needed');
});
