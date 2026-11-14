/**
 * Tripwire — tests run in layers: the implementer runs only what the ticket touches, the full suite runs once, in CI.
 *
 * Spec test-layering-ci-full, test decisions. The rules live in skill and agent text, so these checks pin
 * what has to be readable in the right section: the implementer's 做 / 完成标准 / 被叫回来修 / verified line,
 * implement's ff-retry and its "wait for CI" step between `gh pr ready` and pr-review, pr-review's
 * 前提 and 一轮之后往哪走, the two 机械检查 sections, setup's REVIEW.md template, the README and the version.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

/** The text under a heading (any level) up to the next heading of the same or a higher level. */
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

const implementer = read('agents', 'implementer.md');
const reviewer = read('agents', 'pr-reviewer.md');
const implement = read('skills', 'engineering', 'implement', 'SKILL.md');
const prReview = read('skills', 'engineering', 'pr-review', 'SKILL.md');
const standards = read('skills', 'engineering', 'pr-review', 'references', 'review-standards.md');
const reviewTemplate = read('skills', 'engineering', 'setup', 'references', 'review.md');
const readme = read('README.md');

test('the implementer runs only the tests the ticket touches, the touched APIs, the selected regressions, typecheck and lint; the full suite goes to CI', () => {
  const doIt = section(implementer, '做');
  const done = section(implementer, '完成标准，然后 commit');
  assert.doesNotMatch(doIt, /全量套件最后跑一次/);
  assert.doesNotMatch(done, /全量套件、typecheck、lint 都是绿的/);
  for (const part of [doIt, done]) {
    assert.match(part, /改动涉及/);
    assert.match(part, /交给 CI/);
  }
  assert.match(doIt, /选中的存量回归/);
  assert.match(done, /typecheck/);
  assert.match(done, /lint/);
  // called back to fix: re-run the tests of the boxes already ticked, not the full suite
  const input = section(implementer, '输入');
  assert.doesNotMatch(input, /全量套件照样要全绿/);
  assert.match(input, /已勾的格[\s\S]*重跑/);
});

test('the implementer says how to pick the touched APIs, that shared low layers do not widen to the full suite, that REVIEW.md gives only commands, and that real-credential work stays local', () => {
  const doIt = section(implementer, '做');
  assert.match(doIt, /涉及的 API/);
  assert.match(doIt, /被很多接口共用的底层/);
  assert.match(doIt, /直接调到它的/);
  assert.match(doIt, /`REVIEW\.md`[^。\n]*只取命令/);
  assert.match(doIt, /真实凭据[^。\n]*本机/);
});

test('the implementer hands back a verified line listing which tests ran', () => {
  const back = section(implementer, '交回');
  assert.match(back, /跑了哪些测试/);
  assert.match(back, /全量交给 CI/);
});

test('implement sends a non-fast-forwardable commit back to re-run its own ticket tests, not the full suite', () => {
  const land = section(implement, '核对与落地');
  assert.doesNotMatch(land, /重跑全量套件/);
  assert.match(land, /ff 不了[^。\n]*重跑[^。\n]*这张工单[^。\n]*测试/);
});

test('implement waits for CI between `gh pr ready` and pr-review, and says what to do when it is red, unrelated, or absent', () => {
  const stop = section(implement, '没活了就停下');
  // the sentence that readies the PRs names the order: ready, then wait for CI, then pr-review
  const ready = stop.indexOf('gh pr ready');
  const sentenceEnd = stop.indexOf('\n', ready);
  const order = stop.slice(ready, sentenceEnd);
  assert.ok(ready >= 0, 'implement no longer says `gh pr ready`');
  assert.ok(order.indexOf('等 CI') > 0, 'the step after `gh pr ready` must be waiting for CI');
  assert.ok(order.indexOf('idea-loop:pr-review') > order.indexOf('等 CI'), 'pr-review must start after the CI wait');
  assert.ok(stop.indexOf('gh pr checks') > ready, '`gh pr checks` must come after `gh pr ready`');
  assert.match(stop, /gh pr checks <PR 号> --watch/);
  assert.match(stop, /gh run view <run> --log-failed/);
  assert.match(stop, /git blame/);
  assert.match(stop, /CI（<日期>）：/);
  assert.match(stop, /docs\(tickets\): <NN> — CI 失败/);
  assert.match(stop, /基准分支最近一次 CI[^。\n]*也红[^。\n]*开 issue/);
  assert.match(stop, /没有检查[^。\n]*本机跑一次[^。\n]*全量/);
});

test('pr-review requires the head\'s CI to be done and green (or no checks), before round 1 and before each next round', () => {
  const pre = section(prReview, '前提');
  assert.match(pre, /CI/);
  assert.match(pre, /全绿（或没有检查）/);
  assert.match(pre, /gh pr checks/);
  // 红了要显式调 implement 的「等 CI」，不只写「照 … 处理」
  assert.match(pre, /用 Skill 工具调 `idea-loop:implement`，看它的「等 CI」/);
  const next = section(prReview, '一轮之后往哪走');
  assert.match(next, /修复[^。\n]*先等 CI[^。\n]*起下一轮/);
});

test('both 机械检查 sections read the full-suite result from CI, run it locally only without checks, and run only the matching tests to verify a finding', () => {
  for (const part of [section(standards, '机械检查'), section(reviewer, '机械检查')]) {
    assert.match(part, /CI 结论/);
    assert.match(part, /CI 未完成/);
    assert.match(part, /没有检查[^。\n]*本机跑/);
    assert.match(part, /只跑[^。\n]*那几个/);
    assert.match(part, /typecheck、lint[^。\n]*本机/);
  }
});

test('the REVIEW.md template no longer says to run the full suite before committing', () => {
  assert.doesNotMatch(reviewTemplate, /提交前跑全量/);
  assert.doesNotMatch(reviewTemplate, /review 时每一条都跑一遍/);
  assert.match(reviewTemplate, /测试只跑改动涉及的/);
  assert.match(reviewTemplate, /全量由 PR 转 ready 后的 CI 跑/);
});

test('the README no longer says a ticket is done when the full suite is green', () => {
  assert.doesNotMatch(readme, /selected regressions and the full suite are green/);
  assert.match(readme, /the full suite runs once, in CI/);
});
