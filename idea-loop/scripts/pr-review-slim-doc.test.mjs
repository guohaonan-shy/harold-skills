/**
 * Tripwire — pr-review's SKILL.md stays slim: body under 5000 characters (AGENTS.md「标准 plugin 目录结构」),
 * each action written once, the ticket-return steps defined in one place, "what next after a round" in
 * one section, and the branches only some rounds take (UI walkthrough) behind a pointer.
 *
 * Spec no-decision-autopilot, ticket 06. Before: the body was ~16k characters, "回工单" (find the owning
 * ticket, append a cell, commit, dispatch) was spelled out in five places, and where a round goes next
 * was spread over three sections. PR_REVIEW_SKILL overrides the file under test (to see the checks fail
 * on the old text).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pluginRoot, 'skills', 'engineering', 'pr-review');
const file = process.env.PR_REVIEW_SKILL || join(dir, 'SKILL.md');
const raw = readFileSync(file, 'utf8');
// The other places that used to repeat the cap; env overrides let the checks run against the old text.
const readRef = (envName, ...parts) => readFileSync(process.env[envName] || join(pluginRoot, ...parts), 'utf8');
const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');

function section(title) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} /.test(l) && l.replace(/^#+ /, '').startsWith(title));
  assert.ok(start >= 0, `no section "${title}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{2,3} /.test(l));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

// The limit in AGENTS.md「标准 plugin 目录结构」. The design change, which only a round where the human accepted a
// design that differs from the frozen canvas reaches, lives in references/design-change.md (spec skill-body-limit-backlog).
test('the body is under 5000 characters (the limit in AGENTS.md)', () => {
  assert.ok([...body].length < 5000, `body is ${[...body].length} characters`);
});

test('the append-a-cell-to-the-ticket step is written once, under 回工单', () => {
  assert.equal(body.split('docs(tickets): <NN> — review 第').length - 1, 1, 'the ticket-cell commit message is spelled out more than once');
  const text = section('回工单');
  assert.match(text, /git blame/);
  assert.match(text, /ticket-ledger\.mjs/);
  assert.match(text, /idea-loop:implementer/);
  assert.match(text, /Ticket:/);
  assert.ok(body.split('回工单').length - 1 >= 3, 'the other places should refer to 回工单 by name');
});

test('the actions are one table with an overturn column', () => {
  const rows = body.split('\n').filter((l) => /^\| \*\*(修|同步改|接受并补记|开 issue|不修)/.test(l));
  assert.equal(rows.length, 5, 'one row per action: 修/恢复, 同步改, 接受并补记, 开 issue, 不修');
  assert.match(body, /\| 被推翻时 \|/);
});

test('where a round goes next is one section with the three outcomes', () => {
  const text = section('一轮之后往哪走');
  assert.match(text, /自动起下一轮/);
  assert.match(text, /交审核报告/);
  assert.match(text, /停下等人/);
  assert.match(text, /不超过 5/);
  assert.match(text, /已跑满 5 轮，第 5 轮的修复还没审/);
  assert.doesNotMatch(text, /不超过 2|跑满两轮|两轮/, 'the old two-round cap is gone');
  assert.match(text, /逐题核过/);
  assert.equal(body.split('逐题核过').length - 1, 1, 'the per-question check is written more than once');
});

test('the auto-started next round runs the whole 前提 first (merge in the latest base, push, then wait for CI), not only the CI wait', () => {
  const text = section('一轮之后往哪走');
  const point1 = text.slice(text.indexOf('1. **这一轮有修复**'), text.indexOf('2. **没有修复'));
  assert.ok(point1.length > 0, 'cannot find point 1 of 一轮之后往哪走');
  assert.match(point1, /先走完「前提」/, 'point 1 does not cite the whole 前提');
  assert.match(point1, /合入最新主分支/, 'point 1 does not name the merge-in step');
  assert.doesNotMatch(point1, /先等 CI（同前提）/, 'point 1 is back to waiting for CI only');
});

test('the rules decision-rules already owns are pointers, not restated lists', () => {
  assert.match(body, /idea-loop:decision-rules/);
  assert.doesNotMatch(body, /仍然停/);
});

test('the UI walkthrough lives in its own reference, with the condition for reading it', () => {
  assert.ok(existsSync(join(dir, 'references', 'ui-walkthrough.md')), 'references/ui-walkthrough.md is missing');
  assert.match(body, /有设计产物[^\n]*references\/ui-walkthrough\.md/);
  assert.doesNotMatch(body, /ui-incomplete\.md/, 'the incomplete-walkthrough handling belongs in the reference');
});

test('the design change is a pointer to references/design-change.md; the steps live in the reference', () => {
  const text = section('设计变更');
  assert.match(text, /references\/design-change\.md/, 'the section does not point at the reference');
  assert.ok([...text].length <= 120, 'the section is a one-sentence pointer; the steps live in the reference');
  assert.match(text, /^\s*人接受了/, 'the pointer opens with the condition for reading it');
  const ref = join(dir, 'references', 'design-change.md');
  assert.ok(existsSync(ref), 'references/design-change.md is missing');
  const doc = readFileSync(ref, 'utf8');
  assert.match(doc, /idea-loop:design-change-sync/);
  assert.match(doc, /PR 分支/);
  assert.doesNotMatch(body, /idea-loop:design-change-sync/, 'the steps are written once, in the reference');
});

test('no no-op or negated framing from the old text is left', () => {
  assert.doesNotMatch(body, /不装自动触发的 hook/);
  assert.doesNotMatch(body, /不审代码、不改代码/);
});

test('前提 merges the latest base branch in before the CI line; merge.md points at it', () => {
  const text = section('前提');
  const mergeAt = text.search(/合入最新主分支/);
  const ciAt = text.search(/CI 全绿/);
  assert.ok(mergeAt >= 0, '前提 has no 合入最新主分支 line');
  assert.ok(mergeAt < ciAt, 'the merge-in line must come before the CI line');
  assert.match(text, /merge 进 PR 分支，不 rebase/);
  assert.match(text, /重新生成、不手拼/);
  assert.match(text, /推送/);
  assert.match(text, /idea-loop:decision-rules/);
  const merge = readRef('PR_REVIEW_MERGE_REF', 'skills', 'engineering', 'pr-review', 'references', 'merge.md');
  const step1 = merge.slice(merge.indexOf('## 合并\n'), merge.indexOf('\n2. '));
  assert.match(step1, /先合入最新主分支/, 'merge.md 合并 step 1 does not cite the 前提 line');
});

test('the round cap is written once: reviewer definition, report template and the other references do not repeat it', () => {
  const reviewer = readRef('PR_REVIEWER_DEF', 'agents', 'pr-reviewer.md');
  const template = readRef('PR_REVIEW_REPORT_REF', 'skills', 'engineering', 'pr', 'references', 'review-report.md');
  assert.doesNotMatch(reviewer, /跑满两轮|已跑满/, 'the reviewer cannot know whether the loop stops after this round');
  assert.doesNotMatch(template, /跑满两轮|已跑满/, 'the report template must not carry the stop sentence');
  for (const f of ['design-change.md', 'merge.md', 'seo-auto-merge.md']) {
    const doc = readFileSync(join(dir, 'references', f), 'utf8');
    assert.doesNotMatch(doc, /两轮|第 2 轮之后/, `${f} still mentions the two-round cap`);
  }
  assert.doesNotMatch(body, /两轮/);
});

test('merge.md opening summary does not contradict step 1: no CI wait unless the main branch was merged in', () => {
  const merge = readRef('PR_REVIEW_MERGE_REF', 'skills', 'engineering', 'pr-review', 'references', 'merge.md');
  const intro = merge.slice(0, merge.indexOf('## 合并\n'));
  assert.match(intro, /除非第 1 步合入了新的主分支，也不再等 CI/);
  assert.doesNotMatch(intro, /合并时不再做「删工单」，也不再等 CI/, 'the unconditional no-CI-wait sentence is back');
});

test('the round-cap number lives only in pr-review SKILL.md: night-mode, merge and seo-auto-merge say it without a number', () => {
  const night = readRef('NIGHT_MODE_REF', 'skills', 'engineering', 'issue-session', 'references', 'night-mode.md');
  const merge = readRef('PR_REVIEW_MERGE_REF', 'skills', 'engineering', 'pr-review', 'references', 'merge.md');
  const seo = readRef('SEO_AUTO_MERGE_REF', 'skills', 'engineering', 'pr-review', 'references', 'seo-auto-merge.md');
  for (const [name, doc] of [['night-mode.md', night], ['merge.md', merge], ['seo-auto-merge.md', seo]]) {
    assert.doesNotMatch(doc, /[5五]\s*轮/, `${name} repeats the round-cap number`);
  }
});
