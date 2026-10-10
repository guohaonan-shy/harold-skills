import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSection, setSection } from './pr-body.mjs';

test('sections come out in the fixed order whatever order they were written in', () => {
  let body = '';
  body = setSection(body, 'review', 'R1');
  body = setSection(body, 'header', 'H');
  body = setSection(body, 'ledger', 'L');
  const order = ['header', 'review', 'ledger'].map((n) => body.indexOf(`section ${n} -->`));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('rewriting one section leaves the others untouched', () => {
  let body = setSection(setSection('', 'ledger', 'L1'), 'review', 'R1');
  body = setSection(body, 'review', 'R2');
  assert.equal(getSection(body, 'ledger'), 'L1');
  assert.equal(getSection(body, 'review'), 'R2');
  assert.equal(body.match(/section review -->/g).length, 2); // one open, one close
});

test('text outside the markers survives, below the sections', () => {
  const body = setSection('人写的说明\n\n🤖 Generated with Claude Code', 'header', 'H');
  assert.match(body, /人写的说明/);
  assert.ok(body.indexOf('人写的说明') > body.indexOf('section header'));
});

test('empty content removes a section', () => {
  const body = setSection(setSection('', 'review', '第 1 轮'), 'review', '');
  assert.equal(getSection(body, 'review'), null);
});

test('an unknown section is an error, not a silently ignored write', () => {
  assert.throws(() => setSection('', 'delivery', 'x'), /unknown section/);
});

test('a body over the GitHub limit is refused before it is sent', () => {
  assert.throws(() => setSection('', 'ledger', 'x'.repeat(70000)), /limit/);
});
