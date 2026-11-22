/**
 * Tripwire — the PR flow of the issue model (spec issue-model, ticket 04): from spec to merge, a PR is
 * opened when implementation starts (draft), one per repository the issue touches, and the issue is done
 * only when all of them are merged. A spec has no status of its own.
 *
 * Before: to-spec flipped the spec through 草稿 / 审核中 / 正式, to-ticket flipped it to 实现中, implement
 * opened the PR at the very end, pr-review's deliver step flipped it to 完成. These checks pin the
 * sentences that carry the change, and that no skill or script this ticket touched still names an old
 * state or `spec-status`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const skillDir = (...p) => join(root, 'skills', ...p);

function mdFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) mdFiles(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

/** From a heading line to the next heading of the same or higher level. */
function section(doc, heading) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.replace(/\s+$/, '') === heading);
  assert.ok(start >= 0, `no "${heading}"`);
  const level = heading.match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => { const h = l.match(/^(#+)\s/); return h && h[1].length <= level; });
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const OLD_STATES = ['待验证', '验证中', '审核中', '待设计', '设计中', '待实现', '实现中', '搁置'];
const SPEC_STATUS_WORDS = /`(草稿|正式|完成)`/;

const touchedDocs = [
  ...mdFiles(skillDir('engineering', 'to-spec')),
  ...mdFiles(skillDir('engineering', 'to-ticket')),
  ...mdFiles(skillDir('engineering', 'implement')),
  ...mdFiles(skillDir('engineering', 'pr')),
  ...mdFiles(skillDir('engineering', 'pr-review')),
  ...mdFiles(skillDir('design', 'uiux-imagine')),
  ...mdFiles(skillDir('design', 'uiux-refine')),
  ...mdFiles(skillDir('design', 'uiux-research')),
];
// The command line's code those two scripts became (dyna/internal/pr, dyna/internal/dreaming), outside the plugin.
const touchedScripts = [join(root, '..', 'dyna', 'internal', 'dreaming', 'table.go'), join(root, '..', 'dyna', 'internal', 'pr', 'loop.go')];

test('no skill or script of this slice names an old state, a spec status or spec-status', () => {
  const hits = [];
  for (const f of [...touchedDocs, ...touchedScripts]) {
    const text = readFileSync(f, 'utf8');
    for (const old of OLD_STATES) if (new RegExp(`${old}(?!途)`).test(text)) hits.push(`${relative(root, f)}: ${old}`);
    if (/spec-status/.test(text)) hits.push(`${relative(root, f)}: spec-status`);
    if (SPEC_STATUS_WORDS.test(text)) hits.push(`${relative(root, f)}: ${text.match(SPEC_STATUS_WORDS)[0]}`);
  }
  assert.deepEqual(hits, []);
});

test('to-spec: no status in the frontmatter, no handoff / route / spec status flips; what waits for a human stays in the spec', () => {
  const md = read('skills/engineering/to-spec/SKILL.md');
  assert.doesNotMatch(md, /`status:/);
  assert.doesNotMatch(md, /\bhandoff\b|\broute\b/);
  assert.match(md, /type: spec/);
  assert.match(md, /`issues`/);
  assert.match(md, /需要 grill/);
  assert.match(md, /待定/);
  assert.match(md, /issues new/, 'a spec that covers no issue still gets an entry in the tracker');
  assert.doesNotMatch(md, /issues open|issue-verify/);
  const land = read('skills/engineering/to-spec/references/land-on-main.md');
  assert.doesNotMatch(land, /advance|reconcile/, 'labels are not attached by this step any more');
});

test('to-ticket: does not flip the spec; one issue changes one repository, so a ticket does not name one', () => {
  const md = read('skills/engineering/to-ticket/SKILL.md');
  assert.doesNotMatch(md, /\bset <docs>/);
  assert.doesNotMatch(md, /\*\*仓库\*\*/);
  assert.doesNotMatch(md, /「仓库」/);
});

test('pr: 「开 draft PR」 opens the one draft PR before the tickets are cut, Refs in the body', () => {
  const md = read('skills/engineering/pr/SKILL.md');
  const open = section(md, '## 开 draft PR');
  assert.doesNotMatch(open, /仓库各开|每个仓库|数仓库/);
  assert.match(open, /`<owner\/repo>` 取 `where` 输出的 `repo`/);
  assert.match(open, /dyna pr open <owner\/repo> --base/);
  assert.doesNotMatch(open, /gh pr create/);
  assert.match(open, /`Refs <owner>\/<repo>#<号>`/);
  assert.match(open, /\[<号>\]/);
  assert.match(open, /`Linear: <号>`/);
  assert.match(open, /prs\.md/);
});

test('issue-session 「实现」 runs cut the branch → draft PR → cut tickets → implement, in that order', () => {
  const md = read('skills/engineering/issue-session/SKILL.md');
  const impl = section(md, '## 实现');
  const pr = impl.indexOf('开 draft PR');
  const tickets = impl.indexOf('idea-loop:to-ticket');
  const implement = impl.indexOf('idea-loop:implement');
  assert.ok(pr >= 0 && pr < tickets && tickets < implement, 'draft PR, then to-ticket, then implement');
  assert.match(impl, /^1\. \*\*接分支，开 draft PR\*\*/m);
  assert.match(impl, /^2\. \*\*切工单\*\*/m);
  assert.match(impl, /^3\. \*\*做\*\*/m);
  assert.match(impl, /idea-loop:pr`，照它的「开 draft PR」/);
});

test('implement: before dispatching it checks the PRs are there (opening any that are missing), in-progress; ready flips to in-review', () => {
  const md = read('skills/engineering/implement/SKILL.md');
  // the branches behind pointers live in implement's own references
  const startOfRun = read('skills/engineering/implement/references/start-of-run.md');
  const stopRef = read('skills/engineering/implement/references/stop-and-resume.md');
  const landingRef = read('skills/engineering/implement/references/landing-branches.md');
  const open = section(md, '## 开工：先开 PR') + '\n' + startOfRun;
  assert.ok(md.indexOf('## 开工：先开 PR') < md.indexOf('## 派工'), 'the PR check comes before dispatching');
  assert.match(open, /「开 draft PR」/);
  // 开 draft PR 的命令、正文写法、Linear 前缀、一仓库一个只在 pr 里写一次，implement 只指过去
  assert.doesNotMatch(open, /gh pr create/);
  assert.doesNotMatch(open, /Refs <owner>/);
  assert.doesNotMatch(open, /Linear: <号>/);
  assert.doesNotMatch(open, /各一个/);
  assert.match(open, /issues set <docs> in-progress/);
  const ending = section(md, '## 没活了就停下') + '\n' + stopRef;
  assert.doesNotMatch(ending, /还没有 PR/, 'the PR is opened at the start, not at the end');
  assert.match(md + stopRef, /dyna pr ready <owner\/repo> <PR 号>/);
  assert.match(md + stopRef, /issues set <docs> in-review/);
  assert.match(md + landingRef, /idea-loop:issues[^\n]*开一个 issue/);
});

test('implement: one issue changes one repository, so there is no multi-repository branch', () => {
  const md = read('skills/engineering/implement/SKILL.md');
  assert.doesNotMatch(md, /## 多个仓库/);
  assert.doesNotMatch(md, /multi-repo/);
  assert.ok(!existsSync(join(root, 'skills/engineering/implement/references/multi-repo.md')));
});

test('pr: one issue, one PR; the report has no per-repository form', () => {
  const pr = read('skills/engineering/pr/SKILL.md');
  assert.match(pr, /一个 issue 一个 PR/);
  assert.doesNotMatch(pr, /主 PR/);
  const report = read('skills/engineering/pr/references/review-report.md');
  assert.doesNotMatch(report, /几个仓库的 PR/);
  assert.match(report, /来自实现 · 第 N 次/);
});

test('pr-review: a round looks at the issue\'s PR; deliver does not flip a spec; merge merges it and ends with set done', () => {
  const skill = read('skills/engineering/pr-review/SKILL.md');
  assert.match(skill, /这个 issue 的 PR/);
  const deliver = read('skills/engineering/pr-review/references/deliver.md');
  assert.doesNotMatch(deliver, /spec-status|翻完成|docs\(spec\): <spec-slug> 完成/);
  assert.doesNotMatch(deliver, /删掉这个 PR 落地的工单文件/, 'the tickets are deleted after the code PR merged, not before the report');
  const merge = read('skills/engineering/pr-review/references/merge.md');
  assert.match(merge, /删掉这份 spec 的 `<项目目录>\/docs\/spec\/<spec-slug>\/tickets\/`/);
  assert.match(merge, /\*\*合并\*\*：`dyna pr merge <owner\/repo> <PR 号> --method/);
  assert.match(merge, /PR 合并后[^。\n]*set <docs> done/);
  assert.match(merge, /合并统一在[^。\n]*issue 会话/);
});

test('the design skills ask whether the spec still waits for a human, not for a spec status; imagine puts a backlog issue into triage', () => {
  for (const f of ['uiux-imagine', 'uiux-refine']) {
    const md = read('skills/design', f, 'SKILL.md');
    assert.match(md, /需要 grill/, `${f} checks what still waits for a human`);
  }
  assert.match(read('skills/design/uiux-imagine/SKILL.md'), /dyna issues set [^\n]*triage <号>/);
});

test('the closed set of 文档 dispositions drops the three that moved a spec between old statuses', () => {
  const src = readFileSync(join(root, '..', 'dyna', 'internal', 'dreaming', 'table.go'), 'utf8');
  for (const gone of ['标搁置', '去审核', '去设计']) assert.ok(!src.includes(gone), gone);
});
