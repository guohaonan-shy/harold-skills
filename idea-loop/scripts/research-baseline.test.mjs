/**
 * Guard for the uiux-research baseline (idea-loop/evals/uiux-research/).
 *
 * The baseline is a set of default prompts taken from real design sessions, a minimal product context,
 * and one file per case where the human writes down what is wrong with the page the researcher produced.
 * Nothing here judges the content of a page; this only keeps the baseline itself well-formed, so a case
 * cannot silently lose its prompt, its comparison line or its annotation file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCases, buildPrompt, digestStream } from '../evals/uiux-research/run.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'evals', 'uiux-research');

test('there are six cases, each with a prompt that starts the skill and a comparison line', () => {
  const cases = loadCases(root);
  assert.equal(cases.length, 6);
  const names = new Set();
  for (const c of cases) {
    assert.match(c.name, /^[a-z]+(-[a-z]+){0,3}$/, `case name ${c.name}`);
    assert.ok(!names.has(c.name), `duplicate case ${c.name}`);
    names.add(c.name);
    assert.ok(c.prompt.startsWith('/idea-loop:uiux-research '), `${c.name}: prompt must call the skill`);
    assert.ok(c.last_time.length > 10, `${c.name}: missing comparison line`);
  }
});

test('each case has an annotation file that quotes its comparison line', () => {
  for (const c of loadCases(root)) {
    const file = join(root, 'cases', c.name, 'annotations.md');
    assert.ok(existsSync(file), `${c.name}: annotations.md missing`);
    assert.ok(readFileSync(file, 'utf8').includes(c.last_time), `${c.name}: annotations.md must quote last_time verbatim`);
  }
});

test('the minimal product context is present', () => {
  for (const f of ['DESIGN.md', 'PRODUCT.md']) assert.ok(existsSync(join(root, 'project', f)), f);
});

test('the unattended prompt keeps the human words and adds only the no-questions suffix', () => {
  const c = loadCases(root)[0];
  const p = buildPrompt(c);
  assert.ok(p.startsWith(c.prompt));
  assert.match(p, /无人值守/);
});

test('digestStream separates the calling session from sub-agents and counts Refero calls', () => {
  const lines = [
    { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'a', name: 'Agent', input: {} }] } },
    { type: 'assistant', parent_tool_use_id: 'a', message: { content: [{ type: 'tool_use', id: 'b', name: 'mcp__refero__refero_search_screens', input: {} }] } },
    { type: 'assistant', parent_tool_use_id: 'a', message: { content: [{ type: 'tool_use', id: 'c', name: 'Bash', input: {} }] } },
    { type: 'result', result: 'done', total_cost_usd: 1.5, num_turns: 3, duration_ms: 10, modelUsage: { 'claude-opus': {} } },
  ].map((o) => JSON.stringify(o)).join('\n');
  const d = digestStream(lines);
  assert.equal(d.session.referoCalls, 0);
  assert.equal(d.subagents.referoCalls, 1);
  assert.deepEqual(d.session.tools, { Agent: 1 });
  assert.equal(d.result.cost, 1.5);
  assert.deepEqual(d.result.models, ['claude-opus']);
});
