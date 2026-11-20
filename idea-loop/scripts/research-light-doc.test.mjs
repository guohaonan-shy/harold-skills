/**
 * Tripwire for the two researcher branches (full-page research and the light use each design round):
 * the skill and the agent both say which branch does what, the light branch is started by the session
 * without the human's approval, and the examples in the light-return reference are files the checker accepts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDyna } from './dyna-test-bin.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const SKILL = read('skills/design/uiux-research/SKILL.md');
const AGENT = read('agents/uiux-researcher.md');
const LIGHT = read('skills/design/uiux-research/references/light-return.md');

const body = (md) => md.split(/^---$/m).slice(2).join('---');

test('the skill body stays under the 4500-character line', () => {
  assert.ok([...body(SKILL)].length < 4500, `${[...body(SKILL)].length} characters`);
});

test('the skill names both branches, says the light one starts every round without the human, and keeps full-page research on the human', () => {
  assert.match(SKILL, /## 整页调研/);
  assert.match(SKILL, /## 轻用法/);
  assert.match(SKILL, /每一轮自动起，不用人批/);
  assert.match(SKILL, /整页调研仍只在人说要查时才起/);
  assert.match(SKILL, /designer 和评委不调研/);
  assert.match(SKILL, /references\/light-return\.md/);
});

test('the researcher definition has a section per branch and reads the light-return reference by its full path', () => {
  assert.match(AGENT, /^## 整页调研$/m);
  assert.match(AGENT, /^## 轻用法$/m);
  assert.ok(AGENT.includes('${CLAUDE_PLUGIN_ROOT}/skills/design/uiux-research/references/light-return.md'));
  assert.match(AGENT, /dyna research submit --light/);
  assert.match(LIGHT, /dyna research submit --light <落图目录>\/research-light\.json --opinions=/);
});

test('the light-return reference keeps its format apart from the full-page contract and says what the file must hold', () => {
  for (const word of ['saw', 'did', 'then', 'reading', 'intent', 'overturns', 'uncovered', '这一轮没有参考图：Mobbin 没连上']) {
    assert.ok(LIGHT.includes(word), word);
  }
  assert.ok(!read('skills/design/uiux-research/references/research-backend.md').includes('"overturns"'), 'the format lives in light-return.md only');
});

test('both JSON examples in the reference are files the light checker accepts', () => {
  const blocks = [...LIGHT.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
  assert.equal(blocks.length, 2);
  for (const [i, block] of blocks.entries()) {
    const dir = mkdtempSync(join(tmpdir(), `research-light-${i}-`));
    mkdirSync(join(dir, 'shots'));
    for (const item of block.items) for (const step of item.path) for (const img of step.images) writeFileSync(join(dir, img), 'jpg');
    writeFileSync(join(dir, 'research-light.json'), JSON.stringify(block));
    const r = runDyna(['research', 'submit', '--light', join(dir, 'research-light.json'), '--opinions=1,2,3', '--ledger=1.1,1.2']);
    assert.equal(r.status, 0, `example ${i + 1}: ${r.stdout}${r.stderr}`);
  }
});
