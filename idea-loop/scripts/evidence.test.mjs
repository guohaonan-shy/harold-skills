import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAssets, releaseTag, MAX_BYTES } from './evidence.mjs';

const ok = (path, size = 1000) => ({ path, size });

test('one release per PR, named so a sweep can find it', () => {
  assert.equal(releaseTag(42), 'idea-loop-evidence-pr-42');
});

test('ticket and review-round files with owner prefixes are valid', () => {
  assert.deepEqual(checkAssets([ok('/x/t03-flow-sentence-failed.png'), ok('t03-dwell.gif'), ok('r2-spec-1-quota.png')]), { valid: true, errors: [] });
});

test('a file without an owner prefix is rejected — assets are flat and would overwrite each other', () => {
  const r = checkAssets([ok('flow.png')]);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /归属/);
});

test('only images are accepted', () => {
  assert.equal(checkAssets([ok('t01-trace.zip')]).valid, false);
  assert.equal(checkAssets([ok('t01-shot.PNG'.toLowerCase())]).valid, true);
});

test('names GitHub would rewrite are rejected', () => {
  assert.equal(checkAssets([ok('t01-下载失败.png')]).valid, false);
  assert.equal(checkAssets([ok('t01-Flow One.png')]).valid, false);
});

test('duplicates, empty and oversized files are each reported', () => {
  const r = checkAssets([ok('t01-a.png'), ok('/other/t01-a.png'), ok('t01-b.gif', 0), ok('t01-c.gif', MAX_BYTES + 1)]);
  assert.equal(r.valid, false);
  assert.equal(r.errors.length, 3);
});

test('nothing to upload is an error, not a silent success', () => {
  assert.equal(checkAssets([]).valid, false);
});
