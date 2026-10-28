/**
 * Tripwire — issue-session stops before implementation and asks the human to compact the context.
 *
 * Spec implementer-reuse-and-compact, 「进实现前压缩上下文」. The behaviour lives in skill text, so these
 * checks pin the steps a reader has to be able to follow: in 「实现」 the session cuts the tickets
 * (to-ticket), then stops with a notification and a filled-in /compact instruction (next step / keep /
 * drop), waits for the human to say 「继续」, and only then calls implement; tickets that already exist
 * are not cut again (so re-typing /idea-loop:issue-session lands in the right place); the README's
 * issue-session row mentions the stop; and the SKILL.md body stays under 5000 characters.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const skill = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const readme = read('README.md');
const impl = section(skill, '实现');

test('「实现」 stops between to-ticket and implement and asks the human to compact', () => {
  const ticket = impl.indexOf('idea-loop:to-ticket');
  const compact = impl.indexOf('/compact');
  const implement = impl.indexOf('idea-loop:implement');
  assert.ok(ticket >= 0, '「实现」 no longer calls idea-loop:to-ticket');
  assert.ok(compact >= 0, '「实现」 has no /compact instruction to hand the human');
  assert.ok(implement >= 0, '「实现」 no longer calls idea-loop:implement');
  assert.ok(ticket < compact && compact < implement, '「实现」 must go to-ticket → /compact stop → implement');
  assert.match(impl, /PushNotification/, '「实现」 must notify the human with PushNotification before stopping');
  assert.match(impl, /继续/, '「实现」 must ask the human to say 「继续」 after compacting');
});

test('the /compact template has the next step, what to keep and what to drop, with placeholders to fill', () => {
  const tpl = impl.split('\n').map((l) => l.trim()).find((l) => l.startsWith('/compact'));
  assert.ok(tpl, '「实现」 has no line starting with /compact (the template)');
  for (const part of ['下一步', '保留', '丢掉']) assert.ok(tpl.includes(part), `template lacks 「${part}」`);
  for (const ph of ['<号>', '<slug>', '<绝对路径>']) assert.ok(tpl.includes(ph), `template lacks the placeholder ${ph}`);
  assert.ok(tpl.includes('idea-loop:implement <slug>'), 'template must name the next step: idea-loop:implement <slug>');
  assert.ok(tpl.includes('换阶段'), 'template must keep the pointer to 「换阶段」 for after the PR merges');
  assert.ok(tpl.includes('原话'), 'template must keep undecided human decisions verbatim');
});

test('tickets that already exist are not cut again', () => {
  assert.match(impl, /tickets\/.*(已有|已经有)|(已有|已经有).*tickets\//s, '「实现」 must say tickets/ already holding tickets means skip cutting');
  assert.match(impl, /跳过切票|不再切|不用再切/, '「实现」 must say to skip to-ticket when the tickets exist');
});

test('the README row for issue-session mentions the compact stop', () => {
  const row = readme.split('\n').find((l) => l.startsWith('| `idea-loop:issue-session`'));
  assert.ok(row, 'README has no issue-session row in the Skills table');
  assert.ok(row.includes('/compact'), 'the issue-session row must mention the /compact stop before implementation');
});

test('issue-session SKILL.md body is under 5000 characters', () => {
  const m = skill.match(/^---\n[\s\S]*?\n---\n/);
  const n = [...(m ? skill.slice(m[0].length) : skill)].length;
  assert.ok(n < 5000, `SKILL.md body is ${n} characters; the limit is 5000`);
});
