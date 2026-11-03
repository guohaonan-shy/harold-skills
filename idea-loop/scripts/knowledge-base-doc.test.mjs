/**
 * Tripwire — skills and agents find the business's knowledge base through `knowledge-base.mjs`, not through the
 * code repository they happen to run in.
 *
 * Spec knowledge-base-repo (「方案」). `docs/` and the business-level settings (`PRODUCT.md`, `ISSUE_TRACKER.md`,
 * `GLOSSARY.md`, `DESIGN.md`, 「issue 分类」) live in the knowledge base now; only `DEVELOPMENT.md`, `REVIEW.md`,
 * `CODING_STANDARDS.md` stay at the code repository's root. The behaviour is skill text, so this reads the text:
 * it catches a skill that still says "the target repository's `docs/`" or sends the reader to the repository root
 * for a business-level setting. It cannot see whether an executor follows what the text now says. The `setup` skill
 * is out of scope here (it migrates old projects and so has to name the old layout).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP_DIR = join(pluginRoot, 'skills', 'engineering', 'setup');

function markdownUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...markdownUnder(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** Every skill and agent markdown file except the setup skill. */
const files = ['skills', 'agents']
  .flatMap((top) => markdownUnder(join(pluginRoot, top)))
  .filter((f) => !f.startsWith(SETUP_DIR + '/'));

const lines = files.flatMap((file) =>
  readFileSync(file, 'utf8').split('\n').map((text, i) => ({ where: `${relative(pluginRoot, file)}:${i + 1}`, text })),
);

const BUSINESS_SETTING = /PRODUCT\.md|ISSUE_TRACKER\.md|GLOSSARY\.md|DESIGN\.md|issue 分类|`## idea-loop`/;

test('no skill or agent says the docs/ are in the target repository, the current checkout or the main checkout', () => {
  const stale = /(目标仓库|目标项目|当前仓库|当前 worktree|会话 worktree|集成 worktree|主 checkout|当前 checkout)的 ?`?docs\/?`?/;
  const hits = lines.filter((l) => stale.test(l.text)).map((l) => l.where);
  assert.deepEqual(hits, [], `docs/ is the knowledge base's now (idea-loop:wiki-conventions): ${hits.join(', ')}`);
});

test('no skill or agent sends the reader to the repository root for a business-level setting', () => {
  const root = /仓库根目录|仓库根下|仓库根|项目根|(?<!知识库)根目录/;
  const hits = lines
    .filter((l) => BUSINESS_SETTING.test(l.text) && root.test(l.text) && !/知识库/.test(l.text))
    .map((l) => l.where);
  assert.deepEqual(hits, [], `PRODUCT/ISSUE_TRACKER/GLOSSARY/DESIGN.md and 「issue 分类」 are at the knowledge base root: ${hits.join(', ')}`);
});

test('a PR that only changes the knowledge base is called the knowledge base PR, not a docs/ PR in the code repository', () => {
  const stale = /只改 ?`?docs\/?`?( 的| 目录的)? ?(PR|提交)/;
  const hits = lines.filter((l) => stale.test(l.text)).map((l) => l.where);
  assert.deepEqual(hits, [], `say 知识库的 PR: ${hits.join(', ')}`);
});

test('design archive scripts are given the knowledge base, not a repository root', () => {
  // `<仓库根>` still means the code repository's root elsewhere (where SEO.md is), so only the archive's own text is checked
  const aboutArchive = (l) => l.where.startsWith('skills/design/design-archive/') || /design-archive-[a-z]+\.mjs|--archive/.test(l.text);
  const hits = lines.filter((l) => aboutArchive(l) && l.text.includes('<仓库根>')).map((l) => l.where);
  assert.deepEqual(hits, [], `pass <知识库> (the output of knowledge-base.mjs root / root --write): ${hits.join(', ')}`);
});

test('wiki-conventions defines the knowledge base once, for every other skill to point at', () => {
  const skill = readFileSync(join(pluginRoot, 'skills', 'productivity', 'wiki-conventions', 'SKILL.md'), 'utf8');
  const description = /^description: (.*)$/m.exec(skill)?.[1] ?? '';
  assert.match(description, /业务知识库/, 'description should say 业务知识库');
  assert.doesNotMatch(description, /目标仓库/, 'description must not call it the target repository docs/');
  assert.match(skill, /knowledge-base\.mjs[^\n]*\broot\b(?! --write)/, 'how to get <知识库> for reading: knowledge-base.mjs root');
  assert.match(skill, /root --write/, 'how to get <知识库> for writing');
  assert.match(skill, /\.tmp\/kb\//, 'where the knowledge base worktree sits');
  assert.match(skill, /\.tmp\/repos\/<仓库名>\//, 'where the other code repositories sit');
  assert.match(skill, /idea-loop\.json/, 'the marker file of a knowledge base');
  for (const name of ['DEVELOPMENT.md', 'REVIEW.md', 'CODING_STANDARDS.md']) {
    const line = skill.split('\n').find((l) => l.includes(name) && /代码仓库根目录/.test(l));
    assert.ok(line, `${name} should be said to stay at the code repository root`);
  }
  assert.match(skill, /docs\/design\/tmp\/[^\n]*\.gitignore|\.gitignore[^\n]*docs\/design\/tmp\//, '.gitignore of the knowledge base owns docs/design/tmp/');
  assert.match(skill, /知识库的 PR[^\n]*(知识库的)?主分支|合进知识库的主分支/, 'a knowledge base PR merges into the knowledge base main branch');
});

test('every skill that uses <docs> defines it, and the definition names knowledge-base.mjs', () => {
  const skillsDir = join(pluginRoot, 'skills');
  const skillDirs = [];
  for (const category of readdirSync(skillsDir)) {
    const catPath = join(skillsDir, category);
    if (!statSync(catPath).isDirectory()) continue;
    for (const slug of readdirSync(catPath)) {
      const dir = join(catPath, slug);
      if (statSync(dir).isDirectory() && dir !== SETUP_DIR) skillDirs.push(dir);
    }
  }
  const problems = [];
  let defined = 0;
  for (const dir of skillDirs) {
    const own = markdownUnder(dir);
    const users = own.filter((f) => readFileSync(f, 'utf8').includes('<docs>'));
    if (users.length === 0) continue;
    const definitions = own.flatMap((f) =>
      readFileSync(f, 'utf8').split('\n')
        .map((text, i) => ({ where: `${relative(pluginRoot, f)}:${i + 1}`, text }))
        .filter((l) => /`<docs>` ?(指|是|即)/.test(l.text)),
    );
    if (definitions.length === 0) problems.push(`${relative(pluginRoot, dir)} uses <docs> but never defines it`);
    for (const d of definitions) {
      defined += 1;
      if (!d.text.includes('knowledge-base.mjs')) problems.push(`${d.where} defines <docs> without knowledge-base.mjs`);
    }
  }
  assert.ok(defined > 0, 'found no <docs> definition at all — is the pattern still right?');
  assert.deepEqual(problems, []);
});

// ---- a session opened in the knowledge base (spec 「多仓库需求」, PR review round 1 S1) ----
//
// A business with several code repositories recommends opening the session in the knowledge base. A knowledge base has
// no `DEVELOPMENT.md` (repository-level settings stay in each code repository), so the three openings that used to
// read it and stop must not stop there: the main branch is the knowledge base's default branch, and the steps that
// touch code read the ticket's repository's own settings in `.tmp/repos/<仓库名>/`.

const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const wiki = read('skills', 'productivity', 'wiki-conventions', 'SKILL.md');
const openings = {
  'issue-session': read('skills', 'engineering', 'issue-session', 'SKILL.md'),
  'issue-verify': read('skills', 'engineering', 'issue-verify', 'SKILL.md'),
  dreaming: read('skills', 'productivity', 'dreaming', 'SKILL.md'),
};

test('wiki-conventions defines once what a session opened in the knowledge base does', () => {
  const start = wiki.indexOf('**会话开在知识库里**');
  assert.ok(start >= 0, '缺：「会话开在知识库里」的定义');
  const rule = wiki.slice(start, wiki.indexOf('**知识库的改动走知识库自己的 PR', start));
  assert.match(rule, /idea-loop\.json/, '要写明怎么认出会话开在知识库里：git 根有 idea-loop.json');
  assert.match(rule, /不因读不到它停下/, '要写明：读不到 DEVELOPMENT.md 不停下');
  assert.match(rule, /refs\/remotes\/origin\/HEAD/, '主分支取知识库远端的默认分支，要写出怎么取');
  assert.match(rule, /DEVELOPMENT\.md[^\n]*REVIEW\.md[^\n]*CODING_STANDARDS\.md/, '碰代码的步骤读那个仓库自己的 DEVELOPMENT / REVIEW / CODING_STANDARDS');
  assert.match(rule, /\.tmp\/repos\/<仓库名>\//, '碰代码的步骤在 .tmp/repos/<仓库名>/ 里做');
  assert.match(rule, /knowledge-base\.mjs worktree <仓库名>/, '要写明 .tmp/repos/<仓库名>/ 怎么开：knowledge-base.mjs worktree');
});

test('issue-session, issue-verify and dreaming do not stop at a missing DEVELOPMENT.md when opened in the knowledge base', () => {
  const problems = [];
  for (const [name, text] of Object.entries(openings)) {
    const stops = text.split('\n').filter((l) => l.includes('DEVELOPMENT.md') && l.includes('/idea-loop:setup'));
    if (stops.length === 0) problems.push(`${name}: 找不到「没有 DEVELOPMENT.md 就停」的那一句，这条测试该跟着改`);
    for (const l of stops) {
      if (!/会话开在知识库里/.test(l)) problems.push(`${name}: 停下的那一句没有「会话开在知识库里」的例外：${l.slice(0, 40)}…`);
      if (!/idea-loop\.json/.test(l)) problems.push(`${name}: 例外要写明怎么认出（git 根有 idea-loop.json）`);
      if (!/知识库远端的默认分支/.test(l)) problems.push(`${name}: 例外要写明主分支取知识库远端的默认分支`);
      if (!/wiki-conventions/.test(l)) problems.push(`${name}: 例外要指向 wiki-conventions 的定义`);
    }
  }
  assert.deepEqual(problems, []);
});

test('issue-verify reproduces in the ticket\'s repository when opened in the knowledge base', () => {
  const line = openings['issue-verify'].split('\n').find((l) => l.includes('「开发服务器」'));
  assert.ok(line, '缺：复现起服务的那一句');
  assert.match(line, /会话开在知识库里/, '要写明会话开在知识库里时读哪个仓库的 DEVELOPMENT.md');
  assert.match(line, /\.tmp\/repos\/<仓库名>\//, '要在 .tmp/repos/<仓库名>/ 里起');
});
