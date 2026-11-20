// The plugin README describes the design handoff and the SEO auto-merge scope the way the skills do now
// (docs/spec/skills-read-home, ticket 06, review round 2): design process files sit under the project directory
// (`<项目目录>/docs/design/tmp/<spec-slug>/`), not under "the worktree root"; an auto-merged SEO PR is judged against
// `内容路径` only, because `docs/` and `SEO.md` live in the project directory and are not in a code PR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const readme = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'README.md'), 'utf8');
const row = (cmd) => readme.split('\n').find((l) => l.startsWith(`| \`${cmd}\``)) ?? '';

test('README: uiux-imagine hands its files over under the project directory, not the worktree root', () => {
  const imagine = row('/idea-loop:uiux-imagine');
  assert.ok(imagine, 'a uiux-imagine row');
  assert.match(imagine, /under the project directory in home/);
  assert.doesNotMatch(imagine, /worktree root|git rev-parse --show-toplevel/);
});

test('README: uiux-research and the pr-review design check name the project directory', () => {
  assert.match(row('/idea-loop:uiux-research'), /<project directory>\/docs\/design\/tmp\/<spec-slug>\/research\//);
  const review = row('/idea-loop:pr-review');
  assert.ok(review, 'a pr-review row');
  assert.match(review, /project directory's `docs\/design\/tmp\/<spec-slug>\/` holds design output/);
  assert.doesNotMatch(review, /the local `docs\/design\/tmp\/`/);
});

test('README: the SEO auto-merge scope is 内容路径 only; docs/ and SEO.md are not in a code PR', () => {
  const review = row('/idea-loop:pr-review');
  assert.match(review, /`内容路径` of `SEO\.md` and nothing else; `docs\/` and `SEO\.md` live in the project directory, not in a code PR/);
  assert.doesNotMatch(review, /plus `docs\/` and the root `SEO\.md`/);
});

test('README: dreaming\'s missed-archive check reads the project directory as committed in home, and the spec\'s issues decide', () => {
  const dreaming = row('/idea-loop:dreaming');
  assert.ok(dreaming, 'a dreaming row');
  assert.match(dreaming, /in the project directory \(read as committed in home\) still holds design output \(apart from `research\/`\) while every issue its spec lists is closed, or the spec is gone/);
  assert.doesNotMatch(dreaming, /on `origin\/<base branch>` while its spec is 完成/);
});
