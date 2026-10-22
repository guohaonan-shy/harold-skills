import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, parseJsonl, pickSession, projectDirName, renderDigest } from './session-digest.mjs';

// All samples are made up. The record shapes (type / subtype / isMeta / isCompactSummary / message.content blocks)
// follow what Claude Code writes to ~/.claude/projects/<project>/<session>.jsonl.
const human = (text, extra = {}) => ({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: text }, ...extra });
const ai = (blocks, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', model: 'm', content: blocks }, ...extra });
const say = (text) => ai([{ type: 'text', text }]);
const call = (id, name = 'Bash') => ai([{ type: 'tool_use', id, name, input: { command: 'SECRET-TOOL-INPUT' } }]);
const result = (id, text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] } });
const boundary = { type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', compactMetadata: { trigger: 'auto', preTokens: 123456 } };
const summary = { type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued ... SUMMARY-TEXT' } };

const session = [
  human('第一句：先看看登录页'),
  say('我先去读代码。'),
  call('t1'),
  result('t1', 'TOOL-OUTPUT-ONE'),
  say('登录页有两处问题：A 和 B。要先修哪个？'),
  human('先修 B，别动 A'),
  call('t2'),
  result('t2', 'TOOL-OUTPUT-TWO'),
  boundary,
  summary,
  say('B 修好了，A 没动。'),
  human('A 为什么不用修？你没讲清楚'),
];

test('keeps every human utterance from before and after a compaction marker', () => {
  const { turns } = digest(session);
  assert.deepEqual(turns.map((t) => t.human), ['第一句：先看看登录页', '先修 B，别动 A', 'A 为什么不用修？你没讲清楚']);
});

test('drops tool calls, tool outputs and the compaction summary', () => {
  const text = renderDigest(digest(session));
  for (const leaked of ['SECRET-TOOL-INPUT', 'TOOL-OUTPUT-ONE', 'TOOL-OUTPUT-TWO', 'SUMMARY-TEXT', 'Conversation compacted']) {
    assert.ok(!text.includes(leaked), `leaked: ${leaked}`);
  }
});

test('each human utterance carries the conclusion of the AI reply before it, not its working notes', () => {
  const { turns } = digest(session);
  assert.equal(turns[0].ai, '');
  assert.equal(turns[1].ai, '登录页有两处问题：A 和 B。要先修哪个？');
  assert.equal(turns[2].ai, 'B 修好了，A 没动。');
});

test('when a reply ends on a tool call the last thing it said is the conclusion', () => {
  const { turns } = digest([human('go'), say('我会先改 X，再跑测试。'), call('t1'), result('t1', 'ok'), human('好')]);
  assert.equal(turns[1].ai, '我会先改 X，再跑测试。');
});

test('long conclusions keep their tail, where the question to the human usually sits', () => {
  const long = `${'前文。'.repeat(200)}最后问你：选 A 还是 B？`;
  const { turns } = digest([say(long), human('A')], { aiMax: 40 });
  assert.ok(turns[0].ai.endsWith('最后问你：选 A 还是 B？'));
  assert.ok(turns[0].ai.length < 80);
  assert.match(turns[0].ai, /前略/);
});

test('slash commands become "/name args"; system-originated user records are not human', () => {
  const records = [
    human('<command-message>idea-loop:issue-session</command-message>\n<command-name>/idea-loop:issue-session</command-name>\n<command-args>51</command-args>'),
    human('<task-notification>\n<task-id>x</task-id>\n</task-notification>'),
    human('<local-command-stdout>hi</local-command-stdout>'),
    human('<bash-input>ls</bash-input><bash-stdout>x</bash-stdout>'),
    human('skill body injected by the harness', { isMeta: true }),
    human('sidechain chatter', { isSidechain: true }),
    human('<system-reminder>\nnoise\n</system-reminder>真正的话'),
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '带图的话' }, { type: 'image', source: {} }] } },
  ];
  assert.deepEqual(digest(records).turns.map((t) => t.human), ['/idea-loop:issue-session 51', '真正的话', '带图的话\n[图片]']);
});

test('the compaction itself is noted in order, so the reader knows where context was lost', () => {
  const { events, compactions } = digest(session);
  assert.equal(compactions, 1);
  assert.deepEqual(events.map((e) => e.kind), ['turn', 'turn', 'compact', 'turn']);
  assert.match(renderDigest(digest(session)), /压缩/);
});

test('parseJsonl skips blank and broken lines', () => {
  const text = `${JSON.stringify(human('a'))}\n\n{not json\n${JSON.stringify(human('b'))}\n`;
  assert.equal(parseJsonl(text).length, 2);
});

test('rendered digest lists utterances numbered, with the AI conclusion quoted above each', () => {
  const text = renderDigest(digest(session));
  assert.match(text, /## 2 /);
  assert.match(text, /> 登录页有两处问题：A 和 B。要先修哪个？\n[\s\S]*人：\n先修 B，别动 A/);
});

// ---------- locating the file ----------

const f = (path, mtimeMs, hasMarker) => ({ path, mtimeMs, hasMarker });

test('with a marker, the newest file that holds it wins (a resumed session is a new file carrying the old history)', () => {
  const r = pickSession([f('old', 1000, true), f('resumed', 5000, true), f('other', 9000, false)], true);
  assert.deepEqual(r, { ok: true, path: 'resumed' });
});

test('with a marker nothing holds, there is no answer', () => {
  assert.deepEqual(pickSession([f('a', 1, false)], true), { ok: false, reason: 'none', candidates: [] });
});

test('without a marker, the newest file wins only if no other file was written around the same time', () => {
  assert.deepEqual(pickSession([f('mine', 10_000_000, true), f('old', 1_000, true)], false), { ok: true, path: 'mine' });
  const r = pickSession([f('mine', 10_000_000, true), f('parallel', 9_900_000, true)], false);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ambiguous');
  assert.deepEqual(r.candidates, ['mine', 'parallel']);
});

test('project directory name is the working directory with every non-alphanumeric turned into a dash', () => {
  assert.equal(projectDirName('/Users/a/proj/.claude/worktrees/x-y'), '-Users-a-proj--claude-worktrees-x-y');
});

// ---------- command line ----------

const SCRIPT = new URL('./session-digest.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('cli: locate then digest, on a directory of session files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-digest-'));
  const write = (name, records, mtime) => {
    writeFileSync(join(dir, name), records.map((r) => JSON.stringify(r)).join('\n'));
    utimesSync(join(dir, name), mtime, mtime);
  };
  write('a.jsonl', [human('opening MARKER-51'), say('收到')], 1_000_000);
  write('b.jsonl', [human('opening MARKER-51'), say('收到'), human('后来的话')], 2_000_000);
  write('c.jsonl', [human('another session')], 3_000_000);

  const located = run('locate', '--dir', dir, '--marker', 'MARKER-51');
  assert.equal(located.status, 0, located.stderr);
  assert.equal(located.stdout.trim(), join(dir, 'b.jsonl'));

  const out = run('digest', join(dir, 'b.jsonl'));
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /后来的话/);

  const missing = run('locate', '--dir', dir, '--marker', 'NOT-THERE');
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /export_transcript/);
});
