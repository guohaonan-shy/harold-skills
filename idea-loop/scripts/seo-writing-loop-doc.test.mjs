/**
 * Pins what makes "seo-writing revises a draft until it is clean" true in the docs: the loop step in SKILL.md
 * (lint → cold-read judge → fix → back to lint, the stop condition, the three-round cap, the handback
 * fields), the judge's rubric reference (13 dimensions, local / premise, a score under 4 carries a finding,
 * anti-Goodhart, no per-category bars), where a `premise` goes, when cover / og are called again, and that
 * the SEO.md keys the loop reads (lint 配置 / 补充 lint / 第二评委) exist in the format doc and the parser —
 * and that writing 无 for the last two skips them, not stops the loop.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it
 * fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSeoMd } from './seo-md.mjs';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const readIf = (...p) => (existsSync(path(...p)) ? readFileSync(path(...p), 'utf8') : '');

const WRITING_DIR = ['skills', 'seo', 'seo-writing'];
const SKILL_FILE = readIf(...WRITING_DIR, 'SKILL.md');
const SKILL = SKILL_FILE.split(/^---\s*$/m).slice(2).join('---');
const RUBRIC = readIf(...WRITING_DIR, 'references', 'judge-rubric.md');
const LOOP = readIf(...WRITING_DIR, 'references', 'revision-loop.md');
const FORMAT = readIf('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
const ISSUE_SESSION = readIf('skills', 'engineering', 'issue-session', 'SKILL.md');

/** The body of `## <heading prefix>…` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, headingStart) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${headingStart}`));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const STEP = section(SKILL, '5. 改稿循环');
const HANDBACK = section(SKILL, '6. 检查，交回');

test('SKILL.md: a loop step sits between 写 and 检查，交回, for 按 brief 写 only', () => {
  assert.ok(STEP, 'a step 「5. 改稿循环」 exists');
  assert.ok(SKILL.indexOf('## 4. 写') < SKILL.indexOf('## 5. 改稿循环') && SKILL.indexOf('## 5. 改稿循环') < SKILL.indexOf('## 6. 检查，交回'));
  assert.match(SKILL, /^## 5\. 改稿循环（只有按 brief 写走这步）$/m);
});

test('SKILL.md: the step runs lint → judge → fix → back to lint, with the stop condition and the three-round cap', () => {
  assert.match(STEP, /1\. 跑 lint：通用写作 lint（带「写作」节的 `lintConfig`），再跑 `extraLint`/);
  assert.match(STEP, /2\. 起冷读评委子代理，按 \[`references\/judge-rubric\.md`\]\(references\/judge-rubric\.md\)/);
  assert.match(STEP, /`secondJudge`，它跟冷读评委一起打/);
  assert.match(STEP, /3\. lint 的问题和评委的 `local` 问题自己改，回到 1/);
  assert.match(STEP, /lint 一条问题没有、评委没有 `local` 问题，就是干净，结束/);
  assert.match(STEP, /最多三轮，三轮后没干净的写进交回的「没干净的」/);
  assert.match(STEP, /托管时中间不停/);
});

test('SKILL.md: 无 or an empty extraLint / secondJudge skips that one, the loop runs as usual', () => {
  assert.match(STEP, /`extraLint`、`secondJudge` 写 `无` 或没写，这一样跳过，循环照常跑/);
  // the parser agrees: 无 and a missing key both read as no value, so the skip is decidable
  const s = parseSeoMd('## 写作\n- 补充 lint：无\n- 第二评委：无\n');
  assert.equal(s.writing.extraLint, null);
  assert.equal(s.writing.secondJudge, null);
  assert.equal(parseSeoMd('## 写作\n- 文风：`a.md`\n').writing.secondJudge, null);
  assert.match(LOOP, /值是 `null`（没写，或写了 `无`）就当没有：这一样跳过，循环照常跑/);
});

test('SKILL.md: a premise is not fixed by the writer, and goes back to triage through the issue session', () => {
  assert.match(STEP, /评委报出 `premise`（改它要动论点、章节或事实断言）：不自己改/);
  assert.match(STEP, /把评委原话写进交回的 `premise` 一节/);
  assert.match(STEP, /照 `issue-session`「起草中冒出了要人定的」把 issue 翻回 triage/);
  // the phrase it points at is the one issue-session actually has
  assert.ok(ISSUE_SESSION.includes('起草中冒出了要人定的'), 'issue-session has the 「起草中冒出了要人定的」 clause');
  assert.match(ISSUE_SESSION, /issues set <docs> triage/);
  const p = LOOP.split('\n## ').find((b) => b.startsWith('`premise`')) ?? '';
  assert.match(p, /评委的原话/);
  assert.match(p, /已写的提交并 push/);
  assert.match(p, /issues set <docs> triage <号>/);
});

test('SKILL.md: cover and og are called again when the title or the one-sentence thesis changed', () => {
  assert.match(STEP, /title 或第 3 步那句论点跟出图时用的不一样了，用 Skill 工具调 `idea-loop:cover`、`idea-loop:og` 重出图/);
  for (const slug of ['cover', 'og']) {
    assert.ok(existsSync(path('skills', 'seo', slug, 'SKILL.md')), `skill ${slug} exists`);
    assert.match(readIf('skills', 'seo', slug, 'SKILL.md'), new RegExp(`^name: ${slug}$`, 'm'));
  }
  assert.match(LOOP, /## 出图跟着变/);
});

test('SKILL.md: the handback gains lint 结果, 评委轮次, 没干净的 (and premise), each defined in the loop reference', () => {
  for (const field of ['lint 结果', '评委轮次', '没干净的']) {
    assert.ok(HANDBACK.includes(field), `${field} is in the handback`);
    assert.match(LOOP.split('## 交回里多的三项')[1] ?? '', new RegExp(`\\*\\*${field}\\*\\*`), `${field} is defined in the loop reference`);
  }
  assert.ok(HANDBACK.includes('`premise`'));
});

test('SKILL.md: the body stays under 5000 characters, and the files it points at exist', () => {
  assert.ok(SKILL.length > 0 && [...SKILL].length < 5000, `body is ${[...SKILL].length} characters`);
  for (const f of ['judge-rubric.md', 'revision-loop.md']) assert.ok(existsSync(path(...WRITING_DIR, 'references', f)), f);
  assert.ok(existsSync(path('scripts', 'writing-lint.mjs')));
  assert.match(LOOP, /node "S\/writing-lint\.mjs" \[--config=<lintConfig>\]/);
});

test('the keys the loop reads exist in the SEO.md format doc and in the parser', () => {
  const read = { lintConfig: 'lint 配置', extraLint: '补充 lint', secondJudge: '第二评委' };
  const template = (FORMAT.match(/```markdown([\s\S]*?)```/) ?? [])[1] ?? '';
  const parsed = parseSeoMd(template);
  const row = FORMAT.split('\n').find((l) => l.startsWith('| 写作 |')) ?? '';
  for (const [key, name] of Object.entries(read)) {
    assert.ok(STEP.includes(`\`${key}\``) || LOOP.includes(`\`${key}\``), `the loop uses ${key}`);
    assert.ok(FORMAT.includes(`- ${name}：`), `the format doc's template has 「${name}」`);
    assert.ok(row.includes(name), `the 每节读的人 row of 写作 has 「${name}」`);
    assert.equal(parsed.confirmed[key], true, `the parser reads ${key} from the template`);
  }
  assert.match(row, /`seo-writing`（改稿循环读 lint 配置、补充 lint、第二评委）/);
  // every `writing.<key>` the loop names is a key the parser returns
  for (const [, key] of (LOOP + STEP).matchAll(/`(lintConfig|extraLint|secondJudge|voice|failures|typeField|typeMap)`/g)) {
    assert.ok(key in parseSeoMd('').writing, `${key} is a key of writing`);
  }
});

test('judge-rubric.md: 13 dimensions, 11 general and two that follow the 文章模式 / 中文版, with local / premise', () => {
  assert.ok(RUBRIC, 'the rubric reference exists');
  const dims = ['hook', 'thesis', 'arc', 'step_granularity', 'specificity', 'voice_register', 'human_warmth', 'native_zh',
    'information_gain', 'quotable_units', 'visual_argument', 'visual_clarity', 'emphasis_economy'];
  for (const [i, d] of dims.entries()) assert.match(RUBRIC, new RegExp(`^${i + 1}\\. \\*\\*${d}\\*\\*`, 'm'), d);
  assert.match(RUBRIC, /\*\*voice_register\*\*（随文章模式变）/);
  assert.match(RUBRIC, /\*\*native_zh\*\*（只评中文版/);
  assert.match(RUBRIC, /- `local`：/);
  assert.match(RUBRIC, /- `premise`：/);
  assert.match(RUBRIC, /拿不准就标 `premise`/);
  assert.match(RUBRIC, /`scope` 向上继承/);
});

test('judge-rubric.md: a score under 4 carries a finding, anti-Goodhart, a cold reader', () => {
  assert.match(RUBRIC, /低于 4 分必须带至少一条 finding/);
  assert.match(RUBRIC, /## 防刷分（anti-Goodhart）/);
  assert.match(RUBRIC, /冷读者/);
  assert.match(RUBRIC, /不给评委 brief、不给作者的话/);
});

test('judge-rubric.md: per-category bars are the project\'s, pointed at from the writing section, not in the plugin', () => {
  assert.match(RUBRIC, /项目的文风文件和失败案例文件路径/);
  assert.match(RUBRIC, /按类型调的分数线，以它为准/);
  assert.doesNotMatch(RUBRIC, /RESEARCH|DATA STUDY|PRODUCT GUIDE|STORY\b|TIPS\b|Per-category/);
});

test('revision-loop.md: the caller turns the three handback items into verified rows, so they reach the PR description', () => {
  const tail = LOOP.split('## 交回里多的三项')[1] ?? '';
  // who does it, and why this column
  assert.match(tail, /调用方（执行方）把这三项写进它自己交回的 `verified`/);
  assert.match(tail, /这一栏进 PR 描述/);
  // lint 结果 and 评委轮次: one verified row each
  assert.match(tail, /lint 结果、评委轮次各写一行/);
  // 没干净的: one 没验成 row per item, handed to the human through the PR
  assert.match(tail, /没干净的逐条写成「没验成」行/);
  assert.match(tail, /\| 没验成：<为什么没改掉> \| 人（pr-review 照 PR 描述看）/);
  // the row shape and the route to the PR it relies on are the ones the implementer and implement docs actually have
  const implementer = readIf('agents', 'implementer.md');
  assert.ok(implementer.includes('<该验而没验成的> | 没验成：<为什么> | <谁补：后续工单 / PR 交付验收 / 人>'), 'implementer handback has the 没验成 row shape');
  assert.match(readIf('skills', 'engineering', 'implement', 'SKILL.md'), /\| `verified` \| PR 描述 \|/);
});

test('revision-loop.md: the completion condition reads the same for a dirty and an all-clean draft', () => {
  const tail = LOOP.split('## 交回里多的三项')[1] ?? '';
  const done = (tail.match(/^完成条件：.*$/m) ?? [''])[0];
  // the two rows that always exist
  assert.match(done, /lint 结果、评委轮次各有一行 `verified`/);
  // the 没验成 rows exist per unfinished item, and an all-clean draft has none
  assert.match(done, /没干净的每条各有一行「没验成」/);
  assert.match(done, /全干净时没有这类行/);
  // the old wording counted the third item as always having a verified row
  assert.doesNotMatch(done, /三项各有对应的/);
});
