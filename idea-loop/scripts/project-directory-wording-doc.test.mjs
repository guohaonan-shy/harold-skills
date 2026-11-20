// Skill wording says where things are in one way (docs/spec/skills-read-home, ticket 05): the project directory
// (`<home>/projects/<名字>/`) holds `docs/` and the bootstrap files; the code stays in the code worktree. The term is
// defined once, in wiki-conventions「项目目录」; the places that start a subagent hand it the project directory in the
// prompt; the multi-repository branches are gone (one issue changes one repository); the issue categories live in
// ISSUE_TRACKER.md「分类 label」. Ticket 05 started with skills/engineering and skills/productivity; ticket 06 widened
// the scan to all of skills/ and agents/ (every subagent definition reads the project directory from its caller's prompt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (text) => text.replace(/^---[\s\S]*?---\n/, '');

const SCANNED = ['skills', 'agents'];
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
const agentMds = docs.filter((f) => f.startsWith(join(root, 'agents')));

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
    ['skills/engineering/pr-review/references/ui-walkthrough.md', /ui-reviewer 的指针：spec 名、项目目录的绝对路径/],
    ['skills/engineering/pr-review/references/merge.md', /ui-reviewer`，只给指针：spec 名、项目目录的绝对路径/],
    ['skills/engineering/issue-triage/SKILL.md', /idea-loop:issue-triager`，给 issue 号、项目目录的绝对路径/],
    ['skills/productivity/dreaming/SKILL.md', /只给指针（项目目录和代码 worktree 的绝对路径/],
    ['skills/productivity/dreaming/references/archive-reconcile.md', /ui-reviewer`，只给指针：模式「对账」、项目目录的绝对路径/],
    ['skills/productivity/dreaming/references/missed-archive.md', /spec 名、项目目录的绝对路径、代码 worktree/],
  ];
  for (const [f, re] of cases) assert.match(read(f), re, `${f}: ${re}`);
});

test('every skill that has a <docs> says it is <项目目录>/docs/', () => {
  const missing = [];
  for (const f of docs) {
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

test('every SKILL.md body under skills/ stays under 5000 characters', () => {
  const long = skillMds.map((f) => [relative(root, f), [...body(readFileSync(f, 'utf8'))].length]).filter(([, n]) => n >= 5000);
  assert.deepEqual(long, []);
});

// ui-master looks at a screenshot and reads no project file (its prompt carries the DESIGN.md baseline it needs), so it has no
// project directory to take from the caller; the other fifteen subagents each read files that live in the project directory.
test('every subagent definition takes the project directory from the prompt of its caller, and says what is under it', () => {
  const missing = [];
  for (const f of agentMds) {
    if (f.endsWith('ui-master.md')) continue;
    const text = body(readFileSync(f, 'utf8'));
    if (!/读调用方在 prompt 里给的项目目录/.test(text)) missing.push(`${relative(root, f)}: no 读调用方在 prompt 里给的项目目录`);
    if (!/`<docs>`/.test(text) || !/都在它下面/.test(text)) missing.push(`${relative(root, f)}: does not say <docs> and the bootstrap files are under it`);
    if (!/没有项目目录|缺项目目录/.test(text)) missing.push(`${relative(root, f)}: does not say what to do when the prompt has none`);
  }
  assert.deepEqual(missing, []);
  assert.equal(agentMds.length, 16, 'sixteen agent definitions; a new one must be added to this check or to the ui-master exception');
});

test('the SEO direction agents and seo-scan agree on what the prompt carries: SEO.md and the project directory are two of its lines', () => {
  // the prompt template lives in seo-scan's findings reference (main #397 moved it out of the SKILL.md body)
  const scan = read('skills/seo/seo-scan/references/findings.md');
  assert.match(scan, /SEO\.md：<项目目录>\/SEO\.md\n项目目录：<项目目录绝对路径>/);
  for (const a of ['geo-analyst', 'keyword-miner', 'technical-auditor', 'page-optimizer', 'backlink-analyst', 'results-analyst']) {
    assert.match(read(`agents/${a}.md`), /提示里有六行：SEO\.md 路径、项目目录、/, a);
  }
});

test('an SEO PR is judged against 内容路径 only: docs/ and SEO.md live in the project directory, not in the code PR', () => {
  assert.match(read('skills/productivity/decision-rules/SKILL.md'), /「内容路径」。`docs\/` 和 `SEO\.md` 在项目目录里，不在代码 PR 里/);
  assert.doesNotMatch(read('skills/seo/seo-setup/references/seo-md.md'), /只有 `docs\/` 和 `SEO\.md` 算内容/);
  assert.doesNotMatch(read('skills/seo/seo-setup/SKILL.md'), /加 `docs\/`、根目录 `SEO\.md`/);
});

test('the design process files are in the project directory, and the design scripts get the project directory as their root', () => {
  for (const skill of ['uiux-imagine', 'uiux-refine']) {
    const text = read(`skills/design/${skill}/SKILL.md`);
    assert.match(text, /`imagine\/`、`canvas\/`、`research\/` 都在 `<项目目录>\/docs\/design\/tmp\/<spec-slug>\/`/, skill);
    assert.doesNotMatch(text, /worktree 根/, skill);
  }
  const archive = read('skills/design/design-archive/SKILL.md');
  assert.match(archive, /<项目目录>\/docs\/design\//);
  for (const f of docs.filter((d) => d.includes(join('skills', 'design', 'design-archive')))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /<仓库根>|<集成 worktree> (?:state|page|diff|--delta)/, relative(root, f));
  }
});

test('design-change-sync hands the designer the project directory as an absolute path, and the canvas path under it', () => {
  const text = read('skills/design/design-change-sync/SKILL.md');
  const list = text.split('## designer 做')[1].split('它做：')[0];
  assert.match(list, /\*\*项目目录\*\*的绝对路径/);
  assert.match(list, /项目目录下 `docs\/design\/tmp\/<spec-slug>\/canvas\/`/);
});
