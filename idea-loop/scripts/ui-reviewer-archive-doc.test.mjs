/**
 * Tripwire — the archive-mode section of the UI reviewer's definition points at another
 * capability by name plus section title, never by a file path into its references.
 *
 * writing-for-agents: "不写文件路径：目录一挪路径就断，名字不变". The archive step reuses the long-page
 * sections method that lives under design-archive; a path like `references/sections.md` breaks the day
 * that folder moves, while "idea-loop:design-archive 的「长页面的分段」" does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(pluginRoot, 'agents', 'ui-reviewer.md'), 'utf8');

function section(title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `ui-reviewer.md has no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).map((l, i) => ({ n: start + 2 + i, text: l }));
}

test('archive mode does not point at a references/ file path', () => {
  const hits = section('归档模式')
    .filter(({ text }) => /references\/[\w.-]+\.md/.test(text))
    .map(({ n, text }) => `ui-reviewer.md:${n}  ${text.trim().slice(0, 100)}`);
  assert.deepEqual(hits, [], `archive mode names a file path; point at the capability and section title instead:\n${hits.join('\n')}`);
});

test('archive mode still names the long-page sections method it relies on', () => {
  const text = section('归档模式').map((l) => l.text).join('\n');
  assert.match(text, /idea-loop:design-archive[^\n]*「长页面的分段」/);
  assert.match(text, /idea-loop:design-archive[^\n]*「拍图：分段脚本」/);
});
