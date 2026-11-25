/**
 * Tripwire — shelved designs live in the project directory's docs/design/pending/<spec-slug>/ (0.2.0: the
 * knowledge base is in the project directory in home, one per device, so there is no main checkout to pick).
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

const wiki = read('skills', 'productivity', 'wiki-conventions', 'SKILL.md');

// wiki-conventions keeps one row per directory in its 目录 table (docs/spec/wiki-conventions-slim), so the
// shelved-design convention is the design/pending/ row, and the local ignore is the 本地忽略 subsection.
const pendingRow = wiki.split('\n').find((l) => l.startsWith('| `design/pending/` |')) ?? '';

test('wiki-conventions: the 目录 table has a design/pending/ row that says where, local only, who moves, who reads', () => {
  assert.ok(pendingRow, 'the 目录 table has no design/pending/ row');
  assert.doesNotMatch(pendingRow, /主 checkout|git worktree list/);
  assert.match(pendingRow, /只在本地|不提交/);
  assert.match(pendingRow, /先不做/);
  assert.match(pendingRow, /编排者/);
  assert.match(pendingRow, /uiux-imagine/);
  assert.match(pendingRow, /uiux-refine/);
  assert.match(pendingRow, /dreaming/);
});

test('wiki-conventions: the row also owns the read side: ask whether to continue, copy back into design/tmp/, resume', () => {
  assert.match(pendingRow, /问人要不要接着做/);
  assert.match(pendingRow, /复制回 `design\/tmp\/`/);
  assert.match(pendingRow, /这份留着/);
  assert.match(pendingRow, /中断恢复/);
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
  test(`${skill}: checks the project directory's pending/ before starting, asks the human, copies back and resumes from 中断与恢复`, () => {
    const text = read('skills', 'design', skill, 'SKILL.md');
    const opening = text.slice(0, text.indexOf('## 起步') > 0 ? text.indexOf('## 起步') : 4000);
    assert.match(opening, /pending\//);
    assert.match(opening, /项目目录/);
    assert.doesNotMatch(opening, /主 checkout/);
    // the rule is written once, in wiki-conventions' design/pending/ row; the skill only points there and names its own resume place
    assert.match(opening, /`idea-loop:wiki-conventions` 的「目录」里 `design\/pending\/` 那一行/);
    assert.doesNotMatch(opening, /复制回/);
    assert.match(opening, /中断与恢复|after-freeze/);
  });
}

test('uiux-refine after-freeze reference carries the 先不做 move: pending dir, nothing cleaned, spec pointer and reason', () => {
  const text = read('skills', 'design', 'uiux-refine', 'references', 'after-freeze.md');
  assert.match(text, /先不做/);
  assert.doesNotMatch(text, /主 checkout/);
  assert.match(text, /`idea-loop:wiki-conventions` 的「目录」里 `design\/pending\/` 那一行/, 'the move itself is owned by wiki-conventions; this reference points there');
  assert.doesNotMatch(text, /不清理|目标目录已存在/);
  assert.match(text, /指针/);
  assert.match(text, /理由/);
});

test('dreaming lists every pending design with whether its spec is settled, and proposes deleting the settled ones', () => {
  const ref = read('skills', 'productivity', 'dreaming', 'references', 'pending-designs.md');
  assert.match(ref, /项目目录/);
  assert.doesNotMatch(ref, /主 checkout|git worktree list/);
  assert.match(ref, /暂缓设计/);
  assert.match(ref, /了结/);
  assert.match(ref, /删除/);
  const skill = read('skills', 'productivity', 'dreaming', 'SKILL.md');
  assert.match(skill, /pending-designs\.md/);
  const table = read('skills', 'productivity', 'dreaming', 'references', 'proposal-table.md');
  assert.match(table, /`暂缓设计`/);
});
