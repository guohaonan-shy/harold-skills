/**
 * Tripwire — what the session decided for the human is handed over only when it is the human's to look at, each item as a past-tense
 * question (spec decided-items-to-human, issue #531, ticket 01).
 *
 * Before (0.2.0-beta.3): home's 「其余你自己定」 asked for every self-decided thing to be listed under 「已按规则处理」 in one sentence
 * (what was done, the goal, why it reaches the goal); review-report's template wrote 「做了什么，一句。依据：一句」 and said
 * 「来自实现的还放三类」; stop-and-resume put every handled entry in; night-mode kept what it settled by recommendation 「只记进
 * review loop 文件」, out of the report the human reads.
 *
 * Whether a model sorts an item into the right side is decided by the two replay cases (`report-code-detail-not-shown`,
 * `decided-item-as-question`); this pins that the texts say the four classes, where the code-only rest goes, the shape of the
 * question, and that nothing contradicts them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const ENG = ['skills', 'engineering'];

const rules = read(...ENG, 'setup', 'references', 'home-rules.md');
const report = read(...ENG, 'pr-review', 'references', 'review-report.md');
const round = read(...ENG, 'pr-review', 'references', 'run-a-round.md');
const stop = read(...ENG, 'implement', 'references', 'stop-and-resume.md');
const night = read(...ENG, 'issue-session', 'references', 'night-mode.md');
const draft = read(...ENG, 'issue-session', 'references', 'draft-spec.md');
const cover = read('skills', 'seo', 'cover', 'SKILL.md');

/** A top-level bullet of the fixed text, with its indented sub-bullets (up to the next top-level bullet or blank line). */
function bullet(text, head) {
  const start = text.indexOf(head);
  assert.ok(start >= 0, `固定文案里找不到：${head}`);
  const rest = text.slice(start);
  const end = rest.search(/\n(?:\n|- )/);
  return end < 0 ? rest : rest.slice(0, end);
}

test('home 固定文案「其余你自己定」: four classes go to the human, the code-only rest goes to the process record', () => {
  const b = bullet(rules, '- **其余你自己定**');
  // kept word for word: another test pins the first sentence, and the human's way to take a decision back
  assert.match(b, /在交付物（交 spec 的那段话、PR 汇报、停下汇报）里列进「已按规则处理」/);
  assert.match(b, /我说推翻就改回，之后同类不再自己定/);
  for (const cls of ['改了范围', '改了用户看得到的行为', '改了 spec 的目标或方案的形状', '本该停下问我、因为我不在才替我定的']) {
    assert.ok(b.includes(cls), `四类里缺：${cls}`);
  }
  assert.match(b, /另开 issue/);
  assert.match(b, /决定不修/);
  assert.match(b, /把相邻问题并进来/);
  assert.match(b, /夜间按推荐定/);
  assert.match(b, /分不清的/, '分不清怎么办要写');
  assert.match(b, /只关于代码怎么写的/);
  assert.match(b, /review loop 文件[^\n]*「只关于代码怎么写的」/, '实现和 review 阶段的去向');
  assert.match(b, /spec 的「实现决策」/, '起草阶段的去向');
  assert.match(b, /不交给我|不贴进会话/);
});

test('home 固定文案「沟通」: under 「要我定的事写成一道题」 sits the sub-item 「替我定掉、交给我的」 (problem with an example, options, which one, why)', () => {
  const b = bullet(rules, '- **要我定的事写成一道题**');
  const line = b.split('\n').find((l) => l.startsWith('  - **替我定掉、交给我的**'));
  assert.ok(line, '「要我定的事写成一道题」下没有子项「替我定掉、交给我的」');
  assert.match(line, /过去时/);
  assert.match(line, /问题/);
  assert.match(line, /真实例子/);
  assert.match(line, /选项\*\*（至少两个）/);
  assert.match(line, /选了哪个/);
  assert.match(line, /为什么/);
  assert.match(line, /规则原文/);
  assert.match(line, /不照它做/, '照规则处理的，另一个选项是不照它做');
  assert.doesNotMatch(line, /能否撤回/, '推翻就改回已由「其余你自己定」保证，不单列');
  assert.doesNotMatch(rules, /^- \*\*替我定掉、交给我的\*\*/m, '归并进已有条目，不另起顶层条');
});

test('review-report: the 已按规则处理 row, template and bullet follow the four classes and the fixed text; the old one-sentence form and 「还放三类」 are gone', () => {
  assert.doesNotMatch(report, /做了什么，一句/);
  assert.doesNotMatch(report, /来自实现的还放三类/);
  const row = report.split('\n').find((l) => l.startsWith('| 已按规则处理 |'));
  assert.ok(row, '表里没有「已按规则处理」一行');
  assert.match(row, /四类/);
  const tpl = report.slice(report.indexOf('### 已按规则处理'), report.indexOf('### 要你决定'));
  for (const part of ['问题', '选项', '选了', '为什么']) assert.ok(tpl.includes(part), `模板里「已按规则处理」缺：${part}`);
  const item = report.split('\n').find((l) => l.startsWith('- **已按规则处理**'));
  assert.ok(item, '要点里没有「已按规则处理」一条');
  assert.match(item, /「其余你自己定」/);
  assert.match(item, /「替我定掉、交给我的」/);
  assert.match(item, /改了范围/);
  assert.doesNotMatch(item, /每条一句/);
  const rest = report.split('\n').find((l) => l.startsWith('- **只关于代码怎么写的**'));
  assert.ok(rest, '要点里没有「只关于代码怎么写的」一条');
  assert.match(rest, /不进「已按规则处理」/);
});

test('review-report: the template has a 「只关于代码怎么写的」 section that is written into the review loop file only and never pasted into the conversation; the old 「只写会改变用户看到什么的事」 line is merged into the 已按规则处理 bullet', () => {
  const start = report.indexOf('### 只关于代码怎么写的');
  assert.ok(start >= 0, '模板里没有「只关于代码怎么写的」一节');
  assert.ok(start > report.indexOf('### 合并风险'), '放在「合并风险」之后');
  assert.ok(start < report.indexOf('<details>'), '放在折叠区之前');
  const section = report.slice(start, report.indexOf('\n\n', report.indexOf('\n', start) + 1) + 1);
  assert.match(section, /只记在这里，不贴进会话/);
  assert.match(report, /这一节只进 review loop 文件，不在会话里贴/);
  assert.doesNotMatch(report, /^- \*\*只写会改变用户看到什么的事。\*\*/m, '跟已按规则处理合并成一条，不留两句冲突');
  const give = report.slice(report.indexOf('## 在会话里给人看'));
  assert.match(give, /「只关于代码怎么写的」/, '会话里贴的那一步写明这一节不贴');
});

test('run-a-round: the 已按规则处理 section holds the four classes; the rest goes to the new section', () => {
  const line = round.split('\n').find((l) => l.startsWith('- 「已按规则处理」一节'));
  assert.ok(line, 'run-a-round 没有「已按规则处理」一节的写法');
  assert.match(line, /四类/);
  assert.match(line, /「只关于代码怎么写的」/);
  assert.match(line, /〔链接〕/, '占位照旧');
});

test('stop-and-resume step 2: handled entries are split by the four classes, the code-only ones go to the new section and are not pasted', () => {
  assert.doesNotMatch(stop, /handled 的每一条进「已按规则处理」/);
  const step = stop.split('\n').find((l) => l.startsWith('2. 写汇报'));
  assert.ok(step, '没找到第 2 步');
  assert.match(step, /四类/);
  assert.match(step, /「替我定掉、交给我的」/);
  assert.match(step, /「只关于代码怎么写的」/);
  assert.match(step, /不贴/);
});

test('night-mode: what is settled by recommendation is noted in the review loop file as the directive and listed in the next report to the human', () => {
  assert.doesNotMatch(night, /只记进 review loop 文件/);
  const para = night.split('\n').find((l) => l.startsWith('**按推荐定的'));
  assert.ok(para, '没找到「按推荐定的」那一段');
  assert.match(para, /review loop 文件/);
  assert.match(para, /批示/);
  assert.match(para, /列进[^。]*交给人的汇报[^。]*「已按规则处理」/);
  assert.match(para, /「替我定掉、交给我的」/);
  assert.match(para, /早上汇总/);
  assert.match(para, /数条数/);
});

test('draft-spec keeps 「AI 照推荐定：<推荐的理由>」 in the spec and has the paragraph handed to the human write each decided item as the fixed text says; cover says the same for hosted runs', () => {
  assert.match(draft, /AI 照推荐定：<推荐的理由>/);
  const line = draft.split('\n').find((l) => /交 spec 的那段话/.test(l) && /替我定掉、交给我的/.test(l));
  assert.ok(line, 'draft-spec 没写交 spec 的那段话里每条照固定文案写');
  const hosted = cover.split('\n').find((l) => l.startsWith('人在场 = 人在这个会话里'));
  assert.ok(hosted, 'cover 没找到托管那一句');
  assert.match(hosted, /AI 照推荐定：<理由>/);
  assert.match(hosted, /汇报给人时照 home 固定文案「替我定掉、交给我的」写/);
});
