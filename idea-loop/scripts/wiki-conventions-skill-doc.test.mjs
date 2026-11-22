/**
 * Tripwire — the wiki-conventions skill stays short, and everyone who points at one of its sections points at
 * one that exists (docs/spec/wiki-conventions-slim). Same two checks as design-archive-skill-doc.test.mjs,
 * run by the command line (`dyna test skill-doc`).
 *
 * 1. The SKILL.md body (frontmatter stripped, UTF-8 characters) is under 5000. Details only some callers need
 *    live in `references/`, one pointer line from the section that owns them.
 * 2. Other skills and agents call the skill by name plus a section title (idea-loop:wiki-conventions 的「X」, written without backticks here so this note is not itself scanned).
 *    Section names are the contract: every title quoted that way must be a heading of the SKILL.md or of one of
 *    its `references/` files. `dyna spec check` quotes one in its error text too (dyna/internal/spec/check.go).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDyna } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'productivity', 'wiki-conventions');

const mdFiles = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? mdFiles(join(dir, name)) : name.endsWith('.md') ? [join(dir, name)] : [])) : []);
/** The headings of a markdown text, any level; lines inside a code fence are not headings. */
function headings(text) {
  let fenced = false;
  const out = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const m = !fenced && line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}
const allHeadings = () => [join(skillDir, 'SKILL.md'), ...mdFiles(join(skillDir, 'references'))].flatMap((f) => headings(readFileSync(f, 'utf8')));

// One call answers both questions: exit 1 when the body is 5000 characters or more, or a quoted section does not exist;
// --min-pointers makes a wrong skill name (a check of nothing) red too.
const check = () => runDyna(['test', 'skill-doc', skillDir, '--plugin', pluginRoot, '--min-pointers', '1']);

test('wiki-conventions SKILL.md body is under 5000 characters', () => {
  const r = check();
  assert.doesNotMatch(r.stdout + r.stderr, /主体 \d+ 字，上限/, `SKILL.md body is too long. Move long material into references/.\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /SKILL\.md 主体 \d+ 字（上限 5000）/);
});

test('every section of wiki-conventions that a skill or agent quotes exists as a heading of its SKILL.md or references/', () => {
  const r = check();
  assert.equal(r.status, 0, `these wiki-conventions sections do not exist (renamed or moved?), or none are quoted:\n${r.stdout}${r.stderr}`);
});

test('every section name other files point at is still a heading (any level): section names are the contract', () => {
  const names = ['知识库落地', '目录', '生命周期', '中间产物', '本地忽略', '从平铺布局迁移', 'frontmatter', 'slug 与链接'];
  const have = headings(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'));
  assert.deepEqual(names.filter((s) => !have.includes(s)), []);
});

test('the body is two parts plus the scratch dir: the second-level headings are exactly 目录, 生命周期, 中间产物', () => {
  let fenced = false;
  const h2 = [];
  for (const line of readFileSync(join(skillDir, 'SKILL.md'), 'utf8').split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const m = !fenced && line.match(/^##\s+(.+?)\s*$/);
    if (m) h2.push(m[1]);
  }
  assert.deepEqual(h2, ['目录', '生命周期', '中间产物']);
});

test('the section `dyna spec check` sends people to exists', () => {
  const src = readFileSync(join(pluginRoot, '..', 'dyna', 'internal', 'spec', 'check.go'), 'utf8');
  const titles = [...src.matchAll(/wiki-conventions 的「([^」]+)」/g)].map((m) => m[1]);
  assert.ok(titles.length > 0);
  const known = allHeadings();
  assert.deepEqual(titles.filter((t) => !known.includes(t)), []);
});

test('the trimmed sections and parked references are gone, and the directory table names directories, not slug placeholders', () => {
  const md = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  const have = headings(md);
  for (const gone of ['index.md', 'spec 和工单怎么写', '文件在不在，就是状态', '人机分工']) assert.ok(!have.includes(gone), `「${gone}」 is back in SKILL.md`);
  for (const f of ['design-layout.md', 'adr.md', 'index-md.md']) assert.ok(!existsSync(join(skillDir, 'references', f)), `references/${f} is back`);
  const table = md.slice(md.indexOf('## 目录'), md.indexOf('### frontmatter')).split('\n').filter((l) => l.startsWith('|'));
  assert.ok(table.length > 5);
  assert.deepEqual(table.filter((l) => /<[^>]*slug[^>]*>|NN-/.test(l)), []);
});

// ---- glossary folded in (docs/spec/skill-rewrite, ticket 03) ----
// The glossary skill is gone: what goes in, the format, who writes, who reads, and wiring a project to it live in
// wiki-conventions' own references/glossary.md, behind one pointer section (名字 「术语表」) that says when to read it.
const pluginFiles = () => ['skills', 'agents'].flatMap((d) => mdFiles(join(pluginRoot, d)));
const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');
const mainBody = () => bodyOf(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'));
const glossaryRef = join(skillDir, 'references', 'glossary.md');

test('the glossary skill is gone and nothing in skills/ or agents/ calls idea-loop:glossary', () => {
  assert.ok(!existsSync(join(pluginRoot, 'skills', 'productivity', 'glossary')), 'skills/productivity/glossary/ is back');
  const hits = pluginFiles().filter((f) => /idea-loop:glossary\b/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('wiki-conventions has one 术语表 pointer to references/glossary.md, and its description carries the trigger', () => {
  const md = mainBody();
  assert.ok(headings(md).includes('术语表'), 'the 术语表 section is missing');
  const lines = md.split('\n').filter((l) => l.includes('references/glossary.md'));
  assert.equal(lines.length, 1, 'the pointer is written once');
  assert.match(lines[0], /碰 `GLOSSARY\.md`[^。]*时读/);
  const description = readFileSync(join(skillDir, 'SKILL.md'), 'utf8').match(/^description: (.+)$/m)?.[1] ?? '';
  assert.match(description, /术语表/);
});

test('references/glossary.md keeps the glossary rules: what goes in, format, who writes, who reads, wiring a project', () => {
  assert.ok(existsSync(glossaryRef), 'references/glossary.md is missing');
  const hs = headings(readFileSync(glossaryRef, 'utf8'));
  for (const h of ['收什么：三问全过才收', '文件与格式', '写：人拍板之后当场写', '读：所有产出命名的地方', '接入项目']) assert.ok(hs.includes(h), `「${h}」 is not a heading of references/glossary.md`);
  assert.ok(!existsSync(join(skillDir, 'references', 'target-repo-setup.md')));
});

test('wiki-conventions SKILL.md body is within 4500 characters, and neither it nor the glossary reference carries decision history or inline git / gh commands', () => {
  assert.ok([...mainBody()].length <= 4500, `body is ${[...mainBody()].length} characters`);
  for (const f of [join(skillDir, 'SKILL.md'), glossaryRef]) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /20\d{2}-\d{2}-\d{2}|人定|原话|依据：/, `${f}: decision history`);
    assert.doesNotMatch(text, /`(?:gh|git) [a-z]/, `${f}: an inline external command`);
  }
});
