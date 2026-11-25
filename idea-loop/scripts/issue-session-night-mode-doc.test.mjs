/**
 * Tripwire — the night mode of an issue session (spec dispatch-day-night-modes, ticket 04).
 *
 * The dispatcher's night rounds open todo sessions whose task says 「夜间模式」: nobody is there to
 * answer, so the session may not stop to ask. The rules live in issue-session's own reference
 * (the SKILL.md carries one line
 * pointing at it); what is settled by the recommendation goes into the review loop file, what stops the session goes into a comment on the issue. Whether a model
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

test('issue-session points at the night-mode reference in one line', () => {
  assert.ok(reference, 'issue-session/references/night-mode.md exists');
  const lines = body(skill).split('\n').filter((l) => l.includes('references/night-mode.md'));
  assert.equal(lines.length, 1, 'exactly one line of the body points at it');
  assert.match(lines[0], /夜间模式/, 'the line names the trigger the dispatcher writes into the task');
});

test('the reference says: never stop to ask, settle by the recommendation, record it in the review loop file only', () => {
  assert.match(reference, /不停下问人/);
  assert.match(reference, /按推荐定/);
  assert.match(reference, /按推荐定的，只记进 review loop 文件/);
  assert.doesNotMatch(reference, /dyna pr body/, 'the PR description is not written to at night');
  assert.match(reference, /选了什么、为什么、另一种是什么/);
  assert.match(reference, /「停下问我」/);
  assert.match(reference, /「只由我做」/);
});

test('the reference lists all five things the session stops for, and writes the stop as a comment on the issue', () => {
  for (const stop of ['合并 PR', '删分支或数据', '强推', '对外发信', '在别人的仓库评论', '这个 issue 以外的项目']) {
    assert.ok(reference.includes(stop), `stop "${stop}" is listed`);
  }
  assert.match(reference, /在 issue 上留一条评论（`dyna issues note`）：停在哪件事、为什么要人来、人说了怎么做之后会话怎么接/);
  assert.match(reference, /会话留在当前分组/);
  assert.match(reference, /调度每轮照样派新的 todo，不等它/);
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

test("the reference does not read another skill's private references", () => {
  assert.doesNotMatch(reference, /idea-loop:[a-z-]+`?\s*的\s*`?\[?`?references\//);
  assert.doesNotMatch(reference, /skills\/[a-z]+\/[a-z-]+\/references\//);
});

test('night mode sends a writing judge\'s `premise` back to triage with its words, matching the revision loop reference', () => {
  // The night rule says "settle by the recommendation"; the angle of an article is the human's, so the one
  // exception is written where the rule is: 翻回 triage, the judge's own words in the comment, no thesis change.
  const line = reference.split('\n').find((l) => l.includes('`premise`')) ?? '';
  assert.ok(line, 'night-mode.md has a line about `premise`');
  assert.match(line, /seo-writing/);
  assert.match(line, /翻回 triage|triage <号>/);
  assert.match(line, /写作评委原话/);
  assert.match(line, /不按推荐改论点/);
  assert.match(line, /交回，不算停下/);

  const loop = read('skills', 'seo', 'seo-writing', 'references', 'revision-loop.md');
  const premise = loop.split(/^## /m).find((s) => s.startsWith('`premise`')) ?? '';
  assert.match(premise, /翻回 triage/, 'the loop reference sends it to triage');
  assert.match(premise, /写作评委原话/, 'with the judge\'s own words');
});
