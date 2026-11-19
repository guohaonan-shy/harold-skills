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

// wiki-conventions keeps one row per directory in its 目录 table (docs/spec/wiki-conventions-slim), so the
// shelved-design convention is the design/pending/ row, and the local ignore is the 本地忽略 subsection.
const pendingRow = wiki.split('\n').find((l) => l.startsWith('| `design/pending/` |')) ?? '';

test('wiki-conventions: the 目录 table has a design/pending/ row that says where, local only, who moves, who reads', () => {
  assert.ok(pendingRow, 'the 目录 table has no design/pending/ row');
  assert.match(pendingRow, /主 checkout/);
  assert.match(pendingRow, /git worktree list/);
  assert.match(pendingRow, /只在本地|不提交/);
  assert.match(pendingRow, /先不做/);
  assert.match(pendingRow, /编排者/);
  assert.match(pendingRow, /uiux-imagine/);
  assert.match(pendingRow, /uiux-refine/);
  assert.match(pendingRow, /dreaming/);
});

test('wiki-conventions: the local ignore covers docs/design/pending/ too', () => {
  const at = wiki.indexOf('### 本地忽略');
  assert.ok(at >= 0, 'the 本地忽略 subsection is missing');
  assert.match(wiki.slice(at, at + 600), /docs\/design\/pending\//);
});

test('wiki-conventions: the move writes a pointer and the reason into the spec', () => {
  assert.match(pendingRow, /spec[^|]*(指针|指向)[^|]*(理由|原因)/);
});

test('nothing points at a 「design/pending」 section of wiki-conventions; the convention is a row of 目录', () => {
  for (const f of [['skills', 'design', 'uiux-imagine', 'SKILL.md'], ['skills', 'design', 'uiux-refine', 'references', 'after-freeze.md'], ['skills', 'productivity', 'dreaming', 'references', 'pending-designs.md']]) {
    const text = read(...f);
    assert.doesNotMatch(text, /「design\/pending」/, f.join('/'));
    assert.match(text, /`idea-loop:wiki-conventions` 的「目录」里 `design\/pending\/` 那一行/, f.join('/'));
  }
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
  assert.match(ref, /暂缓设计/);
  assert.match(ref, /了结/);
  assert.match(ref, /删除/);
  const skill = read('skills', 'productivity', 'dreaming', 'SKILL.md');
  assert.match(skill, /pending-designs\.md/);
  const table = read('skills', 'productivity', 'dreaming', 'references', 'proposal-table.md');
  assert.match(table, /`暂缓设计`/);
});
