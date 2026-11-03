import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// spec one-session-one-line: one session carries a group on one branch, the stages are 讨论中 → 设计中 →
// 实现中 → 审核中, and spec / design no longer land on main through PRs of their own.

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.md') ? [p] : [];
  });
}

// the two places that explain the older labels to migrate from
const MIGRATION = new Set(['skills/engineering/spec-status/SKILL.md', 'skills/engineering/setup/references/migrate-stages.md', 'skills/engineering/setup/references/preflight-table.md']);

test('no skill, agent or the README speaks of the older stages 验证中 / 待设计 / 待实现, outside the migration notes', () => {
  const offenders = [...files(join(pluginRoot, 'skills')), ...files(join(pluginRoot, 'agents')), join(pluginRoot, 'README.md')]
    .map((p) => relative(pluginRoot, p))
    .filter((p) => !MIGRATION.has(p))
    .filter((p) => /验证中|待设计|待实现/.test(read(p)) && !(p === 'README.md' && /older labels \(验证中/.test(read(p))));
  assert.deepEqual(offenders, []);
});

test('spec and design are committed on the line, not merged through PRs of their own', () => {
  for (const p of [['skills', 'engineering', 'issue-verify', 'SKILL.md'], ['skills', 'engineering', 'to-spec', 'SKILL.md'], ['skills', 'engineering', 'to-spec', 'references', 'finalize.md'], ['skills', 'design', 'uiux-refine', 'SKILL.md']]) {
    const md = read(...p);
    assert.doesNotMatch(md, /合进(知识库的)?主分支/, p.join('/'));
  }
  assert.match(read('skills', 'engineering', 'to-spec', 'references', 'finalize.md'), /docs\(spec\): <slug> 定稿/);
  assert.match(read('skills', 'engineering', 'issue-verify', 'SKILL.md'), /docs\(spec\): <slug> 定稿/);
  assert.doesNotMatch(read('skills', 'design', 'uiux-refine', 'SKILL.md'), /gh pr (create|merge)/);
});

test('issue-session walks the four stages on one branch; PRs turn ready only with the report', () => {
  const session = read('skills', 'engineering', 'issue-session', 'SKILL.md');
  for (const stage of ['讨论中', '设计中', '实现中', '审核中']) assert.ok(session.includes(stage), stage);
  assert.doesNotMatch(session, /git switch -c/);
  assert.doesNotMatch(read('skills', 'engineering', 'implement', 'SKILL.md'), /各 `gh pr ready`/);
  const deliver = read('skills', 'engineering', 'pr-review', 'references', 'deliver.md');
  assert.match(deliver, /gh pr ready/);
  assert.match(deliver, /issues\.mjs" set <docs> 审核中/);
});

