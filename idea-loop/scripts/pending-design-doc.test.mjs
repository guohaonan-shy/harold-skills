/**
 * Tripwire — shelved designs live in the main checkout's docs/design/pending/<spec-slug>/.
 *
 * Spec refine-judge-advisor, ticket 08. The behaviour is skill text, so this reads the text: it
 * catches the wiki-conventions directory map, the "先不做" move, the find-back at the start of
 * imagine / refine, or the dreaming reconcile row being dropped. It cannot see whether an executor
 * follows them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const chars = (text) => [...body(text)].length;

const wiki = read('skills', 'productivity', 'wiki-conventions', 'SKILL.md');

test('wiki-conventions: the directory map has design/pending/<spec-slug>/ and its lifecycle says where, local only, who moves, who reads', () => {
  assert.match(wiki, /pending\/<spec-slug>\//);
  const life = wiki.slice(wiki.indexOf('**`design/pending/<spec-slug>/`**'));
  assert.ok(life.length < wiki.length, 'lifecycle bullet for design/pending/ is missing');
  const para = life.slice(0, life.indexOf('\n- **`design/prod/`**') > 0 ? life.indexOf('\n- **`design/prod/`**') : 2500);
  assert.match(para, /主 checkout/);
  assert.match(para, /git worktree list/);
  assert.match(para, /只在本地|不提交/);
  assert.match(para, /先不做/);
  assert.match(para, /编排者/);
  assert.match(para, /uiux-imagine/);
  assert.match(para, /uiux-refine/);
  assert.match(para, /dreaming/);
});

test('wiki-conventions: the local ignore covers docs/design/pending/ too', () => {
  const ignore = wiki.slice(wiki.indexOf('**本地忽略**'));
  assert.match(ignore.slice(0, 600), /docs\/design\/pending\//);
});

test('wiki-conventions: the move writes a pointer and the reason into the spec', () => {
  assert.match(wiki, /spec[^\n]*(指针|指向)[^\n]*(理由|原因)|(指针|指向)[^\n]*spec[^\n]*(理由|原因)/);
});

for (const skill of ['uiux-imagine', 'uiux-refine']) {
  test(`${skill}: checks the main checkout's pending/ before starting, asks the human, copies back and resumes from 中断与恢复`, () => {
    const text = read('skills', 'design', skill, 'SKILL.md');
    const opening = text.slice(0, text.indexOf('## 起步') > 0 ? text.indexOf('## 起步') : 4000);
    assert.match(opening, /pending\//);
    assert.match(opening, /git worktree list/);
    assert.match(opening, /问人/);
    assert.match(opening, /复制回/);
    assert.match(opening, /中断与恢复|after-freeze/);
  });
  test(`${skill}: SKILL.md body stays under 5000 characters`, () => {
    assert.ok(chars(read('skills', 'design', skill, 'SKILL.md')) < 5000);
  });
}

test('uiux-refine after-freeze reference carries the 先不做 move: pending dir, nothing cleaned, spec pointer and reason', () => {
  const text = read('skills', 'design', 'uiux-refine', 'references', 'after-freeze.md');
  assert.match(text, /先不做/);
  assert.match(text, /docs\/design\/pending\/<spec-slug>\//);
  assert.match(text, /git worktree list/);
  assert.match(text, /不清理|原样/);
  assert.match(text, /指针/);
  assert.match(text, /理由/);
});

test('dreaming lists every pending design with whether its spec is settled, and proposes deleting the settled ones', () => {
  const ref = read('skills', 'productivity', 'dreaming', 'references', 'pending-designs.md');
  assert.match(ref, /git worktree list/);
  assert.match(ref, /搁置设计/);
  assert.match(ref, /了结/);
  assert.match(ref, /删除/);
  const skill = read('skills', 'productivity', 'dreaming', 'SKILL.md');
  assert.match(skill, /pending-designs\.md/);
  const table = read('skills', 'productivity', 'dreaming', 'references', 'proposal-table.md');
  assert.match(table, /`搁置设计`/);
});
