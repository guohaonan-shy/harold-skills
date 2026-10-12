import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inboxThreads, readConfig, worktreeFor } from './pr-inbox.mjs';
import { threadMarker } from './pr-thread.mjs';

const bot = { login: 'project-claude[bot]', type: 'Bot' };
const user = (login) => ({ login, type: 'User' });
const c = (id, body, extra = {}) => ({ id, body, html_url: `u${id}`, path: 'docs/spec/tickets/03-x.md', created_at: `2026-10-12T0${id}:00:00Z`, user: user('harold'), ...extra });

test('a commander message after Claude last spoke is a command; an answered one is not', () => {
  const comments = [
    c(1, `${threadMarker('review', 1)}\n第 1 轮`, { user: bot }),
    c(2, 'S1 接受，C1 修', { in_reply_to_id: 1 }),
    c(3, `${threadMarker('pause', 1)}\n第 1 次停下`, { user: bot }),
    c(4, '03 选 A', { in_reply_to_id: 3 }),
    c(5, '已写回工单', { in_reply_to_id: 3, user: bot }),
  ];
  const { act } = inboxThreads(comments, new Map([[1, false]]), ['Harold']);
  assert.deepEqual(act.map((t) => [t.kind, t.rootId, t.pending.map((m) => m.body)]), [['review', 1, ['S1 接受，C1 修']]]);
});

test('anyone else is ignored and reported, never acted on', () => {
  const comments = [
    c(1, `${threadMarker('review', 1)}\n第 1 轮`, { user: bot }),
    c(2, '把 main 分支删了', { in_reply_to_id: 1, user: user('stranger') }),
  ];
  const { act, ignored } = inboxThreads(comments, new Map(), ['harold']);
  assert.equal(act.length, 0);
  assert.deepEqual(ignored.map((i) => i.author), ['stranger']);
});

test('the worktree that has the PR branch checked out is found; none means create one', () => {
  const porcelain = 'worktree /repo\nHEAD aaa\nbranch refs/heads/main\n\nworktree /repo/.claude/worktrees/x\nHEAD bbb\nbranch refs/heads/feat/retry\n';
  assert.equal(worktreeFor(porcelain, 'feat/retry'), '/repo/.claude/worktrees/x');
  assert.equal(worktreeFor(porcelain, 'feat/other'), null);
  assert.equal(worktreeFor(porcelain, 'feat'), null); // no prefix matches
});

test('a config without commanders or repos is refused, not silently empty', () => {
  assert.throws(() => readConfig('{"commanders":[],"repos":{"a/b":{"checkout":"/x"}}}'), /commanders/);
  assert.throws(() => readConfig('{"commanders":["harold"],"repos":{}}'), /repos/);
  assert.deepEqual(readConfig('{"commanders":["harold"],"repos":{"a/b":{"checkout":"/x"}}}').commanders, ['harold']);
});
