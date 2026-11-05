import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintHtml } from './design-lint.mjs';

test('does not flag the retired project-specific brand floors', () => {
  const html = `
    <style>
      .card { border: 1px solid #0a0a0a; background: #FFFDF4; }
    </style>
    <h1 style="font-family: 'Instrument Serif', serif;">Instrument Serif headline</h1>
  `;
  const ids = lintHtml(html).map((f) => f.id);
  assert.equal(ids.includes('retired-ink'), false);
  assert.equal(ids.includes('warm-action-tint'), false);
  assert.equal(ids.includes('instrument-serif'), false);
});

test('still flags generic AI-slop signals', () => {
  const html = `
    <style>
      .headline { background-clip: text; -webkit-background-clip: text; }
    </style>
    <button class="btn bg-indigo-500">🚀 Launch it</button>
  `;
  const ids = lintHtml(html).map((f) => f.id);
  assert.ok(ids.includes('gradient-text'));
  assert.ok(ids.includes('ai-purple-indigo'));
  assert.ok(ids.includes('emoji-icon'));
});
