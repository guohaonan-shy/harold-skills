/**
 * Tripwire — the implementer's definition stays slim: the body is capped at 4500 characters (the line writing-for-agents sets for
 * a SKILL.md body or an agent definition), the opening says what it delivers, and the branches only some tickets or runs
 * take (a rule-changing ticket, a UI ticket and the design archive, stopping or deferring, picking up a half-done branch) live in
 * implement's references behind one pointer each.
 *
 * Spec implementer-start-point-non-destructive, ticket 02. Before: the body was 11626 characters, the longest agent
 * definition in the plugin, with the rule-ticket proof and the UI / design-archive steps inline. The sentences the other
 * doc tests pin moved with their content; those tests read the new place. IMPLEMENTER_DEF overrides the file under test
 * (to see the checks fail on the old text).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.IMPLEMENTER_DEF || join(pluginRoot, 'agents', 'implementer.md');
const raw = readFileSync(file, 'utf8');
const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
const refs = join(pluginRoot, 'skills', 'engineering', 'implement', 'references');

const BODY_MAX = 4500;
test(`the body does not exceed ${BODY_MAX} characters`, () => {
  assert.ok([...body].length <= BODY_MAX, `body is ${[...body].length} characters`);
});

test('the opening paragraph says what it delivers: one commit that fast-forwards onto the integration branch, and a hand-back', () => {
  const opening = body.trim().split('\n\n')[0];
  assert.match(opening, /commit/);
  assert.match(opening, /快进进集成分支|fast-forward 进集成分支/);
  assert.match(opening, /交回/);
});

test('a rule-changing ticket reads rule-tickets.md, a UI ticket reads ui-tickets.md: one pointer line each', () => {
  assert.ok(existsSync(join(refs, 'rule-tickets.md')), 'references/rule-tickets.md is missing');
  const ruleLine = body.split('\n').find((l) => l.includes('rule-tickets.md'));
  assert.ok(ruleLine, 'no pointer to rule-tickets.md');
  assert.match(ruleLine, /改规则的工单/);
  const uiLine = body.split('\n').find((l) => l.includes('ui-tickets.md'));
  assert.ok(uiLine, 'no pointer to ui-tickets.md');
  assert.match(uiLine, /UI 工单/);
  assert.doesNotMatch(body, /写一个回放用例|retro-replay\.mjs/, 'the replay steps belong in rule-tickets.md');
  assert.doesNotMatch(body, /design-archive-check\.mjs|design-archive-query\.mjs|dyna design archive/, 'the archive commands belong in ui-tickets.md');
});

test('stopping or deferring, and picking up a half-done branch, live in stop-and-defer.md behind pointers; the hand-back template stays in the definition', () => {
  const doc = readFileSync(join(refs, 'stop-and-defer.md'), 'utf8');
  assert.match(doc, /^## 接着做$/m);
  assert.match(doc, /^## 停，还是延后$/m);
  assert.match(doc, /⏭ 延后 → PR 交付验收/, 'the deferral format moved with the section');
  assert.match(doc, /wip\(<NN>\): <停在哪>/, 'the half-done commit format moved with the section');
  assert.match(body, /stop-and-defer\.md[^\n]*「停，还是延后」/, 'no pointer to the stop-or-defer section');
  assert.match(body, /stop-and-defer\.md[^\n]*「接着做」/, 'no pointer to the pick-up section');
  assert.doesNotMatch(body, /^## 停，还是延后/m, 'the section itself must not be back in the definition');
  assert.match(body, /^status: landed \| blocked \| failed$/m, 'the hand-back template stays in the definition');
});

test('ui-tickets.md carries the design-archive steps that used to be inline', () => {
  const ui = readFileSync(join(refs, 'ui-tickets.md'), 'utf8');
  assert.match(ui, /idea-loop:design-archive/);
  assert.match(ui, /dyna design archive check <项目目录> --delta <spec-slug> --no-used-by/);
  assert.match(ui, /dyna design archive query <项目目录> state <状态名> --delta <spec-slug>/);
  assert.match(ui, /delta\/removed\.md/);
  assert.match(ui, /`docs\/design\/prod\/` 只由合并前的归档命令写/);
  assert.match(ui, /同一批 finding 两轮不变/);
});
