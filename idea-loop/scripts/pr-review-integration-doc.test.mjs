/**
 * Tripwire — pr-review can run on a release root's integration PR (integration branch → main).
 *
 * Spec no-decision-autopilot, ticket 05, review round 1 S3. Before: the root session was told to run a
 * pr-review round on the draft integration PR after each child PR merged, but pr-review turned a draft PR
 * away ("回 implement") and its reviewer took one spec and its tickets, so the step could not run — or ran
 * on one spec and could not see two specs clashing. Now a reference (references/integration-review.md)
 * says how that round differs: a draft is let through, the reviewer takes every spec already merged into
 * the integration branch and looks only for clashes between them, and the PR stays a draft until the human
 * says merge. The SKILL.md body only points at it (it must stay under 5000 characters).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, templatePath, BUILTIN } from './codex-prompt.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pluginRoot, 'skills', 'engineering', 'pr-review');
const read = (...p) => readFileSync(join(...p), 'utf8');
const skill = read(dir, 'SKILL.md');
const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '');
const refPath = join(dir, 'references', 'integration-review.md');
const ref = existsSync(refPath) ? readFileSync(refPath, 'utf8') : '';
const reviewer = read(pluginRoot, 'agents', 'pr-reviewer.md');
const issueSession = read(pluginRoot, 'skills', 'engineering', 'issue-session', 'SKILL.md');
const readme = read(pluginRoot, 'README.md');

test('references/integration-review.md exists', () => {
  assert.ok(existsSync(refPath), 'pr-review has no references/integration-review.md');
});

test('the SKILL.md premise points to it at the draft-PR rule, instead of bouncing the integration PR', () => {
  const line = body.split('\n').find((l) => /draft/.test(l) && /回 `idea-loop:implement`/.test(l));
  assert.ok(line, 'the premise line about a draft PR is missing');
  assert.match(line, /integration-review\.md/, 'the draft-PR premise must make an exception pointing at integration-review.md');
});

test('the reference lets a draft integration PR through and says it stays a draft until the human says merge', () => {
  assert.match(ref, /草稿/);
  assert.match(ref, /不退回/);
  assert.match(ref, /一直(保持)?草稿|保持草稿/);
  assert.match(ref, /人说合并/);
  assert.match(ref, /gh pr ready/, 'merge time needs the PR turned ready before it can merge');
});

test('the reference makes the reviewer take every spec merged into the integration branch', () => {
  assert.match(ref, /每份|几份|全部/);
  assert.match(ref, /合进集成分支/);
  assert.match(ref, /slug/);
});

test('the reference restricts the round to clashes between specs, with both kinds of clash named', () => {
  assert.match(ref, /冲突/);
  assert.match(ref, /同一处规则被改成两样/);
  assert.match(ref, /让另一份的说法失效/);
  assert.match(ref, /只查|专查/);
});

test('the reference explains the pieces that differ from a single-spec round: tickets, fixes, next round, merge', () => {
  assert.match(ref, /工单/, 'tickets are deleted with each child PR; the reference must say where the reviewer reads them');
  assert.match(ref, /回工单/, 'it must say how 回工单 applies here');
  assert.match(ref, /不自动起下一轮|不自动起/, 'the next round starts from a child merge, not automatically');
  assert.match(ref, /merge\.md/);
});

test('the pr-reviewer definition points to the reference for an integration round', () => {
  assert.match(reviewer, /integration-review\.md/);
});

test('an integration Codex template exists and fills with several specs', () => {
  assert.ok(existsSync(templatePath('integration')), 'references/codex-integration.md is missing');
  const out = render(readFileSync(templatePath('integration'), 'utf8'), {
    ...BUILTIN, worktree: '/w', base: 'abc', specs: 'docs/spec/a/a.md,docs/spec/b/b.md', wontfix: '/w/wontfix.md',
  });
  assert.match(out, /docs\/spec\/a\/a\.md,docs\/spec\/b\/b\.md/);
  assert.match(out, /冲突/);
});

test('issue-session and the README say the integration PR stays a draft and point at the integration review', () => {
  assert.match(issueSession, /一直是草稿/);
  assert.match(issueSession, /integration-review\.md/);
  const row = readme.split('\n').find((l) => l.startsWith('| `idea-loop:issue-session`'));
  assert.match(row, /stays a draft|remains a draft|kept as a draft/, 'the README issue-session row must say the draft PR stays a draft until merge');
});

test('the SKILL.md body is still at most 5000 characters', () => {
  assert.ok([...body].length <= 5000, `body is ${[...body].length} characters`);
});
