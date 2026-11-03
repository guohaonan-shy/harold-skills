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
