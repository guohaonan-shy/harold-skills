/**
 * Tripwire — the night mode of an issue session (spec dispatch-day-night-modes, ticket 04).
 *
 * The dispatcher's night rounds open todo sessions whose task says 「夜间模式」: nobody is there to
 * answer, so the session may not stop to ask. The rules live in issue-session's own reference
 * (the SKILL.md body is within a few hundred characters of its 5000 limit and carries one line
 * pointing at it); the PR description gets the two sections the rules write into. Whether a model
 * follows the rules is not decided here; this pins that the reference exists, is pointed at, and
 * lists every stop, the stopping point and what is left for daytime.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sessionDir = join(root, 'skills', 'engineering', 'issue-session');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');

const skill = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const reference = existsSync(join(sessionDir, 'references', 'night-mode.md'))
  ? readFileSync(join(sessionDir, 'references', 'night-mode.md'), 'utf8')
  : '';

test('issue-session points at the night-mode reference in one line, and its body stays under 5000 characters', () => {
  assert.ok(reference, 'issue-session/references/night-mode.md exists');
  const lines = body(skill).split('\n').filter((l) => l.includes('references/night-mode.md'));
  assert.equal(lines.length, 1, 'exactly one line of the body points at it');
  assert.match(lines[0], /夜间模式/, 'the line names the trigger the dispatcher writes into the task');
  assert.ok([...body(skill)].length < 5000, `body is ${[...body(skill)].length} characters`);
});

test('the reference says: never stop to ask, settle by the recommendation, record it as 夜里替你定的', () => {
  assert.match(reference, /不停下问人/);
  assert.match(reference, /按推荐定/);
  assert.match(reference, /夜里替你定的/);
  assert.match(reference, /选了什么、为什么、另一种是什么/);
  assert.match(reference, /idea-loop:decision-rules/);
});

test('the reference lists all five things the session stops for, and writes the stop under 等你定的', () => {
  for (const stop of ['合并 PR', '删分支或数据', '强推', '对外发信', '在别人的仓库评论', '这个 issue 以外的项目']) {
    assert.ok(reference.includes(stop), `stop "${stop}" is listed`);
  }
  assert.match(reference, /等你定的/);
  assert.match(reference, /会话留在当前分组/);
  assert.match(reference, /两小时/);
});

test('the reference says where the session stops: review done, PR ready, in-review, waiting for the word to merge', () => {
  assert.match(reference, /idea-loop:pr-review/);
  assert.match(reference, /转 ready/);
  assert.match(reference, /in-review/);
  assert.match(reference, /等人说合并/);
});

test('the reference leaves retro and archiving to the daytime', () => {
  assert.match(reference, /不做 retro/);
  assert.match(reference, /不归档/);
});

test('the PR description format says where 夜里替你定的 and 等你定的 go and what each item holds', () => {
  const description = read('skills', 'engineering', 'pr', 'references', 'description.md');
  const prSkill = read('skills', 'engineering', 'pr', 'SKILL.md');
  const heads = [...description.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.ok(heads.indexOf('夜里替你定的') > heads.indexOf('怎么验证'), 'after 怎么验证');
  assert.ok(heads.indexOf('夜里替你定的') < heads.indexOf('等你定的'));
  assert.ok(heads.indexOf('等你定的') < heads.indexOf('要你做的事'), 'both sit before 要你做的事');
  assert.match(description, /选了什么、为什么、另一种是什么/);
  assert.match(description, /停在哪、为什么只能人来/);
  assert.match(prSkill, /`night-decided`/);
  assert.match(prSkill, /`night-waiting`/);
});

test("the reference does not read another skill's private references", () => {
  assert.doesNotMatch(reference, /idea-loop:[a-z-]+`?\s*的\s*`?\[?`?references\//);
  assert.doesNotMatch(reference, /skills\/[a-z]+\/[a-z-]+\/references\//);
});
