/**
 * Doc test — when a spec changes a document an agent reads, every change in the lever diagnosis ends with a 「验证：」 line
 * of one of five kinds, the finishing condition says so, and the test-decision table points a skill change at those lines
 * instead of writing 「不涉及」.
 *
 * Spec skill-change-verify, ticket 03. Before: 8 of the 11 specs on the release branch wrote 「不涉及」 for a skill
 * change (home-bootstrap, device-memory, ...), citing the repository's 「跳过 quantitative eval」. It reads the documents and
 * catches a sentence being dropped; whether a drafted spec then carries the lines is what the goal case
 * `to-spec-verify-each-change` asks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'engineering', 'to-spec');
const skill = readFileSync(join(root, 'SKILL.md'), 'utf8');
const branch = readFileSync(join(root, 'references', 'agent-docs.md'), 'utf8');

test('agent-docs.md: each change ends with a 验证 line, five kinds, each says what it writes', () => {
  assert.match(branch, /每处改动末尾一行「验证：」，五选一/);
  const kinds = ['检查', '回放', '目标用例', '不改行为', '判不了'];
  for (const k of kinds) assert.match(branch, new RegExp(`^- \\*\\*${k}\\*\\*：`, 'm'), `no bullet for ${k}`);
  const bullet = (k) => branch.match(new RegExp(`^- \\*\\*${k}\\*\\*：.*$`, 'm'))[0];
  assert.match(bullet('检查'), /先在历史错误上见红/);
  assert.match(bullet('回放'), /历史上出错/);
  assert.match(bullet('目标用例'), /User Story|期望行为/);
  assert.match(bullet('目标用例'), /goal_from/);
  assert.match(bullet('不改行为'), /为什么行为不变/);
  assert.match(bullet('判不了'), /卡在哪/);
});

test('agent-docs.md: the finishing condition asks for a lever and a verification line on every change, and where it is stuck for 判不了', () => {
  const done = branch.split('\n').find((l) => l.startsWith('完成条件'));
  assert.ok(done, 'no 完成条件');
  assert.match(done, /每处改动都带一条杠杆和一行验证/);
  assert.match(done, /判不了的写卡在哪/);
});

test('the test-decision table sends a skill change to the verification lines, not to 「不涉及」', () => {
  const row = skill.split('\n').find((l) => l.startsWith('| LLM 输出质量'));
  assert.ok(row, 'no LLM 输出质量 row');
  assert.match(row, /skill 改动写「见杠杆诊断各处的验证」/);
});

test('agent-docs.md: the spec says it changes agent documents in its frontmatter (`changes_agent_docs: true`) and puts the diagnosis in a section titled 「杠杆诊断」, which `dyna spec check` looks for', () => {
  assert.match(branch, /frontmatter 写 `changes_agent_docs: true`/);
  assert.match(branch, /「杠杆诊断」/);
});

test('AGENTS.md section 5: no longer opens with 「跳过 quantitative eval」; replay and goal case are the acceptance means; the uiux-research exception stays', () => {
  const doc = readFileSync(join(root, '..', '..', '..', '..', 'AGENTS.md'), 'utf8');
  const sec = doc.split(/^### /m).find((s) => s.startsWith('5. Eval 策略'));
  assert.ok(sec, 'no section 5');
  const body = sec.split('\n').slice(1).join('\n').trim();
  assert.doesNotMatch(body.slice(0, 80), /跳过 quantitative eval/);
  assert.match(body, /改 skill 的每处改动都要写明怎么验/);
  assert.match(body, /回放和目标用例是 skill 改动的验收手段/);
  assert.doesNotMatch(body, /第二个有意例外/);
  assert.match(body, /有意例外：`idea-loop` 的 `uiux-research`/);
});
