/**
 * Tripwire — implement 「账本」: after a session break, executor worktrees that are already done land first.
 *
 * Spec implement-resume-landed, ticket 01. When the orchestrator re-enters and `git worktree list` shows an
 * executor worktree that pending does not record, it must first check whether the branch already holds one
 * finished commit for a ticket (a `Ticket:` line, one commit ahead of the integration branch, all acceptance
 * boxes ticked or deferred): such a worktree counts as a returned `landed` and goes through 「核对与落地」.
 * Only worktrees that are not like that are reclaimed (「回收」) and re-dispatched. Reclaiming first deletes the
 * finished commit with `git branch -D` and the whole ticket is redone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = readFileSync(join(pluginRoot, 'skills', 'engineering', 'implement', 'SKILL.md'), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

// 「账本」 keeps a pointer; the 会话断了 sentence itself lives in implement's reference for the start of a run
const ledger = section(skill, '账本');
const startOfRun = readFileSync(join(pluginRoot, 'skills', 'engineering', 'implement', 'references', 'start-of-run.md'), 'utf8');
// the sentence runs from 「会话断了：」 to the end of its line
const at = startOfRun.indexOf('会话断了：');
const resume = at < 0 ? '' : startOfRun.slice(at).split('\n')[0];

test('「账本」 has a 「会话断了：」 sentence', () => {
  assert.ok(at >= 0, 'the reference has no 「会话断了：」 sentence');
  assert.match(ledger, /会话断了：读 \[references\/start-of-run\.md\]/, '「账本」 does not point at it');
});

test('the 会话断了 sentence sends finished worktrees through 「核对与落地」 before any 「回收」', () => {
  assert.match(resume, /就当它交回了 `landed`/, 'must say a finished worktree counts as a returned `landed`');
  const land = resume.indexOf('照「核对与落地」落地');
  const reclaim = resume.indexOf('照「回收」');
  assert.ok(land >= 0, 'must send the finished worktree through 「核对与落地」');
  assert.ok(reclaim >= 0, 'must still reclaim the worktrees that are not finished');
  assert.ok(land < reclaim, '「核对与落地」 must come before 「回收」: finished ones land first, reclaim is only for the rest');
});

test('the 会话断了 sentence names the three marks of a finished worktree', () => {
  assert.match(resume, /带这张工单 `Ticket:` 的提交/, 'must name the `Ticket:` commit');
  assert.match(resume, /比集成分支只多这一个/, 'must name 「one commit ahead of the integration branch」');
  assert.match(resume, /工单格全勾或带 `⏭ 延后`/, 'must name 「boxes ticked or deferred」');
});

test('reclaiming is only for the ones that are not finished, and the old blanket reclaim is gone', () => {
  assert.match(resume, /不是这样的，才照「回收」收掉后重派/, 'reclaim-and-redispatch must be limited to worktrees that are not finished');
  assert.ok(
    !/pending 没记着的执行方 worktree 照「回收」收掉后重派/.test(skill + startOfRun),
    'the old rule (reclaim every worktree pending does not record) must not appear',
  );
});

test('the sentence still ends by recomputing the dispatchable tickets', () => {
  assert.match(resume, /然后重算可派的工单/, 'must recompute the dispatchable tickets afterwards');
});
