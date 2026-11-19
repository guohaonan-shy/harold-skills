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
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadCases, buildPrompt } from '../evals/uiux-research/run.mjs';
import { dynaBinary } from './dyna-test-bin.mjs';

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

// The old digestStream test (the calling session apart from sub-agents, Refero calls counted) moved to the command line's own tests
// (dyna/internal/claudestream). What is left to check here is that the runner starts the session through `dyna agent claude run`
// and writes what the command read into the facts file the human reads: the same sample stream, through the real command.
const FAKE_CLAUDE = `#!/usr/bin/env node
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const use = (id, name, parent) => out({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id, name, input: {} }] } });
use('a', 'Agent', null);
use('b', 'mcp__refero__refero_search_screens', 'a');
use('c', 'Bash', 'a');
out({ type: 'result', result: 'done', total_cost_usd: 1.5, num_turns: 3, duration_ms: 10, modelUsage: { 'claude-opus': {} } });
`;

test('the runner starts the session through dyna and writes what the session did into digest.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uiux-baseline-'));
  const fake = join(dir, 'fake-claude');
  writeFileSync(fake, FAKE_CLAUDE);
  chmodSync(fake, 0o755);
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [join(root, 'run.mjs'), '--only', 'leave-confirm', '--out', out, '--timeout-min', '1'], {
    encoding: 'utf8',
    env: { ...process.env, IDEA_LOOP_DYNA_BIN: dynaBinary(), UIUX_RESEARCH_CLAUDE_BIN: fake },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const facts = JSON.parse(readFileSync(join(out, 'leave-confirm', 'digest.json'), 'utf8'));
  assert.equal(facts.exitCode, 0);
  assert.equal(facts.timedOut, false);
  assert.equal(facts.callingSessionReferoCalls, 0);
  assert.equal(facts.researcherReferoCalls, 1);
  assert.deepEqual(facts.callingSessionTools, { Agent: 1 });
  assert.deepEqual(facts.subagentTools, { mcp__refero__refero_search_screens: 1, Bash: 1 });
  assert.deepEqual(facts.run, { cost: 1.5, turns: 3, models: ['claude-opus'], isError: false });
  assert.equal(readFileSync(join(out, 'leave-confirm', 'result.txt'), 'utf8'), 'done');
  assert.ok(existsSync(join(out, 'leave-confirm', 'run.stream.jsonl')), 'the raw stream is kept');
});
