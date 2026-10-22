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
 *   session-digest.mjs locate [--dir D] [--marker TEXT]       the transcript file of this session
 *
 * `locate` takes the newest file that contains the marker (a resumed session is a new file that carries the
 * old history, so the newest one is the longest). Without a marker it takes the newest file only when no other
 * file was written close to it. Exit 2 when it cannot name exactly one file: the caller falls back to
 * export_transcript.
 *
 * Deterministic core (digest, renderDigest, pickSession, projectDirName) is pure and unit-tested; the file and
 * command-line parts are at the bottom.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const AI_MAX_DEFAULT = 1500;
const PARALLEL_WINDOW_MS = 10 * 60 * 1000;

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
    if (r.type !== 'user' || r.isMeta || r.isCompactSummary) continue;
    const text = humanText(r.message?.content);
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
 * entries: [{ path, mtimeMs, hasMarker }]; withMarker: whether a marker was asked for.
 * -> { ok: true, path } | { ok: false, reason: 'none' | 'ambiguous', candidates }
 */
export function pickSession(entries, withMarker) {
  const pool = withMarker ? entries.filter((e) => e.hasMarker) : entries;
  if (!pool.length) return { ok: false, reason: 'none', candidates: [] };
  const sorted = [...pool].sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (withMarker) return { ok: true, path: sorted[0].path };
  const close = sorted.filter((e) => sorted[0].mtimeMs - e.mtimeMs <= PARALLEL_WINDOW_MS);
  if (close.length > 1) return { ok: false, reason: 'ambiguous', candidates: close.map((e) => e.path) };
  return { ok: true, path: sorted[0].path };
}

export const projectDirName = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');

// ---------- io / command line ----------

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function locate(args) {
  const dir = option(args, '--dir') ?? join(homedir(), '.claude', 'projects', projectDirName(process.cwd()));
  const marker = option(args, '--marker');
  if (!existsSync(dir)) return { ok: false, reason: 'none', candidates: [], dir };
  const entries = readdirSync(dir)
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => {
      const path = join(dir, n);
      return { path, mtimeMs: statSync(path).mtimeMs, hasMarker: marker ? readFileSync(path, 'utf8').includes(marker) : true };
    });
  return { ...pickSession(entries, Boolean(marker)), dir };
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'digest' && args[0] && existsSync(args[0])) {
    const aiMax = option(args, '--ai-max');
    const result = digest(parseJsonl(readFileSync(args[0], 'utf8')), aiMax ? { aiMax: Number(aiMax) } : {});
    return console.log(renderDigest(result));
  }
  if (cmd === 'locate') {
    const found = locate(args);
    if (found.ok) return console.log(found.path);
    const why = found.reason === 'none' ? `no transcript in ${found.dir} holds the marker` : `several transcripts in ${found.dir} were written at about the same time: ${found.candidates.join(', ')}`;
    console.error(`${why}; fall back to export_transcript`);
    process.exitCode = 2;
    return;
  }
  throw new Error('usage: session-digest.mjs digest <file.jsonl> [--ai-max N] | locate [--dir D] [--marker TEXT]');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
