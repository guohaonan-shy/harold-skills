import { test } from 'node:test';
import assert from 'node:assert/strict';
import { threadMarker, parseThread, pickAnchor, thread, threads, withAuthorship } from './pr-thread.mjs';

const files = [
  { filename: 'src/player.ts', status: 'modified' },
  { filename: 'docs/spec/tickets/01-cache.md', status: 'modified' },
  { filename: 'docs/spec/tickets/03-player-states.md', status: 'modified' },
  { filename: 'docs/spec/tickets/02-gone.md', status: 'removed' },
];

test('a thread marker round-trips; unknown kinds and plain comments are not threads', () => {
  assert.deepEqual(parseThread(`${threadMarker('review', 2)}\n正文`), { kind: 'review', round: 2 });
  assert.equal(parseThread('<!-- idea-loop-thread {"kind":"note","round":1} -->'), null);
  assert.equal(parseThread('普通评论'), null);
});

test('the anchor is the first preferred file that is in the diff', () => {
  assert.equal(pickAnchor(['docs/spec/tickets/05-not-in-diff.md', 'docs/spec/tickets/03-player-states.md'], files), 'docs/spec/tickets/03-player-states.md');
});

test('with no preferred file in the diff, any ticket file in the diff will do — never a removed one', () => {
  assert.equal(pickAnchor(['docs/spec/tickets/02-gone.md'], files), 'docs/spec/tickets/01-cache.md');
  assert.equal(pickAnchor([], [{ filename: 'src/a.ts', status: 'modified' }]), null);
});

test('without an App, the body says Claude posted it — the bot never passes as the human', () => {
  assert.equal(withAuthorship('汇报', 'app'), '汇报');
  assert.match(withAuthorship('汇报', 'gh-login'), /由 Claude 代发/);
});

const bot = { login: 'project-claude[bot]', type: 'Bot' };
const c = (id, body, extra = {}) => ({ id, body, html_url: `u${id}`, path: 'docs/spec/tickets/03-player-states.md', created_at: `2026-10-10T0${id}:00:00Z`, user: { login: 'harold', type: 'User' }, ...extra });

test('a thread is the root plus its replies in order, with the bot told apart from the human', () => {
  const comments = [
    c(1, `${threadMarker('pause', 1)}\n汇报`, { user: bot }),
    c(3, '已写回工单 03', { in_reply_to_id: 1, user: bot }),
    c(2, '03 选 A', { in_reply_to_id: 1 }),
    c(4, '别的 thread', { in_reply_to_id: 9 }),
  ];
  const t = thread(1, comments);
  assert.equal(t.kind, 'pause');
  assert.deepEqual(t.messages.map((m) => [m.id, m.author]), [[1, 'claude'], [2, 'harold'], [3, 'claude']]);
});

test('threads groups root comments by kind and orders them by round; replies quoting a marker do not count', () => {
  const comments = [
    c(5, `${threadMarker('pause', 2)}\nb`),
    c(1, `${threadMarker('pause', 1)}\na`),
    c(7, `${threadMarker('review', 1)}\nr`),
    c(6, `${threadMarker('pause', 1)} 引用`, { in_reply_to_id: 1 }),
    c(8, '无关'),
  ];
  const t = threads(comments);
  assert.deepEqual(t.pause.map((p) => [p.round, p.rootId]), [[1, 1], [2, 5]]);
  assert.deepEqual(t.review.map((p) => [p.round, p.rootId]), [[1, 7]]);
});
