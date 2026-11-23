/**
 * Tripwire — the archive-mode section of the UI reviewer's definition points at another
 * capability by name plus section title, never by a file path into its references.
 *
 * writing-for-agents: "不写文件路径：目录一挪路径就断，名字不变". The archive step reuses the
 * screenshot method that lives under design-archive; a path like `references/shooting.md` breaks the day
 * that folder moves, while "idea-loop:design-archive 的「拍档案截图」" does not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(pluginRoot, 'agents', 'ui-reviewer.md'), 'utf8');
// The archive mode's body lives in design-archive's review-archive reference (#246).
const archiveDoc = readFileSync(join(pluginRoot, 'skills', 'design', 'design-archive', 'references', 'review-archive.md'), 'utf8');

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

test('archive mode points at its body in design-archive by name and section', () => {
  const text = section('归档模式').map((l) => l.text).join('\n');
  assert.match(text, /idea-loop:design-archive[^\n]*「UI 审查的归档模式」/);
});

test('archive mode still names the screenshot method it relies on', () => {
  const text = archiveDoc;
  assert.match(text, /idea-loop:design-archive[^\n]*「拍档案截图」/);
  assert.match(text, /idea-loop:design-archive[^\n]*「长页面的入口状态」/);
});

test('walkthrough mode points at its body in design-archive by name and section, and keeps the shape of the findings out of the definition', () => {
  const text = section('每轮走查模式').map((l) => l.text).join('\n');
  assert.match(text, /idea-loop:design-archive[^\n]*「UI 审查的每轮走查模式」/);
  assert.doesNotMatch(text, /design-archive\/references\//, 'a section title, not a path into the references');
  assert.doesNotMatch(doc, /"coverage"/);
});

test('the shared steps send a need without a frozen canvas to its own branch by name and section', () => {
  const text = section('共用的步骤').map((l) => l.text).join('\n');
  assert.match(text, /idea-loop:design-archive[^\n]*「UI 审查：没有冻结画布的需求」/);
});
