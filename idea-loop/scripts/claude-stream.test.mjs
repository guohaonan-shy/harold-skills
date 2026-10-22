/**
 * The shared reader for `claude -p --output-format stream-json` event streams.
 * Both eval runners (uiux-research, retro) read what a headless run did from this one place.
 * Samples are made up; the shapes follow what Claude Code 2.1.x really emits.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestStream, fileLines, detectEscalation, escalationOfEvent } from './claude-stream.mjs';

const toolUse = (name, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id: `id-${name}`, name, input: {} }] } });
const stream = (...events) => events.map((e) => JSON.stringify(e)).join('\n');

test('digestStream separates the calling session from sub-agents and counts Refero calls', () => {
  const d = digestStream(stream(
    toolUse('Agent'),
    toolUse('mcp__refero__refero_search_screens', 'a'),
    toolUse('Bash', 'a'),
    { type: 'result', result: 'done', total_cost_usd: 1.5, num_turns: 3, duration_ms: 10, modelUsage: { 'claude-opus': {} } },
  ));
  assert.equal(d.session.referoCalls, 0);
  assert.equal(d.subagents.referoCalls, 1);
  assert.deepEqual(d.session.tools, { Agent: 1 });
  assert.deepEqual(d.subagents.tools, { mcp__refero__refero_search_screens: 1, Bash: 1 });
  assert.deepEqual(d.result, { text: 'done', cost: 1.5, turns: 3, durationMs: 10, isError: false, models: ['claude-opus'] });
});

test('digestStream skips a last line cut off by a timeout, and blank lines', () => {
  const text = `${stream(toolUse('Read'))}\n\n{"type":"assistant","message":{"content":[{"type":"tool_u`;
  assert.deepEqual(digestStream(text).session.tools, { Read: 1 });
  assert.equal(digestStream(text).result, null);
});

test('digestStream takes any iterable of lines, not only text', () => {
  const d = digestStream([JSON.stringify(toolUse('Read')), JSON.stringify(toolUse('Read'))]);
  assert.deepEqual(d.session.tools, { Read: 2 });
});

test('fileLines yields a file line by line, including a last line with no newline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-stream-'));
  const f = join(dir, 's.jsonl');
  writeFileSync(f, `${JSON.stringify(toolUse('Read'))}\n${JSON.stringify(toolUse('Edit'))}`);
  const lines = [...fileLines(f)];
  assert.equal(lines.length, 2);
  assert.deepEqual(digestStream(lines).session.tools, { Read: 1, Edit: 1 });
});

test('detectEscalation reports nothing for a run that only reads and writes files', () => {
  assert.equal(detectEscalation(stream(toolUse('Read'), toolUse('Bash'), toolUse('Skill'))), null);
});

test('detectEscalation reports the first agent the session started', () => {
  const e = detectEscalation(stream(toolUse('Read'), toolUse('Agent'), toolUse('mcp__playwright__browser_navigate')));
  assert.deepEqual(e, { kind: 'agent', tool: 'Agent' });
});

test('detectEscalation reports a browser, whichever browser tool family opened it', () => {
  for (const name of ['mcp__playwright__browser_navigate', 'mcp__Claude_Browser__navigate', 'mcp__claude-in-chrome__navigate', 'mcp__plugin_idea-loop_playwright__browser_snapshot']) {
    assert.deepEqual(detectEscalation(stream(toolUse(name))), { kind: 'browser', tool: name }, name);
  }
});

test('a tool that merely has "agent" or "browser" in its name is not an escalation', () => {
  assert.equal(detectEscalation(stream(toolUse('Bash'), toolUse('mcp__refero__refero_search_screens'), toolUse('mcp__x__reagent_check'))), null);
});

test('escalationOfEvent reads one event, so a runner can stop a run mid-stream', () => {
  assert.equal(escalationOfEvent(toolUse('Read')), null);
  assert.deepEqual(escalationOfEvent(toolUse('Task')), { kind: 'agent', tool: 'Task' });
  assert.equal(escalationOfEvent({ type: 'result', result: 'x' }), null);
});
