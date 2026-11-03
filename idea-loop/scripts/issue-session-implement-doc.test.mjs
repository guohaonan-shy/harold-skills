/**
 * Tripwire — issue-session 「实现」 has no compact stop; it cuts tickets (skipping when they exist) and calls implement.
 *
 * Spec implementer-reuse-and-compact, ticket 03. History: the ticket first added a stop between to-ticket and
 * implement (PushNotification + a filled-in /compact instruction, wait for 「继续」); the human then decided to
 * drop it (spec 「进实现前压缩上下文」 was dropped, #153; implementation runs in the issue session itself, issue-consolidation ticket 05). What stays:
 * tickets already under the spec's tickets/ are not cut again (so re-typing /idea-loop:issue-session lands in
 * the right place), 「实现」 calls to-ticket → implement → pr-review as 「用 Skill 工具调 <插件>:<名字>」, and the
 * SKILL.md body stays under 5000 characters.
 *
 * Who commits the tickets: to-ticket's 「落盘」 does, after the human nods, the tickets are all written and
 * the spec is flipped to 实现中 (the executors' worktrees are cut from the current branch, so uncommitted
 * tickets are invisible to them); issue-session's 「实现」 only calls to-ticket and writes no commit of its own.
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

test('「实现」 has no compact stop: no /compact, no PushNotification, no wait for 「继续」', () => {
  assert.ok(!/\/compact/.test(impl), '「实现」 must not hand the human a /compact instruction');
  assert.ok(!/PushNotification/.test(impl), '「实现」 must not notify the human before implement');
  assert.ok(!/继续/.test(impl), '「实现」 must not wait for the human to say 「继续」');
  assert.ok(!/压缩/.test(skill), 'issue-session must not mention a compaction stop anywhere');
  const ticket = impl.indexOf('idea-loop:to-ticket');
  const implement = impl.indexOf('idea-loop:implement');
  assert.ok(ticket >= 0 && implement > ticket, '「实现」 must go to-ticket → implement');
});

test('tickets that already exist are not cut again', () => {
  assert.match(impl, /tickets\/.*(已有|已经有)|(已有|已经有).*tickets\//s, '「实现」 must say tickets/ already holding tickets means skip cutting');
  assert.match(impl, /跳过切票|不再切|不用再切/, '「实现」 must say to skip to-ticket when the tickets exist');
});

test('to-ticket 落盘 commits the tickets and the 实现中 flip to the current branch', () => {
  const ticketSkill = read('skills', 'engineering', 'to-ticket', 'SKILL.md');
  // the ticket template inside 「落盘」 has its own "## …" headings, so cut at 「下一环」, not at the next "## "
  const from = ticketSkill.indexOf('\n## 落盘');
  const to = ticketSkill.indexOf('\n## 下一环');
  assert.ok(from >= 0 && to > from, 'to-ticket has no 「落盘」 … 「下一环」 span');
  const save = ticketSkill.slice(from, to);
  const flip = save.indexOf('实现中');
  assert.ok(flip >= 0, '「落盘」 no longer flips the spec to 实现中');
  const after = save.slice(flip);
  assert.match(after, /提交/, '「落盘」 must commit the tickets and the spec change after flipping to 实现中');
  assert.match(after, /当前分支/, '「落盘」 must say the commit goes onto the current branch');
  assert.match(after, /worktree/, '「落盘」 must say why: the executors\' worktrees are cut from the current branch');
});

test('issue-session 「实现」 step 1 only calls to-ticket and does not commit the tickets itself', () => {
  const step1 = impl.split('\n').find((l) => l.includes('idea-loop:to-ticket'));
  assert.ok(step1, '「实现」 has no line calling idea-loop:to-ticket');
  assert.ok(!/提交/.test(step1), '「实现」 step 1 must not commit the tickets itself; to-ticket 「落盘」 does it');
});

test('「实现」 step 2 invokes implement and pr-review as 「用 Skill 工具调 <插件>:<名字>」', () => {
  // writing-for-agents: to make an agent use another skill on the spot, write 「用 Skill 工具调 <插件>:<名字>」.
  const step3 = impl.split('\n').find((l) => /^2\.\s/.test(l.trim()));
  assert.ok(step3, '「实现」 has no step 2 (the do step)');
  assert.match(step3, /用 Skill 工具调 `idea-loop:implement`/, 'step 2 must start implement with 「用 Skill 工具调 `idea-loop:implement`」');
  assert.match(step3, /用 Skill 工具调 `idea-loop:pr-review`/, 'step 2 must hand over to review with 「用 Skill 工具调 `idea-loop:pr-review`」');
});

test('the README row for issue-session does not mention a compact stop', () => {
  const row = readme.split('\n').find((l) => l.startsWith('| `idea-loop:issue-session`'));
  assert.ok(row, 'README has no issue-session row in the Skills table');
  assert.ok(!row.includes('/compact'), 'the issue-session row must not mention a /compact stop');
  assert.match(row, /already cut are not cut again/, 'the row must keep saying tickets already cut are not cut again');
});

test('the README row for to-ticket mentions the commit', () => {
  const row = readme.split('\n').find((l) => l.startsWith('| `/idea-loop:to-ticket`'));
  assert.ok(row, 'README has no to-ticket row in the Skills table');
  assert.match(row, /commit/i, 'the to-ticket row must say it commits the tickets onto the current branch');
});

test('issue-session SKILL.md body is under 5000 characters', () => {
  const m = skill.match(/^---\n[\s\S]*?\n---\n/);
  const n = [...(m ? skill.slice(m[0].length) : skill)].length;
  assert.ok(n < 5000, `SKILL.md body is ${n} characters; the limit is 5000`);
});
