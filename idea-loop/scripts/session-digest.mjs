#!/usr/bin/env node
/**
 * Squeeze one Claude Code session transcript down to the conversation itself, for `retro`.
 *
 * A session transcript (~/.claude/projects/<project>/<session>.jsonl) is megabytes of tool calls and tool
 * output around a few dozen human sentences. The file keeps everything from the first turn on, even after the
 * session was compacted (the compaction writes a `compact_boundary` record and a summary, it does not remove
 * what came before), so it is the one place that still holds the opening turns once the context has lost them.
 *
 * The digest is: every human utterance, each with the conclusion of the AI reply right before it — the text the
 * AI said after its last tool call, i.e. what the human was actually answering. Nothing else: no tool calls, no
 * tool output, no thinking, no compaction summary, no harness-injected messages (task notifications, skill
 * bodies, local command echoes, `!` shell input).
 *
 * Usage:
 *   session-digest.mjs digest <file.jsonl> [--ai-max N]       the digest, as text
 *   session-digest.mjs locate [--session ID] [--marker TEXT] [--dir D]
 *                                                             the transcript file of this session
 *
 * `locate` names this session's own transcript, never "the newest one that looks right". By session id first:
 * `--session ID`, else the CLAUDE_CODE_SESSION_ID Claude Code sets in the environment of the commands a session
 * runs (the value is the file name without `.jsonl`); it looks for `<ID>.jsonl` in every project directory under
 * ~/.claude/projects, wherever the current directory is. With no id, or no such file, it falls back to
 * `--marker`: the files in every project directory whose FIRST human utterance contains the marker (only the head
 * of each file is read, up to that utterance; a marker that only sits in an AI tool call, as in the dispatcher
 * session that wrote a card task, does not count). `--dir D` limits both searches to that one directory.
 * Exactly one file is the answer (printed, exit 0). Zero or several (a resumed session is a second file carrying
 * the old history) exit 2 with the candidates on stderr: the caller falls back to export_transcript.
 *
 * Deterministic core (digest, renderDigest, pickSession) is pure and unit-tested; the file and command-line parts
 * are at the bottom.
 */
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

const AI_MAX_DEFAULT = 1500;

// User-role records that a human did not type.
const NOT_HUMAN_PREFIXES = ['<task-notification>', '<local-command-', '<bash-input>', '<bash-stdout>', '<bash-stderr>', 'Another Claude session sent a message'];

export function parseJsonl(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a half-written last line, or noise: skip
    }
  }
  return out;
}

function humanText(content) {
  const parts = [];
  if (typeof content === 'string') parts.push(content);
  else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
      else if (block?.type === 'image') parts.push('[图片]');
    }
  }
  const cleaned = [];
  for (const part of parts) {
    const text = part.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
    if (!text) continue;
    if (NOT_HUMAN_PREFIXES.some((p) => text.startsWith(p))) continue;
    const name = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
    if (name) {
      const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
      cleaned.push([name[1].trim(), args?.[1].trim()].filter(Boolean).join(' '));
    } else cleaned.push(text);
  }
  return cleaned.join('\n').trim();
}

/** The text a human typed in this record, or '' when the record is not a human utterance. */
function humanUtterance(r) {
  if (!r || r.isSidechain || r.type !== 'user' || r.isMeta || r.isCompactSummary) return '';
  return humanText(r.message?.content);
}

function clip(text, max) {
  if (text.length <= max) return text;
  return `[前略 ${text.length - max} 字] …${text.slice(-max)}`;
}

/**
 * records -> { turns, events, compactions }
 * turn = { index, timestamp, human, ai }; events = turns and compaction markers in file order.
 */
export function digest(records, { aiMax = AI_MAX_DEFAULT } = {}) {
  const events = [];
  const turns = [];
  let compactions = 0;
  let current = []; // text said since the last tool call
  let fallback = ''; // the last thing said before a tool call, for replies that end on one

  const conclusion = () => (current.length ? current.join('\n') : fallback).trim();
  const resetAi = () => {
    current = [];
    fallback = '';
  };

  for (const r of records) {
    if (!r || r.isSidechain) continue;
    if (r.type === 'system' && r.subtype === 'compact_boundary') {
      compactions += 1;
      events.push({ kind: 'compact', trigger: r.compactMetadata?.trigger, preTokens: r.compactMetadata?.preTokens });
      continue;
    }
    if (r.type === 'assistant') {
      if (r.message?.model === '<synthetic>') continue;
      for (const block of r.message?.content ?? []) {
        if (block?.type === 'tool_use') {
          if (current.length) fallback = current.join('\n');
          current = [];
        } else if (block?.type === 'text' && block.text?.trim()) current.push(block.text);
      }
      continue;
    }
    const text = humanUtterance(r);
    if (!text) continue;
    const turn = { index: turns.length + 1, timestamp: r.timestamp, human: text, ai: clip(conclusion(), aiMax) };
    resetAi();
    turns.push(turn);
    events.push({ kind: 'turn', ...turn });
  }
  return { turns, events, compactions };
}

const quote = (text) => text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');

export function renderDigest({ turns, events, compactions }) {
  const lines = [`# 会话摘要：人的发言 ${turns.length} 条，会话压缩过 ${compactions} 次`, ''];
  for (const e of events) {
    if (e.kind === 'compact') {
      lines.push(`--- 此处会话被压缩（${e.trigger ?? '?'}${e.preTokens ? `，压缩前约 ${e.preTokens} token` : ''}）；压缩之前的发言上面都在 ---`, '');
      continue;
    }
    lines.push(`## ${e.index} · ${e.timestamp ?? ''}`.trimEnd(), '');
    if (e.ai) lines.push('上一条 AI 回复的结论：', quote(e.ai), '');
    lines.push('人：', e.human, '');
  }
  return lines.join('\n');
}

/**
 * paths: the files that match. Exactly one is the answer.
 * -> { ok: true, path } | { ok: false, reason: 'none' | 'ambiguous', candidates }
 */
export function pickSession(paths) {
  if (!paths.length) return { ok: false, reason: 'none', candidates: [] };
  if (paths.length > 1) return { ok: false, reason: 'ambiguous', candidates: paths };
  return { ok: true, path: paths[0] };
}

// ---------- io / command line ----------

const READ_CHUNK = 64 * 1024;

/** The first human utterance of a transcript file, reading only as far as it. '' when the file has none. */
export function firstHumanUtterance(path) {
  const fd = openSync(path, 'r');
  const buffer = Buffer.alloc(READ_CHUNK);
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const inLine = (line) => {
    if (!line.trim()) return '';
    try {
      return humanUtterance(JSON.parse(line));
    } catch {
      return ''; // a half-written line, or noise: skip
    }
  };
  try {
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (n === 0) return inLine(pending);
      pending += decoder.write(buffer.subarray(0, n));
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const text = inLine(line);
        if (text) return text;
      }
    }
  } finally {
    closeSync(fd);
  }
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const subdirectories = (root) =>
  existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(root, e.name)) : [];

/** -> { ...pickSession result, looked: what was looked for, where: where it was looked } */
function locate(args, env) {
  const root = join(homedir(), '.claude', 'projects');
  const dirOption = option(args, '--dir');
  const dirs = dirOption ? [dirOption] : subdirectories(root);
  const where = dirOption ?? `${dirs.length} project directories under ${root}`;
  const id = option(args, '--session') ?? env.CLAUDE_CODE_SESSION_ID;
  const marker = option(args, '--marker');
  const looked = [];

  if (id) {
    looked.push(`session id ${id}`);
    const byId = dirs.map((d) => join(d, `${id}.jsonl`)).filter((p) => existsSync(p));
    if (byId.length || !marker) return { ...pickSession(byId), looked, where };
  }
  if (marker) {
    looked.push(`marker "${marker}" in the first human utterance`);
    const byMarker = dirs.flatMap((d) => (existsSync(d) ? readdirSync(d) : []).filter((n) => n.endsWith('.jsonl')).map((n) => join(d, n))).filter((p) => firstHumanUtterance(p).includes(marker));
    return { ...pickSession(byMarker), looked, where };
  }
  return { ok: false, reason: 'none', candidates: [], looked: ['nothing (no session id in CLAUDE_CODE_SESSION_ID or --session, no --marker)'], where };
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'digest' && args[0] && existsSync(args[0])) {
    const aiMax = option(args, '--ai-max');
    const result = digest(parseJsonl(readFileSync(args[0], 'utf8')), aiMax ? { aiMax: Number(aiMax) } : {});
    return console.log(renderDigest(result));
  }
  if (cmd === 'locate') {
    const found = locate(args, process.env);
    if (found.ok) return console.log(found.path);
    const looked = found.looked.join(', then ');
    const why = found.reason === 'none' ? `no transcript found for ${looked} in ${found.where}` : `${found.candidates.length} transcripts match ${looked} in ${found.where}: ${found.candidates.join(', ')}`;
    console.error(`${why}; fall back to export_transcript`);
    process.exitCode = 2;
    return;
  }
  throw new Error('usage: session-digest.mjs digest <file.jsonl> [--ai-max N] | locate [--session ID] [--marker TEXT] [--dir D]');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
