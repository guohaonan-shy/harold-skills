/**
 * Tripwire — issue-session splits the work between the root session and the child sessions.
 *
 * Spec no-decision-autopilot, ticket 05 (「审核报告写进 PR 描述，人在子会话里读、在子会话里说合并」). History:
 * the consolidation spec first wrote 「issue 会话自己只管合并和收尾」; the human then decided the child session
 * runs its own PR's pr-review and takes the merge, while the root session keeps the up-front grill, the
 * integration-time review of a release root, and closing the root. This test pins that split in the skill and
 * the README.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const skill = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const readme = read('README.md');
const impl = section(skill, '实现');
const row = readme.split('\n').find((l) => l.startsWith('| `idea-loop:issue-session`'));

test('「实现」 has a table splitting the root session from the child session', () => {
  const rows = impl.split('\n').filter((l) => l.trim().startsWith('|'));
  assert.ok(rows.some((l) => /根的会话/.test(l)), 'the table must have a 根的会话 column or row');
  assert.ok(rows.some((l) => /子会话/.test(l)), 'the table must have a 子会话 column or row');
  assert.ok(rows.some((l) => /grill/.test(l) && /关根/.test(l)), 'the root side must say it grills up front and closes the root');
  assert.ok(rows.some((l) => /pr-review/.test(l) && /合并/.test(l)), 'the child side must say it runs its PR\'s pr-review and merges');
});

test('the old 「issue 会话自己只管合并和收尾」 wording is gone', () => {
  assert.ok(!/只管合并和收尾/.test(skill), 'issue-session must not say the session only does merging and wrap-up');
});

test('a child PR is merged by the human saying so in the child session, through the child\'s pr-review', () => {
  assert.match(impl, /人在子会话里说「合并」/, '「实现」 must say the human says merge in the child session');
  assert.match(impl, /子会话的 pr-review[^。\n]*合进[^。\n]*集成分支[^。\n]*主分支/, '「实现」 must say the child\'s pr-review merges into the integration branch (release root) or main (module root)');
});

test('release root: draft PR after the first child PR, one pr-review round per child PR merged, root session merges back', () => {
  const m = impl.split('\n').find((l) => /版本/.test(l) && /draft PR/.test(l));
  assert.ok(m, '「实现」 must have a line for the release root that mentions the draft PR');
  assert.match(m, /第一个子 PR 合进/);
  assert.match(m, /每合进一个子 PR[^。\n]*pr-review/);
  assert.match(m, /人说合并[^。\n]*根的会话[^。\n]*合回主分支|根的会话[^。\n]*合回主分支/);
  assert.match(impl, /子会话[^。\n]*(收工|合并后)[^。\n]*(通知|发)[^。\n]*根的会话|根的会话[^。\n]*(收到|通知)[^。\n]*子会话/, '「实现」 must say the child session tells the root session after merging');
});

test('module root: only the up-front grill and closing the root, no review during integration', () => {
  const m = impl.split('\n').find((l) => /模块/.test(l) && /关根/.test(l));
  assert.ok(m, '「实现」 must have a line for the module root that mentions closing the root');
  assert.match(m, /只管前期 grill/);
  assert.match(m, /集成阶段不跑 review/);
});

test('a child session on a spec that touches no UI stops only for decisions, production operations and merging; UI specs stop as before', () => {
  const m = impl.split('\n').find((l) => /不碰 UI/.test(l));
  assert.ok(m, '「实现」 must have a line for specs that touch no UI');
  assert.match(m, /决定题/);
  assert.match(m, /生产操作/);
  assert.match(m, /合并前/);
  assert.match(m, /审核报告/);
  assert.match(m, /碰 UI 的照旧/);
});

test('the README row for issue-session describes the root / child split', () => {
  assert.ok(row, 'README has no issue-session row in the Skills table');
  assert.match(row, /runs that PR's `pr-review`/, 'the row must say the child session runs its own PR\'s review');
  assert.match(row, /says merge in the child session/, 'the row must say the human merges in the child session');
  assert.match(row, /draft PR/, 'the row must mention the draft integration PR');
  assert.match(row, /module[^.;]*(grill|closes)/i, 'the row must say what a module root does');
  assert.match(row, /touch(es)? no UI/, 'the row must cover specs that touch no UI');
});

test('the issue-session body stays under 5000 characters', () => {
  const m = skill.match(/^---\n[\s\S]*?\n---\n/);
  const n = [...(m ? skill.slice(m[0].length) : skill)].length;
  assert.ok(n < 5000, `SKILL.md body is ${n} characters; the limit is 5000`);
});
