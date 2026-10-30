/**
 * Tripwire — the implementer's definition picks skills from the ticket, treats the spec as readable
 * background, and reads the target repo's written standards before it writes.
 *
 * Spec implementer-reuse-and-compact, ticket 01 (issue #147). Before: the definition hard-coded
 * "wiki-conventions, tdd, decision-rules" as the start-up skills, told the executor to read only the
 * spec's 测试决策, and never mentioned CODING_STANDARDS.md — so a ticket that rewrote a skill file was
 * built without the writing rules the review's Standards axis then judged it by. These checks pin the
 * sentences that carry the change: only decision-rules is a must-call, the rest is picked by the
 * ticket's content; the spec's scope is "the ticket decides"; "开工前" points at CODING_STANDARDS.md and
 * what it links to, worded the same way review-standards.md words it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `implementer.md has no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const doc = read('agents', 'implementer.md');
const opening = doc.slice(0, doc.indexOf('\n## '));
const standardsRule = read('skills', 'engineering', 'pr-review', 'references', 'review-standards.md');

test('only decision-rules is a must-call at start-up; the other skills are picked from the ticket', () => {
  const mustCall = opening.split(/[。\n]/).find((s) => s.includes('开工先'));
  assert.ok(mustCall, '开头缺「开工先……」那一句：decision-rules 是开工必调');
  assert.match(mustCall, /idea-loop:decision-rules/, 'decision-rules 要留在「开工先」那一句里');
  for (const skill of ['idea-loop:wiki-conventions', 'idea-loop:tdd']) {
    assert.ok(!mustCall.includes(skill), `「开工先」那一句不该再点名 ${skill}：它跟其它 skill 一样看工单挑`);
  }
  assert.doesNotMatch(doc, /wiki-conventions[^。\n]*tdd[^。\n]*decision-rules/, '三个 skill 的固定清单还在');
  assert.match(opening, /看工单|按工单|工单的内容/, '开头缺「怎么挑」：其余 skill 看工单内容自己挑');
});

test('the pick sentence gives examples, including a skill-doc ticket following the linked writing rules', () => {
  const pick = opening.split('\n').find((l) => /看工单|按工单|工单的内容/.test(l));
  assert.ok(pick, '找不到「怎么挑」那一段');
  assert.match(pick, /idea-loop:tdd/, '例子缺：按 TDD 实现代码的工单调 tdd');
  assert.match(pick, /idea-loop:wiki-conventions/, '例子缺：往 .tmp/ 放东西前调 wiki-conventions');
  assert.match(pick, /CODING_STANDARDS\.md/, '例子缺：改 skill、agent 定义、AGENTS.md 的工单照 CODING_STANDARDS.md 链接到的写法');
  assert.match(pick, /idea-loop:seo-writing/, '例子缺：写站点文章调 seo-writing');
  assert.match(pick, /不是清单|只是例子|例子/, '要说明这些是例子，不是清单');
});

test('every skill example in the pick sentence is written as "用 Skill 工具调 `<插件>:<名字>`"', () => {
  const pick = opening.split('\n').find((l) => /看工单|按工单|工单的内容/.test(l));
  assert.ok(pick, '找不到「怎么挑」那一段');
  const names = [...pick.matchAll(/`(idea-loop:[a-z-]+)`/g)].map((m) => m[1]);
  assert.ok(names.length >= 3, '例子里的 skill 名找不到');
  for (const name of names) {
    assert.ok(
      pick.includes(`用 Skill 工具调 \`${name}\``),
      `例子里的 ${name} 要写成「用 Skill 工具调 \`${name}\`」（writing-for-agents 的 SKILL-MECHANICS.md：要 agent 当场用上另一个 skill 的写法）`,
    );
  }
});

test('the spec is readable background and the ticket sets the scope', () => {
  const inputs = section(doc, '输入');
  assert.doesNotMatch(doc, /只读它的「测试决策」/, '不再规定 spec 只读测试决策');
  assert.doesNotMatch(doc, /别的部分不读/, '不再规定 spec 别的部分不读');
  const specLine = inputs.split('\n').find((l) => l.includes('spec 路径'));
  assert.ok(specLine, '「输入」里缺 spec 路径那一条');
  assert.match(specLine, /任何一节/, 'spec 任何一节都可以读');
  assert.match(specLine, /范围以工单为准/, '做什么的范围以工单为准');
});

test('开工前 reads the target repo\'s written standards, the same way the review reads them', () => {
  const before = section(doc, '开工前');
  for (const name of ['CODING_STANDARDS.md', 'REVIEW.md', 'AGENTS.md', 'CLAUDE.md']) {
    assert.ok(before.includes(name), `「开工前」缺 ${name}`);
  }
  assert.match(before, /它们链接到的文档/, '「开工前」要读它们链接到的文档');
  assert.match(before, /`@` 导入不会自动展开，被引用的文件要显式去读/, '「开工前」缺 @ 导入要显式去读那句');
  assert.match(before, /skill 目录/, '链接指到一个 skill 目录时，照着读或调那个 skill');
  // the wording is the review's: if review-standards.md changes its reading rule, this one has to follow
  for (const phrase of ['它们链接到的文档', '`@` 导入不会自动展开，被引用的文件要显式去读']) {
    assert.ok(standardsRule.includes(phrase), `review-standards.md 不再写「${phrase}」：实现和 review 读的不是同一套规范了，两边一起改`);
  }
});

test('开工前 has the executor pick the CODING_STANDARDS.md link that governs the files this ticket changes, and read or call it before writing', () => {
  const before = section(doc, '开工前');
  const step = before.split('\n').find((l) => l.includes('CODING_STANDARDS.md'));
  assert.ok(step, '「开工前」缺读 CODING_STANDARDS.md 那一步');
  assert.match(step, /「链接」/, '要点名 CODING_STANDARDS.md 的「链接」一节');
  assert.match(step, /管这张工单所改[^。；\n]*(文件|类型)/, '要在「链接」里找出管这张工单所改文件类型的那一条');
  assert.match(step, /writing-for-agents/, '要举例：改 skill、agent 定义 → writing-for-agents');
  assert.match(step, /读完或调完再动手|读完或调完.{0,6}再/, '要读完或调完那一条再动手');
});

test('the hand-back asks verified to carry one line naming the written standards the executor read', () => {
  const format = doc.slice(doc.indexOf('verified:'));
  const verifiedBlock = format.slice(0, format.indexOf('found:'));
  assert.match(verifiedBlock, /读了哪几份写法规范|读了的写法规范/, '`verified` 要有一行写读了哪几份写法规范');
});

test('README describes the implementer as reading the standards, not as calling a fixed trio', () => {
  const readme = read('README.md');
  const row = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:implement`'));
  assert.ok(row, 'README 缺 implement 那一行');
  assert.match(row, /CODING_STANDARDS\.md/, 'README 的 implement 行要说 implementer 开工前读 CODING_STANDARDS.md');
  assert.doesNotMatch(row, /wiki-conventions[^|]*tdd[^|]*decision-rules/, 'README 还写着固定的三 skill 清单');
});
