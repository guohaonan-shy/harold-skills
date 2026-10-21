import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCompanion } from './codex-companion.mjs';

function plugins(files) {
  const root = join(mkdtempSync(join(tmpdir(), 'companion-')), 'plugins');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  mkdirSync(join(root, 'cache', 'harold-skills', 'idea-loop', '0.0.29'), { recursive: true });
  return root;
}
const start = (root) => join(root, 'cache', 'harold-skills', 'idea-loop', '0.0.29');

test('prefers the highest cached version, then the marketplace copy', () => {
  const root = plugins({
    'cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs': 'case "task":',
    'cache/openai-codex/codex/1.0.10/scripts/codex-companion.mjs': 'case "task":',
    'marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs': 'case "task":',
  });
  assert.match(findCompanion(start(root)).path, /1\.0\.10/);
  const market = plugins({ 'marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs': 'task' });
  assert.match(findCompanion(start(market)).path, /marketplaces/);
});

test('a companion without the task command does not count; nothing found lists what was searched', () => {
  const root = plugins({ 'cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs': 'review only' });
  const r = findCompanion(start(root));
  assert.equal(r.path, null);
  assert.equal(r.searched.length, 2);
  assert.equal(findCompanion(tmpdir()).path, null);
});
