import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, parseJsonl, pickSession, renderDigest } from './session-digest.mjs';

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

test('exactly one candidate is the answer, however many sessions exist elsewhere', () => {
  assert.deepEqual(pickSession(['mine']), { ok: true, path: 'mine' });
});

test('no candidate: no answer', () => {
  assert.deepEqual(pickSession([]), { ok: false, reason: 'none', candidates: [] });
});

test('several candidates: no answer, and never "the newest" (a resumed session is a second file carrying the old history)', () => {
  assert.deepEqual(pickSession(['old', 'resumed']), { ok: false, reason: 'ambiguous', candidates: ['old', 'resumed'] });
});

// ---------- command line ----------

const SCRIPT = new URL('./session-digest.mjs', import.meta.url).pathname;

// The script reads CLAUDE_CODE_SESSION_ID from its environment; tests set it on purpose or not at all, whatever
// session the tests themselves run in.
const run = (...args) => runIn({ args });
function runIn({ args, home, cwd, sessionId }) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  if (home) env.HOME = home;
  if (sessionId) env.CLAUDE_CODE_SESSION_ID = sessionId;
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env, cwd });
}

test('cli: locate then digest, on a directory of session files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'session-digest-'));
  const write = (name, records, mtime) => {
    writeFileSync(join(dir, name), records.map((r) => JSON.stringify(r)).join('\n'));
    utimesSync(join(dir, name), mtime, mtime);
  };
  write('a.jsonl', [human('an older session'), say('收到')], 1_000_000);
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

// ---------- cli: locating this session's own transcript ----------

const MARKER = 'issue-session，参数 87';
const CARD_TASK = '用 Skill 工具调 idea-loop:issue-session，参数 87，按它从开场做起。';

/** A fake HOME with ~/.claude/projects/<project>/<id>.jsonl files; `put` returns the path it wrote. */
function fakeHome() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'locate-')));
  const home = join(root, 'home');
  const cwd = (name) => {
    const d = join(root, name);
    mkdirSync(d, { recursive: true });
    return d;
  };
  const put = (project, id, records) => {
    const dir = join(home, '.claude', 'projects', project);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${id}.jsonl`);
    writeFileSync(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    return path;
  };
  return { home, cwd, put };
}

// The dispatcher session: the marker is only inside a tool_use input (the card prompt the AI wrote).
const dispatcherRecords = [
  human('/idea-loop:issue-dispatch'),
  ai([{ type: 'tool_use', id: 'x', name: 'start_session', input: { prompt: CARD_TASK } }]),
];

test('cli: after cd-ing to the dispatcher project directory, the marker still finds this session, not the dispatcher', () => {
  const { home, cwd, put } = fakeHome();
  const own = put('-wt', 'self-id', [human(CARD_TASK), say('收到')]);
  put('-main', 'dispatch-id', dispatcherRecords);
  const r = runIn({ args: ['locate', '--marker', MARKER], home, cwd: cwd('main') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), own);
});

test('cli: the session id comes first, from the environment or --session, wherever the current directory is', () => {
  const { home, cwd, put } = fakeHome();
  const own = put('-wt', 'self-id', [human(CARD_TASK)]);
  put('-main', 'dispatch-id', dispatcherRecords);
  const fromEnv = runIn({ args: ['locate'], home, cwd: cwd('main'), sessionId: 'self-id' });
  assert.equal(fromEnv.status, 0, fromEnv.stderr);
  assert.equal(fromEnv.stdout.trim(), own);
  const explicit = runIn({ args: ['locate', '--session', 'self-id'], home, cwd: cwd('main') });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(explicit.stdout.trim(), own);
});

test('cli: the id wins over a marker that points at another file', () => {
  const { home, put } = fakeHome();
  const own = put('-wt', 'self-id', [human('something else entirely')]);
  put('-other', 'other-id', [human(CARD_TASK)]);
  const r = runIn({ args: ['locate', '--marker', MARKER], home, sessionId: 'self-id' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), own);
});

test('cli: an id with no file falls back to the marker', () => {
  const { home, put } = fakeHome();
  const own = put('-wt', 'self-id', [human(CARD_TASK)]);
  const r = runIn({ args: ['locate', '--marker', MARKER], home, sessionId: 'gone-id' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), own);
});

test('cli: the same id in two project directories is not an answer', () => {
  const { home, put } = fakeHome();
  const a = put('-one', 'dup-id', [human('x')]);
  const b = put('-two', 'dup-id', [human('x')]);
  const r = runIn({ args: ['locate'], home, sessionId: 'dup-id' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /dup-id/);
  assert.ok(r.stderr.includes(a) && r.stderr.includes(b), r.stderr);
  assert.match(r.stderr, /export_transcript/);
});

test('cli: two project directories whose first human utterance holds the marker: exit 2, both listed', () => {
  const { home, put } = fakeHome();
  const a = put('-one', 'id-a', [human(CARD_TASK)]);
  const b = put('-two', 'id-b', [human(CARD_TASK)]);
  const r = runIn({ args: ['locate', '--marker', MARKER], home });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /export_transcript/);
  assert.ok(r.stderr.includes(a) && r.stderr.includes(b), r.stderr);
  assert.match(r.stderr, /marker/);
});

test('cli: a resumed session (a second file carrying the old history) is ambiguous, not "the newest wins"', () => {
  const { home, put } = fakeHome();
  const old = put('-wt', 'old-id', [human(CARD_TASK), say('收到')]);
  const resumed = put('-wt', 'resumed-id', [human(CARD_TASK), say('收到'), human('后来的话')]);
  utimesSync(old, 1_000_000, 1_000_000);
  utimesSync(resumed, 2_000_000, 2_000_000);
  for (const extra of [[], ['--dir', join(home, '.claude', 'projects', '-wt')]]) {
    const r = runIn({ args: ['locate', '--marker', MARKER, ...extra], home });
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stderr, /export_transcript/);
    assert.ok(r.stderr.includes(old) && r.stderr.includes(resumed), r.stderr);
  }
});

test('cli: nothing matches the id and nothing matches the marker: exit 2, and the message says what was looked for', () => {
  const { home, put } = fakeHome();
  put('-wt', 'self-id', [human('unrelated')]);
  const r = runIn({ args: ['locate', '--marker', MARKER], home, sessionId: 'gone-id' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gone-id/);
  assert.ok(r.stderr.includes(MARKER), r.stderr);
  assert.match(r.stderr, /export_transcript/);
  assert.equal(runIn({ args: ['locate'], home, sessionId: 'gone-id' }).status, 2);
});

test('cli: with neither an id nor a marker there is nothing to look for: exit 2', () => {
  const { home, put } = fakeHome();
  put('-wt', 'self-id', [human('hello')]);
  const r = runIn({ args: ['locate'], home });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /export_transcript/);
});

test('cli: only the first human utterance counts for the marker', () => {
  const { home, put } = fakeHome();
  put('-later', 'later-id', [human('开场白'), say('好'), human(CARD_TASK)]);
  put('-reminder', 'reminder-id', [human(`<system-reminder>\n${CARD_TASK}\n</system-reminder>开场白`)]);
  put('-notice', 'notice-id', [human(`<task-notification>${CARD_TASK}</task-notification>`), human('开场白')]);
  put('-tool', 'tool-id', [human('开场白'), call('t1'), result('t1', CARD_TASK)]);
  assert.equal(runIn({ args: ['locate', '--marker', MARKER], home }).status, 2);
  // ... and the first human utterance is the first one that is not injected by the harness:
  const own = put('-own', 'own-id', [human('<task-notification>x</task-notification>'), human('<local-command-stdout>y</local-command-stdout>'), human(CARD_TASK)]);
  const r = runIn({ args: ['locate', '--marker', MARKER], home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), own);
});

test('cli: the first human utterance is found even when the lines around it are huge', () => {
  const { home, put } = fakeHome();
  const big = 'x'.repeat(300_000);
  const own = put('-big', 'big-id', [ai([{ type: 'text', text: big }]), human(CARD_TASK), ai([{ type: 'text', text: big }])]);
  const r = runIn({ args: ['locate', '--marker', MARKER], home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), own);
});

test('cli: --dir keeps the search to that one directory', () => {
  const { home, put } = fakeHome();
  const inside = put('-in', 'in-id', [human(CARD_TASK)]);
  put('-out', 'out-id', [human(CARD_TASK)]);
  const r = runIn({ args: ['locate', '--dir', join(home, '.claude', 'projects', '-in'), '--marker', MARKER], home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), inside);
});
