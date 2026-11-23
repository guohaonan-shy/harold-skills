/**
 * Tripwire — a pr-review round reads how much each SKILL.md and agent definition grew.
 *
 * Spec skill-structure-checks, ticket 02. The mechanical-checks list in run-a-round.md names
 * `dyna pr skill-growth <merge-base>`, whose output goes into checks.md as it is; the Standards axis judges it.
 * The command itself is tested in dyna/internal/pr (skillgrowth_test.go); this pins that the list says to run it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const runARound = readFileSync(join(pluginRoot, 'skills/engineering/pr-review/references/run-a-round.md'), 'utf8');

/** The text under a heading up to the next heading of the same or a higher level. */
function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => /^#{1,6} /.test(l) && l.replace(/^#+ /, '').startsWith(title));
  assert.ok(start >= 0, `no heading starting "${title}"`);
  const level = lines[start].match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+) /);
    return m && m[1].length <= level;
  });
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

test('the mechanical-checks list of run-a-round.md has `dyna pr skill-growth <merge-base>`, and its result goes to Standards as a fact', () => {
  const checks = section(runARound, '机械检查');
  assert.match(checks, /`dyna pr skill-growth <merge-base>`/);
  assert.match(checks, /skill-growth[^。\n]*只报事实[^。\n]*Standards/);
  assert.match(checks, /这些结果是事实，原样交给 Standards 进程/);
});

test('it is one more command in the list, not a new step', () => {
  const steps = runARound.split('\n').filter((l) => /^## /.test(l));
  assert.deepEqual(
    steps.map((l) => l.replace(/^## /, '')).filter((t) => /skill-growth|字数/.test(t)),
    [],
  );
});
