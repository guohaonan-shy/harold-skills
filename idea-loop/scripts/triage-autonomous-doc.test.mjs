/**
 * Tripwire — the weekly triage flips states on the triager's suggestion and never waits for the human.
 *
 * Spec dreaming-triage-autonomous, ticket 03. Before: issue-triage laid the results out as one table, pushed
 * 「N 个 issue 等你批」 and stopped until the human approved row by row; a rejected request was written into the
 * `out-of-scope` list from that step. What stays: no step waits for approval, canceled has four sources and an
 * unsure request goes to triage, a push happens in two cases only (an issue left in backlog asking for more, a
 * suspected P0), `全部` runs batch after batch, and the `out-of-scope` record is written where the human
 * decides not to do it (issue-session's draft-spec), with only a pointer left in issue-triage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');

const triage = body(read('skills', 'engineering', 'issue-triage', 'SKILL.md'));
const draftSpec = read('skills', 'engineering', 'issue-session', 'references', 'draft-spec.md');
const issues = body(read('skills', 'engineering', 'issues', 'SKILL.md'));
const setup = body(read('skills', 'engineering', 'setup', 'SKILL.md'));
const weeklyTriage = read('skills', 'engineering', 'setup', 'references', 'weekly-triage.md');

test('issue-triage waits for no one: no table, no approval step', () => {
  for (const k of ['等人批', '人逐行', '逐行批', '一张表', '批完一张', '人批了之后', '人说不批']) {
    assert.ok(!triage.includes(k), `issue-triage still says「${k}」`);
  }
});

test('issue-triage says how each of the four routes is carried out', () => {
  assert.match(triage, /issues set <docs> todo <号>/);
  assert.match(triage, /issues set <docs> triage <号>/);
  assert.match(triage, /issues priority <docs> <P1 或 P2> <号>/);
  assert.match(triage, /issues set <docs> canceled <号> --comment=<理由>/);
  assert.match(triage, /留在 backlog[^\n]*什么都不做/);
});

test('issue-triage does not reject requests for the human: unsure goes to triage', () => {
  assert.match(triage, /重复[\s\S]{0,40}不做[\s\S]{0,40}已实现[\s\S]{0,40}复现不出/);
  assert.match(triage, /拿不准值不值得做的翻 triage，不 canceled/);
});

test('issue-triage pushes in two cases only and names the issues; a suspected P0 is flipped to P1', () => {
  assert.match(triage, /还要你补/);
  assert.match(triage, /疑似 P0/);
  assert.match(triage, /点名/);
  assert.match(triage, /都没有[，,]?不推送/);
  assert.match(triage, /P0 由人改/);
});

test('issue-triage runs 全部 batch after batch, and completes when every row follows its suggested route', () => {
  assert.match(triage, /一批接一批/);
  assert.match(triage, /完成条件：这一批每一行都按建议去向处理了/);
});

test('the out-of-scope record is written in draft-spec where the human decides not to do it', () => {
  const line = draftSpec.split('\n').find((l) => l.startsWith('- 人决定不做'));
  assert.ok(line, 'draft-spec has no 「人决定不做」 bullet');
  for (const k of ['docs/records/out-of-scope/<slug>.md', 'type: record', '追加', '只改 `docs/` 的 PR']) {
    assert.ok(line.includes(k), `「人决定不做」 does not say「${k}」`);
  }
  assert.ok(triage.includes('docs/records/out-of-scope/<slug>.md'), 'issue-triage keeps the pointer to the record path');
  assert.ok(!/type: record/.test(triage), 'issue-triage no longer holds how the record is written');
});

test('issues and setup no longer say the human decides after triage', () => {
  const row = issues.split('\n').find((l) => /^\|\s*backlog\s*\|\s*triage \/ todo \/ canceled/.test(l));
  assert.ok(row, 'issues has no backlog → triage / todo / canceled row');
  assert.ok(!/分拣后人定/.test(row), 'the row still says the human decides after triage');
  assert.ok(!/等人批/.test(setup), 'setup 每周分拣 still says the table waits for the human');
  assert.ok(!/逐行批|批完一张/.test(weeklyTriage), 'weekly-triage.md still tells the human to approve row by row');
});
