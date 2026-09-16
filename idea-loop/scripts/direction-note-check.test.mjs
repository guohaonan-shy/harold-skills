import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDirectionNote, SECTIONS } from './direction-note-check.mjs';

/** A well-formed note; every test starts from this and bends one thing. */
const note = (over = {}) =>
  SECTIONS.map((s) => `## ${s}\n\n${over[s] ?? `${s} 的正文。`}`).join('\n\n');

test('the seven sections, in order, each with a body, is a valid note', () => {
  const r = checkDirectionNote(note());
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.missing, []);
  assert.equal(r.level, 2);
});

for (const dropped of SECTIONS) {
  test(`dropping 「${dropped}」 fails the check and names it`, () => {
    const md = SECTIONS.filter((s) => s !== dropped)
      .map((s) => `## ${s}\n\n${s} 的正文。`)
      .join('\n\n');
    const r = checkDirectionNote(md);
    assert.equal(r.valid, false);
    assert.deepEqual(r.missing, [dropped]);
    assert.ok(r.errors.some((e) => e.includes(dropped)));
  });
}

test('a section with a heading but no body counts as missing, not present', () => {
  const md = SECTIONS.map((s) => (s === '待打磨清单' ? `## ${s}\n` : `## ${s}\n\n${s} 的正文。`)).join('\n\n');
  const r = checkDirectionNote(md);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('待打磨清单') && /空/.test(e)));
});

test('the note survives being demoted one level into the spec', () => {
  const md = SECTIONS.map((s) => `### ${s}\n\n${s} 的正文。`).join('\n\n');
  const r = checkDirectionNote(md);
  assert.equal(r.valid, true);
  assert.equal(r.level, 3);
});

test('the seven must sit at one level — a mixed-level note is not a note', () => {
  const md = SECTIONS.map((s, i) => `${i === 3 ? '###' : '##'} ${s}\n\n${s} 的正文。`).join('\n\n');
  const r = checkDirectionNote(md);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /同一层级|level/.test(e)));
});

test('out of order fails — the seven are a fixed sequence', () => {
  const swapped = [...SECTIONS];
  [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  const md = swapped.map((s) => `## ${s}\n\n${s} 的正文。`).join('\n\n');
  const r = checkDirectionNote(md);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /顺序/.test(e)));
});

test('a duplicated section is an error, not a second chance', () => {
  const r = checkDirectionNote(`${note()}\n\n## 结构\n\n又写了一遍。`);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('结构') && /重复/.test(e)));
});

test('a stray sibling section among the seven is an error', () => {
  const md = `${note()}\n\n## 参考图\n\n把 contact sheet 贴了进来。`;
  const r = checkDirectionNote(md);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('参考图')));
});

test('sub-headings inside a section are free', () => {
  const md = note({ 变种裁决: '### A · 冷工具\n\n落选：人说太像后台。' });
  const r = checkDirectionNote(md);
  assert.equal(r.valid, true);
});

test('an empty note reports all seven missing rather than crashing', () => {
  const r = checkDirectionNote('');
  assert.equal(r.valid, false);
  assert.deepEqual(r.missing, SECTIONS);
});

test('headings inside a fenced code block are not sections', () => {
  const md = `${note()}\n\n\`\`\`md\n## 意图\n\`\`\`\n`;
  const r = checkDirectionNote(md);
  assert.equal(r.valid, true);
});
