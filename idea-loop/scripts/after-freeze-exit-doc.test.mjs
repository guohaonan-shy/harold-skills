/**
 * Tripwire — what the session says after a design freeze depends on the kind of session, and every pointer it gives exists.
 *
 * Spec refine-judge-advisor, ticket 07. History: after refine froze and committed, the line told an issue session to
 * "move on to the implementation stage" (a section of issue-session that does not exist) and listed "call to-ticket
 * yourself" as an option; a triage session followed it and cut ten tickets while the issue stayed in triage. What stays:
 * after-freeze.md splits the line by session type (triage → issue-session's 「交给调度」, todo → 「实现」, outside an issue
 * session → the human decides), no skill points at a section that issue-session lacks, and to-ticket stops when it is
 * called inside an issue session whose issue is still in triage (it does not check when the human calls it directly).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const afterFreeze = read('skills', 'design', 'uiux-refine', 'references', 'after-freeze.md');
const issueSession = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const toTicket = read('skills', 'engineering', 'to-ticket', 'SKILL.md');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(md|mjs|json)$/.test(name)) yield p;
  }
}

test('after-freeze.md splits what it tells the human by session type, each pointing at a real issue-session place', () => {
  const told = afterFreeze.slice(afterFreeze.indexOf('告诉人：设计已冻结'), afterFreeze.indexOf('## 三种情形'));
  assert.match(told, /triage 会话[\s\S]*交给调度[\s\S]*不切工单/, 'triage session → 「交给调度」, no tickets');
  assert.match(told, /todo 会话[\s\S]*「实现」[\s\S]*draft PR[\s\S]*再切工单/, 'todo session → 「实现」, draft PR before tickets');
  assert.match(told, /不在 issue 会话里[\s\S]*由人定/, 'outside an issue session the human decides');
  assert.ok(/^## 实现$/m.test(issueSession), 'issue-session has the section 「实现」');
  assert.ok(/^## triage 会话$/m.test(issueSession), 'issue-session has the section 「triage 会话」');
  assert.ok(/\*\*交给调度\*\*/.test(issueSession), 'issue-session names its step 「交给调度」');
});

test('after-freeze.md no longer offers "call to-ticket yourself"', () => {
  assert.ok(!/自己调\s*`?idea-loop:to-ticket/.test(afterFreeze));
  assert.ok(!/to-ticket/.test(afterFreeze.slice(0, afterFreeze.indexOf('## 三种情形'))), 'the after-freeze line does not hand the human to-ticket');
});

test('nothing in the plugin points at the issue-session section 「换阶段」, which does not exist', () => {
  assert.ok(!/^## .*换阶段/m.test(issueSession));
  for (const f of [...walk(join(pluginRoot, 'skills')), ...walk(join(pluginRoot, 'agents'))]) {
    assert.ok(!read(f.slice(pluginRoot.length + 1)).includes('换阶段'), `${f} mentions 「换阶段」`);
  }
});

test('to-ticket stops in an issue session whose issue is still in triage, and does not check when called directly', () => {
  assert.match(toTicket, /在 issue 会话里[\s\S]{0,120}issue-session[\s\S]{0,200}issues show/);
  assert.match(toTicket, /还在 triage 就停下，指回 `idea-loop:issue-session` 的「triage 会话」第 3 步「交给调度」/);
  assert.match(toTicket, /不看 label/);
  assert.match(toTicket, /人直接调本 skill、不在 issue 会话里时，不核状态/);
});
