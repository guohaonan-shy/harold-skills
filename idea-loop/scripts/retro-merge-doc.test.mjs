/**
 * Tripwire — the retro 整合 card the dispatcher issues and the session it opens.
 *
 * Spec retro-batch-dispatch, ticket 04. The behaviour lives in skill text (an agent follows it), so
 * these checks pin what a reader has to be able to follow: the dispatcher's conditions for issuing a
 * 整合 card, the card title it and the session skill agree on, the session's eight steps in order, and
 * the places that must list the new skill (README, the root AGENTS.md, the plugin version). The part
 * that needs judgement — whether an agent really issues one card per day — is the spec's manual
 * test 3 and 4, not this file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pluginRoot, '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const dispatch = read('skills', 'engineering', 'issue-dispatch', 'SKILL.md');
const mergeFile = join(pluginRoot, 'skills', 'engineering', 'retro-merge', 'SKILL.md');
const merge = existsSync(mergeFile) ? readFileSync(mergeFile, 'utf8') : '';
const body = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

test('issue-dispatch issues the 整合 card by the conditions the spec fixed', () => {
  const round = section(dispatch, '每一轮');
  assert.match(round, /\*\*出整合卡片\*\*/, 'no 出整合卡片 step in 每一轮');
  const step = round.slice(round.indexOf('**出整合卡片**'));
  assert.ok(round.indexOf('**出卡片**') < round.indexOf('**出整合卡片**'), '整合 card comes after the ordinary cards');
  assert.match(step, /retro-batch/, 'the batch comes from `issues retro-batch`');
  assert.match(step, /retro 整合 /, 'no-card condition and title prefix: 「<仓库名> retro 整合 」');
  assert.match(step, /retro 整合 #<号> #<号>/, 'card title shape');
  assert.match(step, /idea-loop:retro-merge/, 'the prompt calls the 整合 skill');
  assert.match(step, /今天已经出过/, 'at most one card a day');
  assert.match(step, /不占.*位|不占任何/, 'the title takes no queue slot');
  assert.match(step, /3 张/, 'and does not count in the 3-card limit');
  assert.match(step, /unclassified|无分类/, 'uncategorised retro issues are reported');
});

test('issue-dispatch counts a 整合 session as a session of its issues, but not as a sub-session', () => {
  const round = section(dispatch, '每一轮');
  const count = round.slice(round.indexOf('**数开着的会话**'), round.indexOf('**没有会话的 issue**'));
  assert.match(count, /retro 整合 /, '整合 sessions are told apart in step 3');
  assert.match(count, /整合会话[^。]*不算子会话|不算子会话/, 'a 整合 session is not counted among the sub-sessions');
  const orphans = round.slice(round.indexOf('**没有会话的 issue**'), round.indexOf('**出卡片**'));
  assert.match(orphans, /整合会话/, 'step 4 treats a 整合 session as the issue having a session');
});

test('the report carries a 整合 card line', () => {
  const report = section(dispatch, '汇报');
  assert.match(report, /整合卡片/);
});

test('retro-merge is a model-invocable engineering skill that routes in its description', () => {
  assert.ok(existsSync(mergeFile), 'skills/engineering/retro-merge/SKILL.md does not exist');
  const fm = merge.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  assert.match(fm, /^name: retro-merge$/m);
  const desc = fm.match(/^description: (.+)$/m)?.[1] ?? '';
  assert.ok(desc.length > 0 && desc.length <= 140, `description must be one routing line, got ${desc.length} characters`);
  assert.doesNotMatch(fm, /disable-model-invocation/, 'the card calls it, so the model may invoke it');
  assert.ok([...body(merge)].length < 5000, `main body must stay under 5000 characters, got ${[...body(merge)].length}`);
});

test('retro-merge walks the eight steps, in order, and shares the card title with the dispatcher', () => {
  const b = body(merge);
  const heads = ['## 开场', '## 起草', '## 切工单、实现', '## 证明生效', '## review', '## 全程不停下', '## 停下给人看', '## 人回复后'];
  let at = -1;
  for (const h of heads) {
    const i = b.indexOf(h);
    assert.ok(i > at, `"${h}" is missing or out of order`);
    at = i;
  }
  assert.match(b, /retro 整合 #<号> #<号>/, 'the title the dispatcher issues');
  for (const part of ['detach_session', '实现中', '验证中', 'idea-loop:to-spec', 'idea-loop:to-ticket', 'idea-loop:implement', 'idea-loop:pr-review', 'issues advance']) {
    assert.ok(b.includes(part), `retro-merge does not mention ${part}`);
  }
});

test('retro-merge never stops for the human until the last step, and collects what it decided on its own', () => {
  const b = body(merge);
  assert.match(section(b, '全程不停下'), /按推荐先定，待人确认/);
  assert.match(b, /无法回放/, 'a case with no replay material is marked, not invented');
  const show = section(b, '停下给人看');
  assert.ok(show.indexOf('要你确认') >= 0 && show.indexOf('要你确认') < show.indexOf('改动点'), '「要你确认」is shown before the change points');
  assert.match(show, /review/);
  assert.match(show, /回放/);
  const after = section(b, '人回复后');
  assert.match(after, /issues drop/);
  assert.match(after, /issues unhandoff/);
  assert.match(after, /retro/);
  assert.match(after, /idea-loop:pr-review/, 'the merge goes through pr-review');
});

test('issue-dispatch description routes both kinds of card, not "one card per issue"', () => {
  const desc = dispatch.match(/^description: (.+)$/m)?.[1] ?? '';
  assert.match(desc, /整合/, 'the description mentions the retro 整合 card');
  assert.doesNotMatch(desc, /一个 issue 一张。$/, 'no longer says every issue gets a card of its own');
  assert.ok(desc.length <= 140, `description must stay one routing line, got ${desc.length} characters`);
});

test('retro-merge ends every working step with a completion condition', () => {
  const b = body(merge);
  for (const h of ['开场', '起草', '切工单、实现', '证明生效', 'review']) {
    const lines = section(b, h).split('\n').map((l) => l.trim()).filter(Boolean);
    assert.match(lines.at(-1), /^完成条件：/, `"## ${h}" does not end with 完成条件：`);
  }
});

test('retro-merge does not wait for the human to approve the ticket split either', () => {
  const b = body(merge);
  assert.match(section(b, '切工单、实现'), /切法/, 'the slicing step says what happens to to-ticket\'s show-the-split step');
  assert.match(section(b, '切工单、实现'), /不等人点头/);
  assert.match(section(b, '全程不停下'), /切法/, '全程不停下 lists the slicing step among the stops it removes');
});

test('the README, the root AGENTS.md and the plugin version know the new skill', () => {
  const readme = read('README.md');
  assert.match(readme, /\| `idea-loop:retro-merge` \|/, 'skills table row');
  assert.match(readme, /retro-merge\/SKILL\.md/, 'tree entry');
  assert.match(readme, /\| `grill`[^|]*`retro-merge`|\| `grill`[^|]*, `retro-merge`/, 'model-invocable list');
  assert.match(readme, /issue-dispatch[^\n]*整合|整合[^\n]*issue-dispatch/i, 'the dispatcher row says it issues 整合 cards');
  const agents = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf8');
  assert.match(agents, /retro-merge/, 'root AGENTS.md lists it among the model-invocable skills');
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  assert.equal(plugin.version, '0.1.4');
});
