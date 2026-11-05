/**
 * Tripwire — to-spec's template is built from what each section gives the reader, and stays small.
 *
 * Spec decision-rules-who-decides, ticket 02 (issue #80). Before: the template was ten sections grown one
 * rule at a time, none said what the section gives the reader, and the SKILL.md body was ~5970 characters
 * (the repo limit is 5000). These checks pin: every section of the template opens with a 「给读者什么」 line;
 * the section list is the one the human approved (a quoted verdict line under the title instead of a 验证
 * table, 问题陈述, a 方案 that opens with an interaction sequence diagram and carries 后端 / 前端内部 /
 * 前端交互 as sub-sections, no 技术方案总览); 方案 spells out the four points of "write what the user gets
 * before how"; the how-to-write-for-a-human rules live in evidence only; the body is inside 5000
 * characters; and a spec written from the template's own lines is routed correctly by spec-status.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allAbsent, forHuman, routeOf, touchesUi, verdicts } from './spec-status.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');

const skill = read('skills', 'engineering', 'to-spec', 'SKILL.md');
const body = bodyOf(skill);
const template = body.match(/<spec-template>([\s\S]*?)<\/spec-template>/)?.[1] ?? '';

/** The template split at its `## ` headings: [{ title, text }]; the part before the first one has title null. */
function sections(text) {
  const parts = text.split(/^## /m);
  return parts.map((part, i) => (i === 0 ? { title: null, text: part } : { title: part.split('\n')[0].trim(), text: part.slice(part.indexOf('\n') + 1) }));
}
const firstLine = (text) => text.split('\n').find((l) => l.trim() !== '') ?? '';

test('the to-spec body is at most 5000 characters (UTF-8 characters, not bytes)', () => {
  assert.ok([...body].length <= 5000, `body is ${[...body].length} characters`);
  assert.ok([...skill].length <= 5000, `whole file is ${[...skill].length} characters`);
});

test('the template has a 「给读者什么」 line in the opening and at the start of every section', () => {
  assert.ok(template.length > 0, '找不到 <spec-template>');
  const parts = sections(template);
  assert.match(parts[0].text, /给读者什么：/, '开头（issue 结论）没有「给读者什么」');
  for (const { title, text } of parts.slice(1)) {
    assert.match(firstLine(text), /^给读者什么：/, `「${title}」没有以「给读者什么：」开头`);
  }
});

test('the sections are the approved ones: no 验证 table, no 技术方案总览, 问题陈述 not 问题', () => {
  const titles = sections(template).slice(1).map((s) => s.title);
  assert.deepEqual(titles, ['问题陈述', '方案', 'User Stories', '实现决策', '测试决策', 'Out of scope', '关联']);
  assert.doesNotMatch(template, /技术方案总览/);
  assert.doesNotMatch(template, /^\| issue \| 结论 \|/m, '验证表还在模板里');
  assert.match(template, /### 根因/, '「根因」是「问题陈述」的小节');
});

test('the verdict lines under the title are in the template, one per issue, in the form the scripts read', () => {
  const opening = sections(template)[0].text;
  assert.match(opening, /^> #<号> 存在：/m);
  assert.match(opening, /^> #<号> 不存在：/m);
});

test('方案 opens with an interaction sequence diagram, carries the four points, and has the three sub-sections', () => {
  const plan = sections(template).find((s) => s.title === '方案').text;
  const before = plan.split(/^### /m)[0];
  assert.match(before, /开头一张前后端或模块之间的交互时序图/);
  for (const [name, re] of [
    ['先写用户最终得到什么、由哪些输入决定，再写做法', /先写用户最终得到什么、由哪些输入决定，再写做法/],
    ['选项差在用户能感到的地方，只差内部结构的不是选项', /选项差在用户能感到的地方，只差内部结构的不是选项/],
    ['每个选项牵出的中间状态写全', /每个选项牵出的中间状态写全/],
    ['改了文字，图和测试表同步改', /改了文字，图和测试表同步改/],
  ]) assert.match(before, re, `方案缺：${name}`);
  assert.match(before, /逐个标纳入还是排除/);
  for (const sub of ['后端', '前端内部', '前端交互']) assert.match(plan, new RegExp(`### ${sub}`), `方案缺子小节：${sub}`);
  assert.match(plan, /不涉及的不写/);
});

test('实现决策 no longer carries an overview diagram; 测试决策 folds prompt/eval into the instrument table', () => {
  const decisions = sections(template).find((s) => s.title === '实现决策').text;
  assert.doesNotMatch(decisions, /总览/);
  const tests = sections(template).find((s) => s.title === '测试决策').text;
  assert.match(tests, /\| LLM 输出质量（prompt 改动） \| eval（确定性断言） \| 改了哪些 prompt/);
  assert.doesNotMatch(tests, /prompt \/ eval 变动/);
});

test('how to write for a human is a pointer to evidence, not restated rules', () => {
  assert.match(body, /`idea-loop:evidence`/);
  for (const phrase of ['陌生', '同条件', '出处']) assert.doesNotMatch(body, new RegExp(phrase), `to-spec 里还有「${phrase}」：共用写法只在 evidence`);
  // and evidence is where they live
  const evidence = read('skills', 'productivity', 'evidence', 'SKILL.md');
  for (const phrase of ['陌生', '同条件', '出处']) assert.match(evidence, new RegExp(phrase));
});

test('the process is six steps, and the raw template moved into the skill\'s own references', () => {
  const steps = body.match(/^\d+\. \*\*[^*]+\*\*/gm) ?? [];
  assert.deepEqual(steps.map((s) => s.replace(/^\d+\. /, '')), ['**开工**', '**落 raw**', '**探代码并谈 seam**', '**写 spec**', '**分流**', '**合并并收工**']);
  assert.doesNotMatch(body, /<raw-template>/);
  assert.ok(existsSync(join(pluginRoot, 'skills', 'engineering', 'to-spec', 'references', 'raw-template.md')));
  assert.match(body, /references\/raw-template\.md/);
  assert.ok(existsSync(join(pluginRoot, 'skills', 'engineering', 'to-spec', 'references', 'land-on-main.md')));
  assert.match(body, /references\/land-on-main\.md/);
});

test('a spec written from the template\'s own lines is routed by spec-status: 存在 → 正式, 待定 → 审核中, 不存在 → 完成', () => {
  const opening = sections(template)[0].text;
  const quote = (word) => opening.split('\n').find((l) => l.startsWith(`> #<号> ${word}：`)).replace('<号>', '1');
  const titles = sections(template).slice(1).map((s) => s.title);
  const build = ({ word, fork = false, ui = false }) => {
    const plan = `重试不再扣配额。\n${ui ? '\n### 前端交互\n- 点重试 → 只重跑这一题\n' : ''}`;
    const decisions = fork ? '\n### 待定：重试要不要单独计配额\n- 选项 A：…\n' : '\n无分歧。\n';
    return [
      '---', 'type: spec', 'status: 草稿', 'summary: 重试不消耗配额', 'related: []', 'issues: [1]', '---', '',
      '# 重试不消耗配额', '', quote(word), '',
      ...titles.flatMap((t) => [`## ${t}`, '', t === '方案' ? plan : t === '实现决策' ? decisions : '…', '']),
    ].join('\n');
  };
  assert.deepEqual([...verdicts(build({ word: '存在' }))], [[1, '存在']]);
  assert.equal(routeOf(build({ word: '存在' })), '正式');
  assert.equal(routeOf(build({ word: '存在', fork: true })), '审核中');
  assert.deepEqual(forHuman(build({ word: '存在', fork: true })).length, 1);
  assert.equal(routeOf(build({ word: '不存在' })), '完成');
  assert.equal(allAbsent(build({ word: '不存在' })), true);
  assert.equal(touchesUi(build({ word: '存在' })), false);
  assert.equal(touchesUi(build({ word: '存在', ui: true })), true);
});

test('issue-verify\'s self-check names the sections the new template has', () => {
  const verify = read('skills', 'engineering', 'issue-verify', 'SKILL.md');
  const check = verify.slice(verify.indexOf('## 自己校验'), verify.indexOf('## 跟人定「审核中」的'));
  assert.ok(check.length > 100, '找不到「自己校验」');
  const titles = sections(template).slice(1).map((s) => s.title).concat(['根因']);
  // every section-like name it quotes is a section of the template
  const sectionLike = new Set(['验证', '问题', '问题陈述', '方案', 'User Stories', '实现决策', '测试决策', 'Out of scope', '关联', '根因', '技术方案总览', '前端交互']);
  for (const [, name] of verify.matchAll(/「([^」]+)」/g)) {
    if (!sectionLike.has(name)) continue;
    assert.ok(titles.includes(name) || name === '前端交互', `issue-verify 引用的「${name}」不是新模板的节`);
  }
  // the verdict is written as the opening quoted line, and the old table is gone from the instructions
  assert.match(verify, /> #<号> 存在：/);
  assert.doesNotMatch(verify, /「验证」表/);
  // the present-state wording points at evidence rather than restating it
  assert.match(verify, /idea-loop:evidence/);
});

test('spec-status and issues still read the older 验证 table (documented where the format is)', () => {
  const doc = read('skills', 'engineering', 'spec-status', 'SKILL.md');
  assert.match(doc, /> #12 存在：/);
  assert.match(doc, /「验证」表.*仍然认得/);
});
