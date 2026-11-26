/**
 * Tripwire — with no checks on the PR, the full suite runs once per head, and three places say it the same way.
 *
 * Spec skill-structure-checks, ticket 03. implement's 「等 CI」 records the local run with `dyna pr full-suite record`;
 * pr-review's mechanical checks (run-a-round.md and review-standards.md) `show` the head first and reuse a green
 * record as `复用 <head> 的本机结果`; the repository's REVIEW.md says in its first sentence where the full suite runs.
 * The commands themselves are tested in dyna/internal/pr (fullsuite_test.go).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pluginRoot, '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const stopAndResume = read('skills/engineering/implement/references/stop-and-resume.md');
const runARound = read('skills/engineering/pr-review/references/run-a-round.md');
const standards = read('skills/engineering/pr-review/references/review-standards.md');
// this repository's own REVIEW.md (moved to its project directory in home): the check that reads it is skipped
// when it is not there
const reviewFile = join(repoRoot, 'REVIEW.md');
const hasReview = existsSync(reviewFile);
const reviewMd = hasReview ? readFileSync(reviewFile, 'utf8') : '';

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

test('the 等 CI branch for a PR with no checks records the local full run with `dyna pr full-suite record`', () => {
  const wait = stopAndResume.slice(stopAndResume.lastIndexOf('**等 CI**：'));
  const noChecks = wait.split('\n').find((l) => /^- \*\*PR 上没有检查\*\*/.test(l));
  assert.ok(noChecks, 'the 等 CI list has no 「PR 上没有检查」 branch');
  assert.match(noChecks, /`dyna pr full-suite record <head> <退出码> <日志文件>`/);
  assert.match(noChecks, /没有检查[^。\n]*本机跑一次[^。\n]*全量/);
});

test('the 等 CI no-checks branch names the head by what it is, not by an inline git command, like the two review docs', () => {
  const wait = stopAndResume.slice(stopAndResume.lastIndexOf('**等 CI**：'));
  const noChecks = wait.split('\n').find((l) => /^- \*\*PR 上没有检查\*\*/.test(l));
  assert.doesNotMatch(noChecks, /`git /, 'an inline git command in a skill reference');
  assert.match(noChecks, /当前提交的完整提交号/);
});

test('both mechanical-check places show the head first and reuse a green record as 复用 <head> 的本机结果', () => {
  for (const [name, part] of [['run-a-round.md', section(runARound, '机械检查')], ['review-standards.md', section(standards, '机械检查')]]) {
    assert.match(part, /`dyna pr full-suite show /, `${name}: no \`dyna pr full-suite show\``);
    assert.match(part, /全量测试 \| 复用 <head> 的本机结果/, `${name}: no reuse wording`);
    assert.match(part, /没有记录[^。\n]*记录是红的[^。\n]*head 变了[^。\n]*本机跑/, `${name}: no rerun conditions`);
    assert.match(part, /`dyna pr full-suite record <head> <退出码> <日志文件>`/, `${name}: a rerun is not recorded`);
    assert.match(part, /没有检查[^。\n]*本机跑/, `${name}: lost the no-checks-run-locally sentence`);
  }
});

test('no place still tells a head with a local full run to run it a second time', () => {
  for (const [name, text] of [['run-a-round.md', runARound], ['review-standards.md', standards]]) {
    assert.doesNotMatch(text, /PR 上没有检查时[^。\n]*全量测试照旧本机跑/, `${name} still says to run it again as before`);
  }
  assert.doesNotMatch(stopAndResume, /全量测试只在这里跑一遍/);
});

test('REVIEW.md 验证命令 says in its first sentence where the full suite runs', { skip: !hasReview && 'this repository has no REVIEW.md' }, () => {
  const first = section(reviewMd, '验证命令').split('\n').find((l) => l.trim() !== '');
  const sentence = first.split('。')[0];
  assert.match(sentence, /执行方只跑改动涉及的（前两条）/);
  assert.match(sentence, /等 CI/);
  assert.match(sentence, /review 每轮 head 变了再跑/);
  assert.doesNotMatch(first, /提交前跑全量/);
});
