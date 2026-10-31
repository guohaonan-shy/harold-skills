/**
 * Tripwire — when the issue is about a document an agent reads, to-spec diagnoses the document and lists
 * its callers before it drafts the 方案, and every change in the 方案 names the writing-for-agents lever.
 *
 * Spec writing-for-agents-pruning-layers, ticket 02 (issue #154). Before: step 3 of to-spec only said to
 * probe the code; #125's first spec ("just move it into references") was drafted with no diagnosis and no
 * caller list, and was rewritten twice after the human asked what writing-for-agents found and who
 * references the skill.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = readFileSync(join(pluginRoot, 'skills', 'engineering', 'to-spec', 'SKILL.md'), 'utf8');

/** Step 3 of 过程: from its bold title to the start of step 4. */
const step3 = skill.match(/^3\. \*\*探代码并谈 seam\*\*[\s\S]*?(?=^4\. \*\*)/m)?.[0] ?? '';

test('step 3 is found', () => {
  assert.ok(step3.length > 0, '找不到第 3 步「探代码并谈 seam」');
});

test('step 3 says: for an agent-facing document, call writing-for-agents with the Skill tool and diagnose against its levers', () => {
  assert.match(step3, /给 agent 读的文档/);
  assert.match(step3, /用 Skill 工具调 `idea-loop:writing-for-agents`/);
  assert.match(step3, /诊断/);
  assert.match(step3, /杠杆/);
});

test('step 3 says: list who calls the document and which parts each reads', () => {
  assert.match(step3, /谁在调它/);
  assert.match(step3, /各读哪几块/);
});

test('step 3 says: the 方案 follows from the diagnosis and the caller list, each change names its lever', () => {
  assert.match(step3, /「方案」从这两样推出/);
  assert.match(step3, /每处改动标明对的是哪条杠杆/);
});
