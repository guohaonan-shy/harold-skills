/**
 * Tripwire — pr-review's SKILL.md stays slim: body under 5000 characters (AGENTS.md「SKILL.md 编写约定」),
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
const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');

function section(title) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^#{2,3} /.test(l) && l.replace(/^#+ /, '').startsWith(title));
  assert.ok(start >= 0, `no section "${title}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{2,3} /.test(l));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

test('the body is at most 5000 characters', () => {
  assert.ok([...body].length <= 5000, `body is ${[...body].length} characters`);
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
  assert.match(text, /跑满两轮|不超过 2/);
  assert.match(text, /逐题核过/);
  assert.equal(body.split('逐题核过').length - 1, 1, 'the per-question check is written more than once');
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

test('the design change is a pointer to design-change-sync, not a procedure', () => {
  const text = section('设计变更');
  assert.match(text, /idea-loop:design-change-sync/);
  assert.match(text, /PR 分支/);
  assert.ok([...text].length <= 400, 'the steps live in design-change-sync; keep only how this stage differs');
});

test('no no-op or negated framing from the old text is left', () => {
  assert.doesNotMatch(body, /不装自动触发的 hook/);
  assert.doesNotMatch(body, /不审代码、不改代码/);
});
