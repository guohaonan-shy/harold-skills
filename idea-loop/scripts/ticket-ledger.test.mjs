import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLog, ticketOf } from './ticket-ledger.mjs';

test('ticketOf: Ticket line in the same paragraph as the attribution', () => {
  const msg = 'feat: a thing\n\nbody\n\nTicket: 01-pr-review-rule-dispositions\nCo-Authored-By: Claude <noreply@anthropic.com>\n';
  assert.equal(ticketOf(msg), '01-pr-review-rule-dispositions');
});

test('ticketOf: attribution appended as its own paragraph after a blank line still counts', () => {
  const msg = 'fix: a thing\n\nbody\n\nTicket: 03-implement-pause-rules\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n';
  assert.equal(ticketOf(msg), '03-implement-pause-rules');
});

test('ticketOf: no Ticket line, a wip commit, or the word inside prose → null', () => {
  assert.equal(ticketOf('wip(02): stopped at the API test\n'), null);
  assert.equal(ticketOf('docs: mention the Ticket: 01-x line in prose\n'), null);
  assert.equal(ticketOf('docs(tickets): 01 — review 第 1 轮 S2\n'), null);
  assert.equal(ticketOf(''), null);
});

test('parseLog: keeps commits that name a ticket, in order, with their sha', () => {
  const raw = [
    'aaa111\x1ffeat: one\n\nTicket: 01-alpha\nCo-Authored-By: X\n\x1e',
    '\nbbb222\x1fdocs(tickets): 01 — review\n\nCo-Authored-By: X\n\x1e',
    '\nccc333\x1ffix: two\n\nTicket: 02-beta\n\nCo-Authored-By: X\n\x1e',
  ].join('');
  assert.deepEqual(parseLog(raw), [
    { sha: 'aaa111', ticket: '01-alpha' },
    { sha: 'ccc333', ticket: '02-beta' },
  ]);
});

test('parseLog: empty log → empty list', () => {
  assert.deepEqual(parseLog(''), []);
});
