/**
 * Tripwire — a design change that the judge sends back and the designer redoes still commits the
 * version the judge passed, not the first one the designer produced.
 *
 * Spec canvas-truth-dreaming-agents: "评委 ui-master 看一眼，过了就进 PR 分支". design-change-sync
 * numbers the first attempt v<N+1>, the redo v<N+2>; writing "v<N+1>" into the commit step or into the
 * ticket cell it appends would pin the rejected one. Those places name the final version, v<终>.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const sync = read('skills', 'design', 'design-change-sync', 'SKILL.md');
const implement = read('skills', 'engineering', 'implement', 'SKILL.md');
const prReview = read('skills', 'engineering', 'pr-review', 'SKILL.md');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

test('design-change-sync: "过了之后" commits the final version, not a numbered attempt', () => {
  const text = section(sync, '过了之后');
  assert.doesNotMatch(text, /v<N\+\d+>/, 'the commit step pins a specific attempt');
  assert.match(text, /canvas\/v<终>\.html/);
});

test('design-change-sync: defines which version is final', () => {
  assert.match(sync, /v<终>[^\n]*(通过|评委)/);
});

test('design-change-sync: the ticket cell it has the caller append points at the final version', () => {
  const line = sync.split('\n').find((l) => l.includes('设计变更（<日期>）'));
  assert.ok(line, 'design-change-sync has no appended-cell line');
  assert.doesNotMatch(line, /v<N\+\d+>/, 'the cell pins a specific attempt');
  assert.match(line, /canvas\/v<终>\.html/);
});

// implement and pr-review keep one sentence each and point at the single source for the cell text.
for (const [name, doc] of [['implement', implement], ['pr-review', prReview]]) {
  test(`${name}: the design-change section points at design-change-sync and does not restate the cell`, () => {
    const text = section(doc, '设计变更');
    assert.match(text, /idea-loop:design-change-sync/, `${name} does not call design-change-sync`);
    assert.doesNotMatch(text, /v<N\+\d+>/, 'the section pins a specific attempt');
    assert.doesNotMatch(text, /canvas\/v<终>\.html/, 'the cell text lives only in design-change-sync');
  });
}
