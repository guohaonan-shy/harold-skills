/**
 * The seam is the command line: build a memory directory in a temporary home, run `memory-check.mjs` on it,
 * read back the exit code and the problems it prints. Nothing here touches the real `~/home` or `~/.claude`:
 * every directory is a fresh temporary one, and the default location is reached through `IDEA_LOOP_HOME`.
 *
 * All names below are invented (a fictional "acme-shop" project).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'memory-check.mjs');

/** A temporary home with an empty `memory/`; returns { home, memory }. */
function newHome() {
  const home = mkdtempSync(join(tmpdir(), 'memory-check-'));
  const memory = join(home, 'memory');
  mkdirSync(memory, { recursive: true });
  return { home, memory };
}

/** Write `files` ({ relative path: text }) under `base`, creating directories. */
function put(base, files) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
}

const run = (args = [], env = {}) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, out: r.stdout + r.stderr };
};

/** An index of `lines` lines in total, each (after the first) a link to a fresh entry file; returns { text, entries }. */
function indexOf(lines, hookLength = 10) {
  const entries = {};
  const out = ['# Memory'];
  for (let i = 1; i < lines; i++) {
    entries[`note-${i}.md`] = `---\nname: note ${i}\n---\nbody\n`;
    out.push(`- [note ${i}](note-${i}.md) — ${'x'.repeat(hookLength)}`);
  }
  return { text: `${out.join('\n')}\n`, entries };
}

test('an index over both limits (150 lines, 26,000 bytes), every link valid, exits 2 and names both limits', () => {
  const { memory } = newHome();
  const { text, entries } = indexOf(150, 160);
  assert.ok(Buffer.byteLength(text) > 26000 - 200, `fixture is ${Buffer.byteLength(text)} bytes`);
  put(memory, { 'MEMORY.md': text, ...entries });
  const r = run([memory]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /150 行[^\n]*140/);
  assert.match(r.out, /字节[^\n]*25,?000/);
});

test('exactly 140 lines and 25,000 bytes is within the limits', () => {
  const { memory } = newHome();
  const { text, entries } = indexOf(140, 10);
  // pad the last line so the file is exactly 25,000 bytes
  const padded = text.replace(/\n$/, '') + 'x'.repeat(25000 - Buffer.byteLength(text.replace(/\n$/, '')));
  assert.equal(Buffer.byteLength(padded), 25000);
  assert.equal(padded.split('\n').length, 140);
  put(memory, { 'MEMORY.md': padded, ...entries });
  const r = run([memory]);
  assert.equal(r.status, 0, r.out);
  put(memory, { 'MEMORY.md': `${padded}x` });
  const over = run([memory]);
  assert.equal(over.status, 2, over.out);
  assert.match(over.out, /字节/);
});

test('the byte count is bytes, not characters: 8,400 Chinese characters is 25,200 bytes', () => {
  const { memory } = newHome();
  put(memory, { 'MEMORY.md': `# Memory\n${'记'.repeat(8400)}\n` });
  const r = run([memory]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /字节/);
  assert.doesNotMatch(r.out, /超 140 行|行数/);
});

test('a link to a missing file, a project line pointing at a missing project index, and an entry file nobody lists: all three named, exit 2', () => {
  const { memory } = newHome();
  put(memory, {
    'MEMORY.md': [
      '# Memory',
      '- [reply language](reply-language.md) — Chinese only',
      '- [gone](gone.md) — the file was deleted',
      '',
      '## 项目',
      '- [acme-shop 的项目记忆](../projects/acme-shop/memory/MEMORY.md) — 3 条：结账、埋点',
      '',
    ].join('\n'),
    'reply-language.md': '---\nname: reply language\n---\nChinese only\n',
    'orphan.md': '---\nname: orphan\n---\nnobody links me\n',
  });
  const r = run([memory]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /gone\.md/);
  assert.match(r.out, /acme-shop\/memory\/MEMORY\.md/);
  assert.match(r.out, /orphan\.md/);
  assert.doesNotMatch(r.out, /reply-language\.md/);
});

test('within the limits, every link and project pointer valid, nothing unlisted: exit 0; a project index over 140 lines is not reported', () => {
  const { home, memory } = newHome();
  const project = indexOf(200, 10);
  put(join(home, 'projects', 'acme-shop', 'memory'), { 'MEMORY.md': project.text, ...project.entries });
  put(memory, {
    'MEMORY.md': [
      '# Memory',
      '- [reply language](reply-language.md) — Chinese only',
      '',
      '## 项目',
      '- [acme-shop 的项目记忆](../projects/acme-shop/memory/MEMORY.md) — 199 条',
      '',
    ].join('\n'),
    'reply-language.md': '---\nname: reply language\n---\nChinese only\n',
  });
  const r = run([memory]);
  assert.equal(r.status, 0, r.out);
});

test('a broken link inside a project index is named, with the index it sits in', () => {
  const { home, memory } = newHome();
  put(join(home, 'projects', 'acme-shop', 'memory'), { 'MEMORY.md': '# acme-shop\n- [lost](lost.md) — x\n' });
  put(memory, {
    'MEMORY.md': '# Memory\n\n## 项目\n- [acme-shop 的项目记忆](../projects/acme-shop/memory/MEMORY.md) — 1 条\n',
  });
  const r = run([memory]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /acme-shop[^\n]*lost\.md/);
});

test('a 项目 line with no link at all is a problem', () => {
  const { memory } = newHome();
  put(memory, {
    'MEMORY.md': '# Memory\n\n## 项目\n- acme-shop：结账、埋点\n',
  });
  const r = run([memory]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /项目[^\n]*acme-shop/);
});

test('external links and in-page anchors are not looked up on disk', () => {
  const { memory } = newHome();
  put(memory, {
    'MEMORY.md': '# Memory\n- [docs](https://example.com/memory) — x\n- [top](#memory) — y\n- [note](note.md#part) — z\n',
    'note.md': 'n\n',
  });
  const r = run([memory]);
  assert.equal(r.status, 0, r.out);
});

test('no argument: the default is `memory/` under IDEA_LOOP_HOME', () => {
  const { home, memory } = newHome();
  put(memory, { 'MEMORY.md': `${'# Memory\n'}${'x\n'.repeat(150)}` });
  const r = run([], { IDEA_LOOP_HOME: home });
  assert.equal(r.status, 2, r.out);
  assert.ok(r.out.includes(join(home, 'memory')), r.out);
});

test('a directory without MEMORY.md exits 2 and says so; a missing directory exits 1', () => {
  const { memory } = newHome();
  const r = run([memory]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /MEMORY\.md/);
  const gone = run([join(memory, 'nope')]);
  assert.equal(gone.status, 1, gone.out);
});
