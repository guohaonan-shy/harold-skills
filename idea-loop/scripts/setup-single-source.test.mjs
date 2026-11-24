/**
 * Tripwire — setup's SKILL.md body and the references split out of it say each thing once.
 *
 * The 规则回放 runner / 每周对账 completion conditions and "which file the issue categories are written into" live in
 * the SKILL.md body only; the references carry the steps / the format, not a second copy. The 规则回放 runner section of
 * the body is one line on when to read the reference, not a summary of its steps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const setupDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'engineering', 'setup');
const read = (...p) => readFileSync(join(setupDir, ...p), 'utf8');
const skill = read('SKILL.md');
const body = skill.split(/^---\s*$/m).slice(2).join('---');

function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
}

// #420 folded 规则回放 runner / 每周对账 / 每周分拣 / 调度 into one 「定时任务」 table with one completion condition.
test('规则回放 runner and 每周对账 completion conditions are stated only in the SKILL.md body', () => {
  assert.match(section(body, '定时任务'), /^完成条件：/m, '定时任务: body keeps its completion condition');
  for (const f of ['replay-runner.md', 'weekly-dreaming.md']) {
    assert.doesNotMatch(read('references', f), /完成条件/, `${f} repeats a completion condition the body already states`);
  }
});

test('规则回放 runner in the body is a pointer, not a summary of the steps', () => {
  const s = section(body, '定时任务').split('\n').find((l) => l.startsWith('| 规则回放 runner')) ?? '';
  assert.ok(s.includes('references/replay-runner.md'));
  for (const detail of ['retro-install.mjs', 'create_scheduled_task', 'dyna retro install']) {
    assert.ok(!s.includes(detail), `body 规则回放 runner still summarises the reference (${detail})`);
  }
});

test('which file the issue categories are written into is stated only in the SKILL.md body; the template carries the format', () => {
  assert.match(body, /`ISSUE_TRACKER\.md` 的「分类 label」一节：把人确认的分类/);
  assert.doesNotMatch(read('references', 'issue-tracker.md'), /写进/, 'issue-tracker.md repeats where the categories are written');
  assert.doesNotMatch(read('references', 'issue-tracker.md'), /AGENTS\.md/, 'the categories no longer live in AGENTS.md');
});
