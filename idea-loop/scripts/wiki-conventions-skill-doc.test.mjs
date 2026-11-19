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
