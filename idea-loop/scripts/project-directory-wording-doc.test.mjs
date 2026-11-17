// Skill wording says where things are in one way (docs/spec/skills-read-home, ticket 05): the project directory
// (`<home>/projects/<名字>/`) holds `docs/` and the bootstrap files; the code stays in the code worktree. The term is
// defined once, in wiki-conventions「项目目录」; the places that start a subagent hand it the project directory in the
// prompt; the multi-repository branches are gone (one issue changes one repository); the issue categories live in
// ISSUE_TRACKER.md「分类 label」. Ticket 05 covers skills/engineering and skills/productivity; ticket 06 widens
// SCANNED to all of skills/ and agents/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (text) => text.replace(/^---[\s\S]*?---\n/, '');

const SCANNED = ['skills/engineering', 'skills/productivity'];
const BOOTSTRAP = '(?:DEVELOPMENT|REVIEW|CODING_STANDARDS|PRODUCT|ISSUE_TRACKER|GLOSSARY|DESIGN|SEO)\\.md';

function files(path, out = []) {
  for (const name of readdirSync(path)) {
    const p = join(path, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}
const docs = SCANNED.flatMap((d) => files(join(root, d)));
const skillMds = docs.filter((f) => f.endsWith('SKILL.md'));

test('no skill text puts docs/ in "the current worktree", a bootstrap file at the repository root, or uses git add -f', () => {
  const banned = [
    /当前 worktree 的 ?`?docs\/?`?/,
    new RegExp(`(?:目标)?(?:仓库|项目)根(?:目录)?(?:的|里的)? ?\`?${BOOTSTRAP}`),
    new RegExp(`(?:目标仓库|目标项目)(?:根目录|根)?的 ?\`?${BOOTSTRAP}`),
    /git add -f/,
  ];
  const hits = [];
  for (const f of docs) {
    const text = readFileSync(f, 'utf8');
    for (const re of banned) if (re.test(text)) hits.push(`${relative(root, f)}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('wiki-conventions defines the project directory once: what is in it, where each kind of session gets it, stop when there is none', () => {
  const md = body(read('skills/productivity/wiki-conventions/SKILL.md'));
  const sec = md.slice(md.indexOf('## 项目目录'), md.indexOf('## 知识库落地'));
  assert.ok(sec.length > 0, 'a 项目目录 section before 知识库落地');
  assert.match(sec, /<home>\/projects\/<名字>\//);
  for (const f of ['docs/', 'DEVELOPMENT.md', 'REVIEW.md', 'CODING_STANDARDS.md', 'PRODUCT.md', 'ISSUE_TRACKER.md', 'GLOSSARY.md', 'DESIGN.md', 'SEO.md']) {
    assert.ok(sec.includes(f), `${f} listed as inside the project directory`);
  }
  assert.match(sec, /AGENTS\.md[^。\n]*CLAUDE\.md/, 'the code repository keeps AGENTS.md / CLAUDE.md');
  assert.match(sec, /项目目录：<路径>/, 'a session in a code worktree reads the injected line');
  assert.match(sec, /where --project <名字>/, 'a session in home asks where --project');
  assert.match(sec, /子代理[^\n]*prompt/, 'a subagent reads the prompt of its caller');
  assert.match(sec, /拿不到[^\n]*停下/, 'no project directory: stop and say the sentence');
  assert.match(sec, /不去读代码仓库/);
});

test('the places that start a subagent hand it the project directory in the prompt', () => {
  const cases = [
    ['skills/engineering/implement/SKILL.md', /项目目录的绝对路径，工单与 spec/],
    ['skills/engineering/implement/SKILL.md', /idea-loop:explorer`，给一句目的[^。\n]*项目目录/],
    ['skills/engineering/pr-review/SKILL.md', /idea-loop:pr-reviewer`，\*\*只给指针\*\*：项目目录的绝对路径/],
    ['skills/engineering/pr-review/references/ui-walkthrough.md', /ui-reviewer 的指针：spec 名、项目目录的绝对路径/],
    ['skills/engineering/pr-review/references/merge.md', /ui-reviewer`，只给指针：spec 名、项目目录的绝对路径/],
    ['skills/engineering/issue-triage/SKILL.md', /idea-loop:issue-triager`，给 issue 号、项目目录的绝对路径/],
    ['skills/productivity/dreaming/SKILL.md', /只给指针（项目目录的绝对路径、worktree/],
    ['skills/productivity/dreaming/references/archive-reconcile.md', /ui-reviewer`，只给指针：模式「对账」、项目目录的绝对路径/],
    ['skills/productivity/dreaming/references/missed-archive.md', /spec 名、项目目录的绝对路径、dreaming worktree/],
  ];
  for (const [f, re] of cases) assert.match(read(f), re, `${f}: ${re}`);
});

test('every skill that has a <docs> says it is <项目目录>/docs/', () => {
  const missing = [];
  for (const f of skillMds.concat(docs.filter((d) => d.endsWith('category-and-spec.md') || d.endsWith('draft-spec.md')))) {
    const text = readFileSync(f, 'utf8');
    const def = text.match(/`<docs>` 指[^。\n]*/);
    if (!def) continue;
    if (!def[0].includes('<项目目录>/docs/')) missing.push(`${relative(root, f)}: ${def[0].slice(0, 40)}`);
  }
  assert.deepEqual(missing, []);
});

test('one issue changes one repository: the multi-repository branches are gone', () => {
  assert.ok(!existsSync(join(root, 'skills/engineering/implement/references/multi-repo.md')));
  const hits = [];
  for (const f of docs) {
    if (f.includes(`${join('skills', 'engineering', 'setup')}`)) continue; // the setup templates belong to ticket 08
    const text = readFileSync(f, 'utf8');
    for (const re of [/「仓库」/, /多个仓库|几个仓库|多仓库/, /每个要改的仓库/, /\*\*仓库\*\*/, /主 PR/]) {
      if (re.test(text)) hits.push(`${relative(root, f)}: ${re}`);
    }
  }
  assert.deepEqual(hits, []);
});

test('the issue categories live in ISSUE_TRACKER.md「分类 label」, not in AGENTS.md', () => {
  const issues = read('skills/engineering/issues/SKILL.md');
  assert.match(issues, /ISSUE_TRACKER\.md` 的「分类 label」/);
  const cat = read('skills/engineering/issues/references/category-and-spec.md');
  assert.match(cat, /项目目录 `ISSUE_TRACKER\.md` 的「分类 label」一节/);
  for (const text of [issues, cat]) assert.doesNotMatch(text, /AGENTS\.md[^。\n]*issue 分类|issue 分类[^。\n]*AGENTS\.md/);
});

test('every SKILL.md body in skills/engineering and skills/productivity stays under 5000 characters', () => {
  const long = skillMds.map((f) => [relative(root, f), [...body(readFileSync(f, 'utf8'))].length]).filter(([, n]) => n >= 5000);
  assert.deepEqual(long, []);
});
