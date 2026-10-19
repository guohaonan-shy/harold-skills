/**
 * 会话记录 —— 把 `claude -p --output-format stream-json --verbose` 吐出的事件流压成断言读得动的一份摘要。
 *
 * 为什么需要它：有几条契约说的是「**调用会话自己**做了什么、没做什么」（会话只编排、不写变种板、
 * 不截图、不调 Refero），也有几条说的是「子代理交回了什么」。这些在跑完的项目目录里看不出来——
 * 目录里只有产物，没有谁动的手。事件流里每条消息带 `parent_tool_use_id`：null 是调用会话自己，
 * 非 null 是某个子代理（`isSidechain: true` 是同一件事的另一种写法，两个都认）。
 *
 * 摘要只留断言要用的东西：
 *   - tool_use     名字 + 入参（超长字符串截断，Write 的整份 HTML 不必全留）
 *   - tool_result  回给调用方的文字（图片块丢掉；这是子代理的「交回」落到会话里的样子）
 *   - text         助手说的话
 * 流本身可能几百兆（截图是 base64），所以按字节分块读行，不整份读进内存。
 *
 * 纯函数加两个读文件的壳；没有模型、没有时钟。
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_INPUT_STRING = 200_000;
const MAX_RESULT_TEXT = 40_000;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…[+${s.length - n} 字]` : s);

/** 递归截断入参里的长字符串。 */
function clipDeep(v, n = MAX_INPUT_STRING) {
  if (typeof v === 'string') return clip(v, n);
  if (Array.isArray(v)) return v.map((x) => clipDeep(x, n));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clipDeep(x, n)]));
  return v;
}

/** 逐行读一个可能很大的文件。 */
function* lines(path) {
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

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('\n');
};

/**
 * 把事件流压成摘要。
 *
 * @returns {{ events: Array, result: object|null }}
 *   events[i]：{ seq, sub, kind: 'tool_use'|'tool_result'|'text', id?, name?, input?, toolUseId?, text? }
 *   result：流里最后那条 `type: result` 事件（没有就是 null——超时被砍断的跑没有它）
 */
export function digestStream(streamPath) {
  const events = [];
  let result = null;
  let seq = 0;
  for (const raw of lines(streamPath)) {
    if (!raw.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue; // 被墙钟砍断的最后一行
    }
    if (ev.type === 'result') {
      result = ev;
      continue;
    }
    if (ev.type !== 'assistant' && ev.type !== 'user') continue;
    const sub = Boolean(ev.parent_tool_use_id) || ev.isSidechain === true;
    const content = ev.message?.content;
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
    for (const b of blocks) {
      if (b.type === 'tool_use') events.push({ seq: seq++, sub, kind: 'tool_use', id: b.id, name: b.name, input: clipDeep(b.input ?? {}) });
      else if (b.type === 'tool_result') events.push({ seq: seq++, sub, kind: 'tool_result', toolUseId: b.tool_use_id, text: clip(textOf(b.content), MAX_RESULT_TEXT) });
      else if (b.type === 'text' && ev.type === 'assistant') events.push({ seq: seq++, sub, kind: 'text', text: clip(b.text ?? '', MAX_RESULT_TEXT) });
    }
  }
  return { events, result };
}

/**
 * 读一格的会话摘要：有 `session.json` 就用它，没有就从 `run.stream.jsonl` 现压一份并存下。
 * 两个都没有（旧版 runner 跑的存档只留了 run.stdout.json）返回 null——断言会据此明说「没有会话记录」。
 */
export function loadSession(runDir) {
  const digest = join(runDir, 'session.json');
  if (existsSync(digest)) return JSON.parse(readFileSync(digest, 'utf8'));
  const stream = join(runDir, 'run.stream.jsonl');
  if (!existsSync(stream)) return null;
  const s = digestStream(stream);
  writeFileSync(digest, JSON.stringify(s));
  return s;
}
