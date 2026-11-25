/**
 * Tripwire — to-spec's template is written for the downstream agents (tickets, explorer, implementer, review): seven
 * sections, each opening with a line saying what it gives them; what only a human would read is gone from it.
 *
 * Spec spec-for-agents (issue #451), ticket 02. Before: the template named a human as the reader and carried a verdict
 * line per issue, reproduction figures, a root-cause sub-section, an opening sequence diagram, backend / front-end-internal
 * sub-sections and a story tree per scenario, none of which any downstream agent reads (the spec's problem statement lists
 * who reads what). These checks pin: the seven sections, each with a 「给下游什么」 line; the kept pieces (the opening
 * 「需要 grill」, 「前端交互」, 「待定」, seams, the other entrances of the same behaviour); the dropped ones are not asked for;
 * step 5 is 「交 spec」: the human reads a paragraph in the conversation (现状 → 目标 → 要你定), not the spec; and a spec
 * written from the template's own lines is read correctly by the command line (what still waits for a human, whether it
 * touches UI), which `dyna issues check` checks a flip out of triage against.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runDyna } from './dyna-test-bin.mjs';

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

test('the template has a 「给下游什么」 line in the opening and at the start of every section; nothing in it says the reader is a human', () => {
  assert.ok(template.length > 0, '找不到 <spec-template>');
  const parts = sections(template);
  assert.match(parts[0].text, /给下游什么：/, '开头没有「给下游什么」');
  for (const { title, text } of parts.slice(1)) {
    assert.match(firstLine(text), /^给下游什么：/, `「${title}」没有以「给下游什么：」开头`);
  }
  assert.doesNotMatch(template, /给读者什么/);
  assert.match(body, /spec 只给下游 agent 读/);
  assert.doesNotMatch(body, /要快速看懂问题、看到证据、做出决定/);
});

test('the sections are the seven, in order; no 验证 table, no 技术方案总览', () => {
  const titles = sections(template).slice(1).map((s) => s.title);
  assert.deepEqual(titles, ['问题陈述', '方案', 'User Stories', '实现决策', '测试决策', 'Out of scope', '关联']);
  assert.doesNotMatch(template, /技术方案总览/);
  assert.doesNotMatch(template, /^\| issue \| 结论 \|/m, '验证表还在模板里');
});

test('what only a human would read is not asked for: verdict line, reproduction figure, root-cause sub-section, sequence diagram, story tree, backend / front-end-internal sub-sections', () => {
  for (const [name, re] of [
    ['判词', /> #<号> 存在|存在」或「不存在|issue-verdicts/],
    ['复现图', /复现图|标注过的|红色光圈|先图后文字|problem-<n>/],
    ['根因小节', /### 根因/],
    ['时序图', /时序图/],
    ['story 树', /story 树|User Stories 的树|画树/],
    ['后端子小节', /### 后端/],
    ['前端内部子小节', /### 前端内部/],
    ['figures 参考', /figures/],
    ['plan-subsections 参考', /plan-subsections/],
  ]) {
    assert.doesNotMatch(body, re, `to-spec 正文还在要求：${name}`);
  }
  for (const f of ['figures.md', 'issue-verdicts.md', 'plan-subsections.md']) {
    assert.equal(existsSync(join(pluginRoot, 'skills', 'engineering', 'to-spec', 'references', f)), false, `${f} 还在`);
  }
});

test('the opening keeps 「需要 grill」; 问题陈述 is text and a path to the repro material, the cause folded in', () => {
  assert.match(sections(template)[0].text, /> 需要 grill：/);
  const problem = sections(template).find((s) => s.title === '问题陈述').text;
  assert.match(problem, /复现材料：/);
  assert.match(problem, /修正：原先认为 X，实测是 Y/);
  assert.match(problem, /未复现/);
});

test('方案 carries the four points, the other entrances of the same behaviour, and 前端交互 as its only sub-section', () => {
  const plan = sections(template).find((s) => s.title === '方案').text;
  const before = plan.split(/^### /m)[0];
  for (const [name, re] of [
    ['先写用户最终得到什么、由哪些输入决定，再写做法', /先写用户最终得到什么、由哪些输入决定，再写做法/],
    ['选项差在用户能感到的地方，只差内部结构的不是选项', /选项差在用户能感到的地方，只差内部结构的不是选项/],
    ['每个选项牵出的中间状态写全', /每个选项牵出的中间状态写全/],
    ['改了方案，测试表同步改', /改了方案，测试表同步改/],
  ]) assert.match(before, re, `方案缺：${name}`);
  assert.match(before, /逐个标纳入还是排除/);
  assert.match(plan, /### 前端交互/);
  assert.match(plan, /命令靠有没有这一小节判断 spec 碰不碰 UI/);
  assert.match(plan, /待补图/, 'uiux-refine 冻结时靠「待补图」标记换成交互图');
  assert.match(plan, /不涉及的不写/);
  assert.deepEqual([...plan.matchAll(/`### ([^`]+)`/g)].map((m) => m[1]), ['前端交互'], '方案只剩「前端交互」一个子小节');
});

test('User Stories is a numbered list; 实现决策 keeps the 待定 sub-section; 测试决策 keeps seam and 照着谁写, and the table only lists the rows this spec touches', () => {
  const stories = sections(template).find((s) => s.title === 'User Stories').text;
  assert.match(stories, /作为 <角色>，我想要 <能力>，以便 <收益>/);
  assert.match(stories, /编号跟「问题陈述」的小节对上/);
  const decisions = sections(template).find((s) => s.title === '实现决策').text;
  assert.doesNotMatch(decisions, /总览/);
  assert.match(decisions, /### 待定：<要定的问题>/);
  const tests = sections(template).find((s) => s.title === '测试决策').text;
  assert.match(tests, /\| LLM 输出质量（prompt 改动） \| eval，门槛对线上基线、不写绝对值；装了 `ai-eval` 的项目，跑流水线的改动走 eval-run，多轮对话里的一步走 eval-replay \| 改了哪些 prompt/);
  assert.doesNotMatch(tests, /prompt \/ eval 变动/);
  assert.match(tests, /\*\*seam\*\*/);
  assert.match(tests, /\*\*照着谁写\*\*/);
  assert.match(tests, /只写这次碰到的行/);
  assert.doesNotMatch(tests, /碰不到的写「不涉及」，不留空/);
});

test('how to write for a human is not in to-spec: it points at evidence only for checking the present state (step 3) and for the paragraph handed over in step 5', () => {
  assert.match(body, /`idea-loop:evidence`/);
  for (const phrase of ['陌生', '同条件', '出处']) assert.doesNotMatch(body, new RegExp(phrase), `to-spec 里还有「${phrase}」：共用写法只在 evidence`);
  const step3 = body.match(/^3\. \*\*探代码并谈 seam\*\*[\s\S]*?(?=^4\. \*\*)/m)?.[0] ?? '';
  assert.match(step3, /`idea-loop:evidence` 的「证据是什么」/);
  const step4 = body.match(/^4\. \*\*写 spec\*\*[\s\S]*?(?=^5\. \*\*)/m)?.[0] ?? '';
  assert.doesNotMatch(step4, /idea-loop:evidence/, '第 4 步不再照 evidence 写给人看');
  // and the evidence skill is where they live ('出处' lives in home's fixed 「证据」 section since #438, not in evidence)
  const evidence = read('skills', 'productivity', 'evidence', 'SKILL.md');
  for (const phrase of ['GLOSSARY', '同条件']) assert.match(evidence, new RegExp(phrase));
});

test('the process is six steps, step 5 is 「交 spec」: 现状 → 目标 → 要你定 in the conversation, the question written as home\'s 「要我定的事写成一道题」 says, the marks still left named; the raw template stays in references', () => {
  const steps = body.match(/^\d+\. \*\*[^*]+\*\*/gm) ?? [];
  assert.deepEqual(steps.map((s) => s.replace(/^\d+\. /, '')), ['**开工**', '**落 raw**', '**探代码并谈 seam**', '**写 spec**', '**交 spec**', '**提交并收工**']);
  const step5 = body.match(/^5\. \*\*交 spec\*\*[\s\S]*?(?=^6\. \*\*)/m)?.[0] ?? '';
  assert.match(step5, /会话里/);
  assert.match(step5, /现状 → 目标 → 要你定/);
  assert.match(step5, /要我定的事写成一道题/);
  assert.match(step5, /`idea-loop:evidence`/);
  assert.match(step5, /> 需要 grill/);
  assert.match(step5, /### 待定/);
  assert.match(step5, /完成条件：会话里有现状、目标、要你定，还剩的标记都点了名/);
  assert.doesNotMatch(body, /交代等人定的/);
  assert.doesNotMatch(body, /<raw-template>/);
  assert.ok(existsSync(join(pluginRoot, 'skills', 'engineering', 'to-spec', 'references', 'raw-template.md')));
  assert.match(body, /references\/raw-template\.md/);
  assert.ok(existsSync(join(pluginRoot, 'skills', 'engineering', 'to-spec', 'references', 'land-on-main.md')));
  assert.match(body, /references\/land-on-main\.md/);
});

test('a spec written from the template\'s own lines is read by `dyna issues check`: 待定 waits for a human, a UI spec waits for its frozen design', () => {
  const titles = sections(template).slice(1).map((s) => s.title);
  const build = ({ fork = false, ui = false }) => {
    const plan = `重试不再扣配额。\n${ui ? '\n### 前端交互\n- 点重试 → 只重跑这一题\n' : ''}`;
    const decisions = fork ? '\n### 待定：重试要不要单独计配额\n- 选项 A：…\n' : '\n无分歧。\n';
    return [
      '---', 'type: spec', 'summary: 重试不消耗配额', 'related: []', 'issues: [1]', '---', '',
      '# 重试不消耗配额', '',
      ...titles.flatMap((t) => [`## ${t}`, '', t === '方案' ? plan : t === '实现决策' ? decisions : '…', '']),
    ].join('\n');
  };
  // issue 1 in triage, asked whether it may go to todo: a home with this one spec in it
  const flip = (spec, ...extra) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'to-spec-flip-')));
    const home = join(root, 'home');
    const docs = join(home, 'projects', 'example-app', 'docs');
    mkdirSync(join(docs, 'spec', 'retry'), { recursive: true });
    writeFileSync(join(docs, 'spec', 'retry', 'retry.md'), spec);
    writeFileSync(join(home, 'AGENTS.md'), '# 设备\n\n## 项目\n\nexample-app（一个例子）: ~/code/example-app. Clone from https://example.test/acme/example-app if missing.\n');
    return runDyna(['issues', 'check', docs, 'todo', '1', '--from=triage', ...extra], { cwd: root, env: { IDEA_LOOP_HOME: home, HOME: root } });
  };
  const ok = flip(build({}));
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /可以翻/);
  const waits = flip(build({ fork: true }));
  assert.equal(waits.status, 1);
  assert.match(waits.stderr, /等人定的.*1 条「待定」/);
  const ui = flip(build({ ui: true }));
  assert.equal(ui.status, 1);
  assert.match(ui.stderr, /碰 UI/);
  assert.equal(flip(build({ ui: true }), '--skip-design').status, 0);
});

test('draft-spec\'s self-check names only sections the new template has', () => {
  const verify = read('skills', 'engineering', 'issue-session', 'references', 'draft-spec.md');
  const check = verify.slice(verify.indexOf('## 自己校验'), verify.indexOf('## 跟人定要 grill 的'));
  assert.ok(check.length > 100, '找不到「自己校验」');
  const titles = sections(template).slice(1).map((s) => s.title);
  const sectionLike = new Set(['验证', '问题', '问题陈述', '方案', 'User Stories', '实现决策', '测试决策', 'Out of scope', '关联', '根因', '技术方案总览', '前端交互']);
  for (const [, name] of verify.matchAll(/「([^」]+)」/g)) {
    if (!sectionLike.has(name)) continue;
    assert.ok(titles.includes(name) || name === '前端交互', `draft-spec 引用的「${name}」不是新模板的节`);
  }
  assert.doesNotMatch(verify, /「验证」表/);
  assert.match(verify, /idea-loop:evidence` 的「证据是什么」/);
});

test('the issues skill no longer documents the removed spec verdict line', () => {
  const doc = read('skills', 'engineering', 'issues', 'references', 'category-and-spec.md');
  assert.doesNotMatch(doc, /> #12 存在：/);
  assert.doesNotMatch(doc, /「验证」表/);
});
