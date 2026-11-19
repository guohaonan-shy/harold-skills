/**
 * Tripwire — the implementer's definition stays slim: the body is capped at 5000 characters (the limit AGENTS.md sets for
 * a SKILL.md body, applied to agent definitions), the opening says what it delivers, and the branches only some tickets
 * take (a rule-changing ticket, a UI ticket and the design archive) live in implement's references behind one pointer each.
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

const BODY_MAX = 5000;
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
  const ruleLine = body.split('\n').find((l) => l.includes('references/rule-tickets.md'));
  assert.ok(ruleLine, 'no pointer to rule-tickets.md');
  assert.match(ruleLine, /改规则的工单/);
  const uiLine = body.split('\n').find((l) => l.includes('references/ui-tickets.md'));
  assert.ok(uiLine, 'no pointer to ui-tickets.md');
  assert.match(uiLine, /UI 工单/);
  assert.doesNotMatch(body, /写一个回放用例|retro-replay\.mjs/, 'the replay steps belong in rule-tickets.md');
  assert.doesNotMatch(body, /design-archive-check\.mjs|design-archive-query\.mjs/, 'the archive commands belong in ui-tickets.md');
});

test('ui-tickets.md carries the design-archive steps that used to be inline', () => {
  const ui = readFileSync(join(refs, 'ui-tickets.md'), 'utf8');
  assert.match(ui, /idea-loop:design-archive/);
  assert.match(ui, /design-archive-check\.mjs" <集成 worktree> --delta <spec-slug> --no-used-by/);
  assert.match(ui, /design-archive-query\.mjs" <集成 worktree> state <状态名> --delta <spec-slug>/);
  assert.match(ui, /delta\/removed\.md/);
  assert.match(ui, /`docs\/design\/prod\/` 只由合并前的归档脚本写/);
  assert.match(ui, /同一批 finding 两轮不变/);
});
