/**
 * Tripwire — each rule that used to be written in several places is written once, in its owner, and the other places
 * point at it (docs/spec/skill-rewrite, ticket 16; the owners are the rows of writing-for-agents' 规矩的归属 table).
 * The behaviour is skill text, so this reads the text: it catches a rule being written out again in a second place, or a
 * pointer being dropped. It cannot see whether an agent follows the pointer.
 *
 * Covered here: the SEO direction agents' prompt lines, the first-round stock issues in the review report, the
 * implementer's pre-hand-back test list, the Linear paragraphs of issue-triage / issue-triager, the slug and link
 * rules, and the goal-style wording of the flat-layout migration. The comment marker, the shelved designs, the
 * 规矩的归属 rows and the project-directory sentence are pinned in their own older tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');

const SEO_AGENTS = ['backlink-analyst', 'geo-analyst', 'keyword-miner', 'page-optimizer', 'technical-auditor', 'results-analyst'];

test('the six SEO direction agents do not list the prompt lines: the template in seo-scan\'s findings.md does, and the project-directory sentence stays in each', () => {
  const template = read('skills', 'seo', 'seo-scan', 'references', 'findings.md');
  assert.match(template, /## 提示模板/);
  for (const a of SEO_AGENTS) {
    const text = body(read('agents', `${a}.md`));
    assert.match(text, /提示的各行照 findings\.md 的「提示模板」/, `${a} points at the template`);
    assert.doesNotMatch(text, /OpenSEO 项目、本次额度、运行目录、今天/, `${a} lists the prompt lines again`);
    assert.match(text, /读调用方在 prompt 里给的项目目录/, `${a} keeps the shared project-directory sentence`);
    assert.match(text, /没有项目目录|缺项目目录/, `${a} says what to do without one`);
  }
});

test('the first-round stock-issue listing is written in pr\'s review report; pr-review only points at it', () => {
  const report = read('skills', 'engineering', 'pr', 'references', 'review-report.md');
  const line = report.split('\n').find((l) => l.includes('第 1 轮 review 把实现期间开的存量 issue')) ?? '';
  assert.ok(line, 'the rule is in review-report.md');
  assert.match(line, /各次停下的「已按规则处理」带 issue 链接的行/);
  const prReview = body(read('skills', 'engineering', 'pr-review', 'SKILL.md'));
  assert.match(prReview, /第 1 轮另列 implement 期间开的存量问题 issue，照 `idea-loop:pr` 的「Review 汇报」/);
  assert.doesNotMatch(prReview, /带 issue 链接的行/, 'pr-review no longer says where the issue links are taken from');
});

test('the implementer\'s test list is written once, in 做; the completion standard and implement\'s landing reference point at it', () => {
  const def = body(read('agents', 'implementer.md'));
  assert.equal(def.split('选中的存量回归').length - 1, 1, 'the list is spelled out once');
  assert.match(def, /\*\*交回前跑\*\*/);
  const done = def.slice(def.indexOf('## 完成标准'), def.indexOf('## 交回'));
  assert.match(done, /「做」里「交回前跑」的那一组全绿/);
  assert.match(done, /三条都过/);
  assert.match(done, /上面三条再过一遍/);
  const landing = read('skills', 'engineering', 'implement', 'references', 'landing-branches.md');
  assert.match(landing, /implementer\.md` 「做」里「交回前跑」的那一组/);
  assert.doesNotMatch(landing, /涉及的 API 测试/);
});

test('issue-triage and issue-triager only point at issues\' Linear way; the commands not to run are named in linear.md', () => {
  for (const text of [body(read('skills', 'engineering', 'issue-triage', 'SKILL.md')), body(read('agents', 'issue-triager.md'))]) {
    const para = text.split('\n').find((l) => l.includes('ISSUE_TRACKER.md` 第一个标题写 Linear')) ?? '';
    assert.ok(para, 'the Linear paragraph is there');
    assert.match(para, /`idea-loop:issues` 的 Linear 做法（用 Skill 工具调它）/);
    assert.doesNotMatch(para, /dyna issues (backlog|read|note|set|priority|type)|check <docs>/, 'the command names live in linear.md');
  }
  const linear = read('skills', 'engineering', 'issues', 'references', 'linear.md');
  for (const cmd of ['set', 'new', 'candidates', 'reconcile', 'backlog', 'read', 'note', 'priority', 'type']) assert.ok(linear.includes(`\`${cmd}\``), `linear.md names the ${cmd} command`);
  assert.match(linear, /翻状态前仍先跑 `check --from`/);
});

test('wiki-conventions keeps the slug and link rule short and the details in a reference; the flat-layout migration states goals, not git commands', () => {
  const skill = body(read('skills', 'productivity', 'wiki-conventions', 'SKILL.md'));
  assert.match(skill, /### slug 与链接/);
  assert.match(skill, /references\/slug-and-links\.md/);
  assert.ok(existsSync(join(root, 'skills', 'productivity', 'wiki-conventions', 'references', 'slug-and-links.md')));
  const details = read('skills', 'productivity', 'wiki-conventions', 'references', 'slug-and-links.md');
  for (const word of ['全局唯一', '死链', '不复用', 'dyna home adr new']) assert.ok(details.includes(word), `slug-and-links.md has ${word}`);
  const migrate = read('skills', 'productivity', 'wiki-conventions', 'references', 'migrate-flat-layout.md');
  assert.doesNotMatch(migrate, /`git [a-z]/);
  assert.equal(migrate.split('保留文件历史').length - 1, 2, 'both moves say to keep file history');
});

test('every edited SKILL.md body and agent definition stays under the 4500-character line', () => {
  const files = [
    ['skills', 'engineering', 'issues', 'SKILL.md'], ['skills', 'engineering', 'issue-session', 'SKILL.md'], ['skills', 'engineering', 'issue-dispatch', 'SKILL.md'],
    ['skills', 'engineering', 'issue-triage', 'SKILL.md'], ['skills', 'engineering', 'pr', 'SKILL.md'], ['skills', 'engineering', 'pr-review', 'SKILL.md'],
    ['skills', 'engineering', 'implement', 'SKILL.md'], ['skills', 'design', 'uiux-imagine', 'SKILL.md'], ['skills', 'design', 'uiux-refine', 'SKILL.md'],
    ['skills', 'seo', 'seo-scan', 'SKILL.md'], ['skills', 'productivity', 'writing-for-agents', 'SKILL.md'], ['skills', 'productivity', 'wiki-conventions', 'SKILL.md'],
    ['agents', 'implementer.md'], ['agents', 'issue-triager.md'], ...SEO_AGENTS.map((a) => ['agents', `${a}.md`]),
  ];
  const over = files.map((f) => [f.join('/'), [...body(read(...f))].length]).filter(([, n]) => n > 4500);
  assert.deepEqual(over, []);
});
