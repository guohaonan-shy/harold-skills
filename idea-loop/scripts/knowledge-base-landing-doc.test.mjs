// The knowledge base lives in the project directory (home); every change to it is committed to home's main
// with `project-map.mjs commit`, which stages only the files it is given (docs/spec/skills-read-home, ticket 04).
// Code PRs and issue branches carry code only. The rule is written once, in wiki-conventions「知识库落地」;
// the places that used to land a stage on a work branch, or open a docs-only PR, point at it instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (text) => text.replace(/^---[\s\S]*?---\n/, '');

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}
const docs = [...files(join(root, 'skills')), ...files(join(root, 'agents')), join(root, 'README.md')];
const seoIssues = join(root, 'scripts', 'seo-issues.mjs');

test('no skill, agent or README lands knowledge-base changes on a work branch or opens a docs-only PR', () => {
  const banned = [
    /git add -f/,
    /跟代码(在)?同一个 ?PR/,
    /跟代码一个 PR/,
    /同一个 PR 里合进主分支/,
    /(?<!不)(单独)?开\*{0,2}(spec|设计) PR/,
    /经设计 PR/,
    /提交在(这个)?(需求的)?工作分支上/,
    /只改 ?`?docs\/?`? 的 PR/,
    /只改知识库的 PR/,
    /docs-only (spec )?PR/i,
    /a design PR/,
    /the design PR/,
    /through a docs-only/i,
  ];
  const hits = [];
  for (const f of [...docs, seoIssues]) {
    const text = readFileSync(f, 'utf8');
    for (const re of banned) if (re.test(text)) hits.push(`${relative(root, f)}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('the places that used to land a stage on its own point at wiki-conventions「知识库落地」', () => {
  for (const f of [
    'skills/engineering/to-spec/references/land-on-main.md',
    'skills/engineering/issue-session/references/draft-spec.md',
    'skills/engineering/issue-session/SKILL.md',
    'skills/design/uiux-refine/SKILL.md',
    'skills/productivity/decision-rules/SKILL.md',
    'skills/productivity/retro/SKILL.md',
  ]) assert.match(read(f), /知识库落地/, `${f} does not point at 知识库落地`);
});

test('wiki-conventions「知识库落地」: commit straight to home, only the listed files, a failed push does not block', () => {
  const md = read('skills/productivity/wiki-conventions/SKILL.md');
  const at = md.indexOf('## 知识库落地');
  const rule = md.slice(at, md.indexOf('\n## ', at + 5));
  assert.match(rule, /dyna home commit/);
  assert.match(rule, /只提交列出的文件/);
  assert.match(rule, /home 没推上去/);
  assert.match(rule, /流程照走/);
  for (const artifact of ['spec', 'raw', '工单', '冻结的设计', '设计档案', 'dreaming', '「不做」记录', 'retro', '效果报告']) assert.ok(rule.includes(artifact), artifact);
  assert.match(rule, /代码 PR 合并成功后才跑归档脚本/);
  assert.match(rule, /`delta\/`/);
  assert.match(rule, /git revert/);
  assert.match(rule, /代码 PR 里只有代码/);
  assert.ok([...body(md)].length < 5000, `body is ${[...body(md)].length} characters`);
});

test('an issue session cuts no branch for triage: the spec goes to home, the branch comes with the first code', () => {
  const session = read('skills/engineering/issue-session/SKILL.md');
  assert.match(session, /triage 会话不切分支/);
  assert.match(session, /branch: null/);
  assert.match(session, /spec 已提交到 home <提交号>/);
  assert.match(session, /git switch -c issue\/<号>-<slug> origin\/<主分支>/);
  assert.match(session, /第一次要写代码/);
  assert.doesNotMatch(session, /git switch -c <下一段>/);
  assert.doesNotMatch(session, /spec、设计、工单和代码都提交在这一条分支上/);
  assert.doesNotMatch(session, /git push -u origin issue\/<号>-<slug>`，`issues set <docs> todo/);
  assert.ok([...body(session)].length < 5000);
});

test('pr-review merge archives after the code PR merged, then deletes the tickets, both committed to home', () => {
  const merge = read('skills/engineering/pr-review/references/merge.md');
  const deliver = read('skills/engineering/pr-review/references/deliver.md');
  assert.match(merge, /代码 PR 合并成功之后才动/);
  assert.match(merge, /## 合并后归档并删工单/);
  assert.match(merge, /dyna design archive write/);
  assert.match(merge, /dyna home commit/);
  assert.match(merge, /tickets\//);
  assert.doesNotMatch(deliver, /先推删工单的 docs 提交/);
});

test('the PR description references the spec by title, path in home and a summary, without a link', () => {
  const d = read('skills/engineering/pr/references/description.md');
  assert.match(d, /\*\*spec 与工单\*\*：<spec 标题>/);
  assert.match(d, /不放链接/);
  assert.doesNotMatch(d, /\[<spec 标题>\]\(<链接>\)/);
});

test('dreaming, retro and the SEO results report commit straight to home', () => {
  for (const f of [
    'skills/productivity/dreaming/SKILL.md',
    'skills/productivity/retro/SKILL.md',
    'skills/seo/seo-scan/references/results-report.md',
  ]) assert.match(read(f), /commit/, `${f} does not commit to home`);
  assert.doesNotMatch(read('skills/seo/seo-scan/references/results-report.md'), /worktree add|gh pr create/);
});

test('setup builds docs/ in the project directory and commits it to home; there is no question about keeping the knowledge base elsewhere', () => {
  const q = read('skills/engineering/setup/references/questions.md');
  assert.doesNotMatch(q, /要不要知识库/);
  const setup = read('skills/engineering/setup/SKILL.md');
  assert.match(setup, /`<docs>` 骨架：/);
  assert.match(setup, /dyna home commit/);
  assert.doesNotMatch(setup, /知识库选了仓库外/);
});
