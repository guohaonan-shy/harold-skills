import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCanvas } from './design-lint-hook.mjs';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'design-lint-hook.mjs');
const root = mkdtempSync(join(tmpdir(), 'design-lint-hook-'));

// A hard-ban (gradient text) so the hook has something to block on.
const DIRTY = '<!doctype html><style>h1{background-clip:text}</style><h1>x</h1>';
const CLEAN = '<!doctype html><style>h1{color:#222}</style><h1>x</h1>';

function put(rel, html) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return file;
}

function runHook(file) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_input: { file_path: file } }),
    encoding: 'utf8',
  });
}

test('the canvas of a requirement is watched', () => {
  assert.equal(isCanvas('/repo/docs/design/tmp/cookbook-redesign/canvas/cookbook-redesign.html'), true);
  assert.equal(isCanvas('/repo/docs/design/tmp/cookbook-redesign/canvas/cookbook-redesign-motion.html'), true);
  assert.equal(isCanvas('docs/design/tmp/x/canvas/x.htm'), true);
});

test('only HTML directly inside canvas/ counts', () => {
  assert.equal(isCanvas('/repo/docs/design/tmp/x/canvas/assets/capture.html'), false, 'assets/ holds captures');
  assert.equal(isCanvas('/repo/docs/design/tmp/x/imagine/board.html'), false, 'imagine/ is throwaway');
  assert.equal(isCanvas('/repo/docs/design/tmp/x/delta/pages/p/p.html'), false);
  assert.equal(isCanvas('/repo/docs/design/tmp/x/canvas/x.md'), false);
});

test('the old per-spec home and the archive are no longer canvases', () => {
  assert.equal(isCanvas('/repo/docs/design/cookbook-redesign/cookbook-redesign.html'), false);
  assert.equal(isCanvas('/repo/docs/design/prod/pages/cookbook/index.html'), false);
});

test('the legacy scratch dirs stay recognized', () => {
  assert.equal(isCanvas('/repo/design-preview/home.html'), true);
  assert.equal(isCanvas('/repo/design-motion-preview/home.html'), true);
});

test('missing path and non-string input are not canvases', () => {
  assert.equal(isCanvas(''), false);
  assert.equal(isCanvas(undefined), false);
});

test('a hard ban written into a canvas blocks with exit 2 and names the file', () => {
  const file = put('docs/design/tmp/demo/canvas/demo.html', DIRTY);
  const res = runHook(file);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /design-lint on /);
  assert.match(res.stderr, /gradient-text/);
});

test('a clean canvas stays silent', () => {
  const res = runHook(put('docs/design/tmp/demo/canvas/clean.html', CLEAN));
  assert.equal(res.status, 0);
  assert.equal(res.stderr, '');
});

test('the same dirty HTML outside canvas/ is ignored', () => {
  for (const rel of [
    'docs/design/tmp/demo/imagine/board.html',
    'docs/design/tmp/demo/canvas/assets/capture.html',
    'docs/design/demo/demo.html',
  ]) {
    const res = runHook(put(rel, DIRTY));
    assert.equal(res.status, 0, rel);
    assert.equal(res.stderr, '', rel);
  }
});

test('a legacy preview dir is still linted', () => {
  assert.equal(runHook(put('design-preview/home.html', DIRTY)).status, 2);
});

test('a path that does not exist, or a payload that is not JSON, is silent', () => {
  assert.equal(runHook(join(root, 'docs/design/tmp/demo/canvas/gone.html')).status, 0);
  const res = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });
  assert.equal(res.status, 0);
});
