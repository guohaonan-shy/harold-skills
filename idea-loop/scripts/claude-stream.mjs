/**
 * Reading a `claude -p --output-format stream-json --verbose` event stream.
 *
 * The two eval runners (`evals/uiux-research/run.mjs`, `evals/retro/retro-replay.mjs`) both start headless
 * Claude Code sessions and need to know afterwards (or while it runs) what the session did: which tools it
 * called, whether a sub-agent or a browser got involved, what it cost. That reading lives here once.
 *
 * Every event carries `parent_tool_use_id`: null is the calling session, anything else is a sub-agent.
 */

import { closeSync, openSync, readSync } from 'node:fs';

/** The tool a session uses to start a sub-agent (`Task` is its older name). */
const AGENT_TOOLS = new Set(['Agent', 'Task']);
/** Browser tools are MCP tools from a playwright / browser / chrome server. */
const BROWSER_TOOL = /^mcp__.*(playwright|browser|chrome)/i;

export function parseEvent(line) {
  if (!line || !line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null; // last line cut off by a timeout
  }
}

/**
 * Condense an event stream into facts about who did what.
 * Accepts the stream as text, or any iterable of lines.
 */
export function digestStream(input) {
  const lines = typeof input === 'string' ? input.split('\n') : input;
  const bucket = () => ({ tools: {}, referoCalls: 0 });
  const session = bucket();
  const subagents = bucket();
  let result = null;
  for (const raw of lines) {
    const ev = parseEvent(raw);
    if (!ev) continue;
    if (ev.type === 'result') {
      result = {
        text: String(ev.result ?? ''),
        cost: ev.total_cost_usd ?? null,
        turns: ev.num_turns ?? null,
        durationMs: ev.duration_ms ?? null,
        isError: ev.is_error ?? false,
        models: Object.keys(ev.modelUsage ?? {}),
      };
      continue;
    }
    if (ev.type !== 'assistant') continue;
    const b = ev.parent_tool_use_id ? subagents : session;
    for (const block of ev.message?.content ?? []) {
      if (block?.type !== 'tool_use') continue;
      b.tools[block.name] = (b.tools[block.name] ?? 0) + 1;
      if (/^mcp__.*refero/i.test(block.name)) b.referoCalls += 1;
    }
  }
  return { session, subagents, result };
}

/**
 * Does this one event start a plugin agent or open a browser?
 * Returns `{ kind: 'agent' | 'browser', tool }` for the first such tool call in it, else null.
 */
export function escalationOfEvent(ev) {
  if (!ev || ev.type !== 'assistant') return null;
  for (const block of ev.message?.content ?? []) {
    if (block?.type !== 'tool_use') continue;
    if (AGENT_TOOLS.has(block.name)) return { kind: 'agent', tool: block.name };
    if (BROWSER_TOOL.test(block.name)) return { kind: 'browser', tool: block.name };
  }
  return null;
}

/** The first escalation in a whole stream (text or iterable of lines), or null. */
export function detectEscalation(input) {
  const lines = typeof input === 'string' ? input.split('\n') : input;
  for (const raw of lines) {
    const hit = escalationOfEvent(parseEvent(raw));
    if (hit) return hit;
  }
  return null;
}

/** Read a possibly huge stream file line by line, without holding it in memory. */
export function* fileLines(path) {
  const fd = openSync(path, 'r');
  const chunk = Buffer.alloc(1 << 20);
  let pending = Buffer.alloc(0);
  try {
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, null);
      if (n === 0) break;
      pending = Buffer.concat([pending, chunk.subarray(0, n)]);
      let nl;
      while ((nl = pending.indexOf(10)) >= 0) {
        yield pending.subarray(0, nl).toString('utf8');
        pending = pending.subarray(nl + 1);
      }
    }
    if (pending.length) yield pending.toString('utf8');
  } finally {
    closeSync(fd);
  }
}
