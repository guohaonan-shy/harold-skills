/**
 * Tripwire — `/idea-loop:setup` configures a code repository into a business with a knowledge base, and migrates the
 * old layout (spec knowledge-base-repo: 「方案」, 「迁移」, 「业务级与仓库级的划分」).
 *
 * The behaviour is skill text, so this reads the text: where each setting is written (business-level ones into the
 * knowledge base, repository-level ones at the code repository root), what the pointer block looks like (checked with
 * the same parser `knowledge-base.mjs` uses), what the migration reference tells the executor to run, and that the four
 * business questions each carry a recommendation and its source. It cannot see whether an executor follows the text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPointer } from './knowledge-base.mjs';

const setupDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'engineering', 'setup');
const read = (...p) => readFileSync(join(setupDir, ...p), 'utf8');
const skill = read('SKILL.md');
const description = /^description: (.*)$/m.exec(skill)?.[1] ?? '';
const body = skill.split(/^---\s*$/m).slice(2).join('---');
const MIGRATE = 'migrate-to-knowledge-base.md';

function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
}

/** Every reference except the migration one, which has to name the old layout. */
const references = readdirSync(join(setupDir, 'references'))
  .filter((f) => f.endsWith('.md') && f !== MIGRATE)
  .map((f) => ({ name: `references/${f}`, text: read('references', f) }));
const nonMigrate = [{ name: 'SKILL.md', text: body }, ...references];

test('description no longer promises root-level project files or a docs/ skeleton', () => {
  assert.doesNotMatch(description, /根目录的项目规则文件|docs\/ 骨架/);
  assert.match(description, /知识库/);
  assert.match(description, /迁/, 'says it migrates old projects');
});

test('the settings table says where each file lives: business-level in the knowledge base, repository-level at the code repository root', () => {
  const row = (file) => body.split('\n').find((l) => l.startsWith('|') && l.includes(file));
  for (const file of ['DEVELOPMENT.md', 'REVIEW.md', 'CODING_STANDARDS.md']) {
    assert.match(row(file) ?? '', /代码仓库根目录/, `${file} stays at the code repository root`);
  }
  for (const file of ['ISSUE_TRACKER.md', '`## issue 分类`', 'PRODUCT.md']) {
    const r = row(file) ?? '';
    assert.match(r, /知识库根/, `${file} is written at the knowledge base root`);
    assert.doesNotMatch(r, /代码仓库根目录/, `${file} is not written at the code repository root`);
  }
  assert.match(row('idea-loop.json') ?? '', /projects\.json/, 'idea-loop.json and projects.json are both in the table');
});

test('the write step splits knowledge base and code repository, and the code repository gets only the pointer block and the three repository-level files', () => {
  const s = section(body, '写');
  assert.ok(s, 'no "## 写" section');
  const bullet = (key) => s.split('\n').find((l) => l.startsWith('- ') && l.includes(key));
  const kb = bullet('**知识库**') ?? '';
  const code = bullet('**代码仓库**') ?? '';
  assert.match(kb, /idea-loop\.json/);
  assert.match(kb, /PRODUCT\.md/);
  assert.match(kb, /ISSUE_TRACKER\.md/);
  assert.match(kb, /docs\/` 骨架/);
  assert.match(kb, /gh repo create/);
  assert.match(s, /`## issue 分类` 一节照模板写进知识库根的 `AGENTS\.md`/);
  for (const f of ['DEVELOPMENT.md', 'REVIEW.md', 'CODING_STANDARDS.md']) assert.ok(code.includes(f), `${f} is written in the code repository`);
  assert.match(code, /指针块/);
  assert.match(code, /CLAUDE\.md/, 'falls back to CLAUDE.md when AGENTS.md is missing');
  assert.match(code, /info\/exclude/, '.tmp/ is excluded locally');
  for (const f of ['PRODUCT.md', 'ISSUE_TRACKER.md', 'issue 分类']) assert.ok(!code.includes(f), `${f} must not be written in the code repository`);
  assert.match(s, /projects\.json/, 'the machine mapping is written');
  assert.match(s, /git diff/, 'the diff is shown before anything is committed');
  assert.match(s, /`labels <知识库>\/docs`|labels <知识库>\/docs/, 'label commands run on the knowledge base docs');
});

test('no non-migration text in setup still tells the executor to put business-level settings at the code repository root or to run scripts on ./docs', () => {
  const businessSetting = /PRODUCT\.md|ISSUE_TRACKER\.md|issue 分类/;
  const root = /仓库根目录|仓库根下|仓库根|项目根|(?<!知识库)根目录/;
  const problems = [];
  for (const { name, text } of nonMigrate) {
    text.split('\n').forEach((line, i) => {
      if (businessSetting.test(line) && root.test(line) && !/知识库/.test(line)) problems.push(`${name}:${i + 1} ${line.slice(0, 60)}`);
      if (/\b(labels|type|migrate|check) docs\b/.test(line)) problems.push(`${name}:${i + 1} runs a script on ./docs`);
    });
  }
  assert.deepEqual(problems, []);
});

test('agents-block.md is the pointer block: 业务 and 知识库 lines the knowledge-base.mjs parser reads, no list of settings', () => {
  const block = read('references', 'agents-block.md');
  assert.match(block, /^## idea-loop$/m);
  assert.match(block, /^- 业务：`<业务>`$/m);
  assert.match(block, /^- 知识库：`<owner\/name>`$/m);
  assert.ok(block.includes('knowledge-base.mjs root'), 'tells where the local path comes from');
  for (const old of ['PRODUCT.md', 'ISSUE_TRACKER.md', 'GLOSSARY.md']) assert.ok(!block.includes(old), `the old settings list (${old}) is gone`);
  const dir = mkdtempSync(join(tmpdir(), 'agents-block-'));
  try {
    writeFileSync(join(dir, 'AGENTS.md'), `# AGENTS\n\n${block}`);
    assert.deepEqual(readPointer(dir), { business: '<业务>', knowledge: '<owner/name>' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('knowledge-base.md gives the shapes of idea-loop.json and projects.json, and the knowledge base ignore and LFS rules', () => {
  const text = read('references', 'knowledge-base.md');
  const shapes = [...text.matchAll(/```json\n([\s\S]*?)\n\s*```/g)].map((m) => JSON.parse(m[1]));
  assert.equal(shapes.length, 2, 'two JSON examples: idea-loop.json and projects.json');
  assert.deepEqual(Object.keys(shapes[0]).sort(), ['business', 'issues', 'repos']);
  const entry = Object.values(shapes[1])[0];
  assert.deepEqual(Object.keys(entry).sort(), ['home', 'knowledgeBase', 'repos']);
  assert.match(text, /\.gitattributes[^\n]*LFS/);
  assert.match(text, /\.gitignore[^\n]*docs\/design\/tmp\//);
  for (const dir of ['spec/', 'adr/', 'design/', 'raw/', 'domain/', 'records/', 'index.md']) assert.ok(text.includes(dir), `docs skeleton: ${dir}`);
});

test('the migration reference is linked from SKILL.md and runs the six steps with their commands', () => {
  assert.ok(section(body, '迁移')?.includes(`references/${MIGRATE}`), '迁移 section points at the reference');
  assert.ok(body.indexOf('## 迁移') < body.indexOf('## 夜间规则回放'));
  const m = read('references', MIGRATE);
  assert.ok(m.includes('git subtree split --prefix=docs'));
  assert.ok(m.includes('git subtree add --prefix=docs'));
  assert.match(m, /gh repo create[^\n]*\n?[^\n]*原样给人看[^\n]*人说建才建|原样给人看，人说建才建[^\n]*gh repo create|gh repo create[^\n]*原样给人看，人说建才建/, 'gh repo create is shown first, created only on a yes');
  assert.match(m, /人合并，setup 不合并/, 'the deletion goes through a PR the human merges');
  assert.match(m, /删 `docs\/`[^\n]*换成指针块|删 `docs\/`[^\n]*指针块/, 'the PR deletes docs/ and swaps in the pointer block');
  assert.match(m, /核对三项/);
  assert.ok(m.includes('spec-status.mjs" check <知识库>/docs'), 'check 1: same specs, zero problems');
  assert.ok(m.includes('issues.mjs" labels <知识库>/docs'), 'check 2: no new label');
  assert.ok(m.includes('knowledge-base.mjs" root'), 'check 3: root outputs the knowledge base');
  assert.match(m, /首个|至少一个提交/, 'subtree add needs a first commit in the knowledge base');
});

test('questions.md asks the four business questions, each with a recommendation and its source', () => {
  const q = read('references', 'questions.md');
  for (const key of ['**业务名**', '**知识库仓库**', '**会话在哪跑', '**issue 在哪个 GitHub 仓库**']) {
    const line = q.split('\n').find((l) => l.startsWith('- ') && l.includes(key));
    assert.ok(line, `question missing: ${key}`);
    assert.match(line, /推荐[：:]/, `${key} has a recommendation`);
    assert.match(line, /出处[：:]/, `${key} has a source`);
  }
  assert.ok(q.indexOf('**业务名**') < q.indexOf('**基准分支与合并方式**'), 'the business questions come first');
  assert.match(q, /home/, 'asks where sessions run (home)');
});

test('the preflight table has the machine-mapping row and the old-layout row', () => {
  const t = read('references', 'preflight-table.md');
  assert.ok(t.split('\n').some((l) => l.startsWith('| 本机映射') && l.includes('knowledge-base.mjs')), 'machine mapping row');
  const old = t.split('\n').find((l) => l.startsWith('| 老布局')) ?? '';
  assert.match(old, /docs\//);
  assert.match(old, /PRODUCT\.md/);
});

test('the weekly dreaming task and the hand-back follow the business home and report the migration', () => {
  assert.match(section(body, '每周对账') ?? '', /`home`/);
  assert.match(read('references', 'weekly-dreaming.md'), /`home`/);
  const handback = section(body, '交回') ?? '';
  assert.match(handback, /projects\.json/);
  assert.match(handback, /PR 链接/);
  assert.match(handback, /`home` 的主 checkout/, 'the scheduler is started in the home checkout');
});

test('a business with two or more code repositories gets a「仓库」section in the knowledge base AGENTS.md, written from a recommendation the human confirms', () => {
  // The settings table lists it as a knowledge-base file, not a code-repository one.
  const row = body.split('\n').find((l) => l.startsWith('|') && l.includes('`## 仓库`')) ?? '';
  assert.match(row, /知识库根/, 'the table row puts 仓库 at the knowledge base root');
  assert.doesNotMatch(row, /代码仓库根目录/);

  // The write step points at it and states the threshold.
  const kbBullet = (section(body, '写') ?? '').split('\n').find((l) => l.startsWith('- ') && l.includes('**知识库**')) ?? '';
  assert.match(kbBullet, /## 仓库/);
  assert.match(kbBullet, /两个以上/);

  // The knowledge-base reference gives the shape: one entry per repository with the four things, none for a single repository.
  const kb = read('references', 'knowledge-base.md');
  assert.match(kb, /```markdown\n\s*## 仓库\n[\s\S]*?```/, 'a template of the section');
  for (const field of ['仓库名', 'GitHub 名', '管哪块功能', '依赖']) assert.ok(kb.includes(field), `each entry says ${field}`);
  assert.match(kb, /只有一个(代码)?仓库的业务不写/, 'a single-repository business does not get the section');
  assert.match(kb, /加第二个仓库[^\n]*第一个/, 'adding the second repository also writes the first one into the section');

  // The questions: 管哪块功能 and 依赖, each with a recommendation inferred from README / directory structure, and `home` recommends the knowledge base for several.
  const q = read('references', 'questions.md');
  for (const key of ['**管哪块功能**', '**跟别的仓库的依赖**']) {
    const line = q.split('\n').find((l) => l.startsWith('- ') && l.includes(key));
    assert.ok(line, `question missing: ${key}`);
    assert.match(line, /推荐[：:]/, `${key} has a recommendation`);
    assert.match(line, /出处[：:][^\n]*README/, `${key} cites the README`);
    assert.match(line, /目录/, `${key} cites the directory structure`);
  }
  const home = q.split('\n').find((l) => l.startsWith('- ') && l.includes('**会话在哪跑')) ?? '';
  assert.match(home, /几个(代码)?仓库[^\n]*知识库/, 'several repositories → knowledge base');

  // The survey reads each repository's README and directory structure.
  assert.match(read('references', 'survey.md'), /README[^\n]*目录/);
});

test('every references/ file linked from SKILL.md or another reference exists', () => {
  const files = [{ dir: setupDir, text: skill }, ...references.map((r) => ({ dir: join(setupDir, 'references'), text: r.text })), { dir: join(setupDir, 'references'), text: read('references', MIGRATE) }];
  const missing = [];
  for (const { dir, text } of files) {
    for (const m of text.matchAll(/\]\(((?:references\/)?[\w.-]+\.md)\)/g)) if (!existsSync(join(dir, m[1]))) missing.push(m[1]);
  }
  assert.deepEqual(missing, []);
});
