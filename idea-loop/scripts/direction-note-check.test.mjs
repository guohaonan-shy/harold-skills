import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDirectionNote, checkComposition, SECTIONS, COMPOSITION, PROVENANCE } from './direction-note-check.mjs';

/** The composition list a chosen variant carries inside 「变种裁决」; every item ends in a provenance marker. */
const composition = (skip = []) =>
  ['  **构成**（B）：', ...COMPOSITION.filter((c) => !skip.includes(c)).map((c) => `  - ${c}：${c === '颜色' ? '待打磨' : `${c} 的写法`}（${c === '指向' ? '模型代填' : '人选定'}）`)].join('\n');

const VERDICT = `- **B「对话气泡」** —— 赌的是说明贴着按钮出现。**选中**。\n${composition()}\n- **A「顶部横幅」** —— **落选**。`;

/** Default body for a section; 「变种裁决」 carries the composition list. */
const body = (s) => (s === '变种裁决' ? VERDICT : `${s} 的正文。`);

/** A well-formed note; every test starts from this and bends one thing. */
const note = (over = {}) =>
  SECTIONS.map((s) => `## ${s}\n\n${over[s] ?? body(s)}`).join('\n\n');

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
  const md = SECTIONS.map((s) => (s === '待打磨清单' ? `## ${s}\n` : `## ${s}\n\n${body(s)}`)).join('\n\n');
  const r = checkDirectionNote(md);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('待打磨清单') && /空/.test(e)));
});

test('the note survives being demoted one level into the spec', () => {
  const md = SECTIONS.map((s) => `### ${s}\n\n${body(s)}`).join('\n\n');
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
  const md = note({ 变种裁决: `### A · 冷工具\n\n落选：人说太像后台。\n\n${composition()}` });
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

test('a chosen variant with no composition list fails — refine never sees the render', () => {
  const r = checkDirectionNote(note({ 变种裁决: '- **B** —— **选中**。人说就这个。' }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('构成')));
});

for (const dropped of COMPOSITION) {
  test(`a composition list without 「${dropped}」 fails and names it`, () => {
    const errors = checkComposition(`- **B** —— **选中**。\n${composition([dropped])}`);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes(dropped));
  });
}

test('「待打磨」 is a legal value — parked, not silently skipped', () => {
  assert.deepEqual(checkComposition(composition()), []);
});

test('an item with nothing after the colon counts as missing', () => {
  const errors = checkComposition(composition().replace('指向：指向 的写法（模型代填）', '指向：'));
  assert.ok(errors.some((e) => e.includes('指向')));
});

test('every composition block is checked, not just the first', () => {
  const errors = checkComposition(`${composition()}\n- **C** —— **选中**。\n${composition(['颜色'])}`);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].startsWith('第 2 份'));
});

for (const marker of PROVENANCE) {
  test(`an item ending in （${marker}） is accepted`, () => {
    assert.deepEqual(checkComposition(composition().replace('（模型代填）', `（${marker}）`)), []);
  });
}

for (const item of COMPOSITION) {
  test(`「${item}」 without a provenance marker fails and names it`, () => {
    const bare = composition().replace(new RegExp(`(${item}：[^\\n]*?)（(?:人选定|模型代填)）`), '$1');
    const errors = checkComposition(`- **B** —— **选中**。\n${bare}`);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('缺来源标记') && errors[0].includes(item));
  });
}

test('a marker that is neither 人选定 nor 模型代填 fails and names the item', () => {
  const errors = checkComposition(composition().replace('指向 的写法（模型代填）', '指向 的写法（待定）'));
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('来源标记不对') && errors[0].includes('指向（待定）'));
});

test('「待打磨」 without a marker fails too — parking is also someone\'s call', () => {
  const errors = checkComposition(composition().replace('颜色：待打磨（人选定）', '颜色：待打磨'));
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('颜色'));
});

test('a marker in the middle of the line does not count — it goes at the end', () => {
  const errors = checkComposition(composition().replace('指向：指向 的写法（模型代填）', '指向：（模型代填）指向 的写法'));
  assert.ok(errors.some((e) => e.includes('缺来源标记') && e.includes('指向')));
});

test('a note whose composition list lacks markers is not a valid note', () => {
  const bare = VERDICT.replace(/（(?:人选定|模型代填)）/g, '');
  const r = checkDirectionNote(note({ 变种裁决: bare }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('缺来源标记')));
});

test('a 「人保留」 line written under an item is not a composition item and leaves the note valid', () => {
  const kept = composition().replace(
    '  - 容器形状：容器形状 的写法（人选定）',
    '  - 容器形状：容器形状 的写法（人选定）\n    - 人保留（2026-10-19）：评委要把关闭按钮挪到左上，人说保留右上',
  );
  assert.ok(kept.includes('人保留（2026-10-19）'));
  assert.deepEqual(checkComposition(kept), []);
  const verdict = `- **B「对话气泡」** —— **选中**。\n${kept}\n- **A「顶部横幅」** —— **落选**。`;
  assert.equal(checkDirectionNote(note({ 变种裁决: verdict })).valid, true);
});

// ---- the CLI, on the note's home: docs/design/tmp/<spec-slug>/imagine/direction-note.md ----

const script = join(dirname(fileURLToPath(import.meta.url)), 'direction-note-check.mjs');

/** Put a note where uiux-imagine leaves it, in a throwaway project root; returns its path. */
function noteAtHome(md, slug = 'cookbook-redesign') {
  const file = join(mkdtempSync(join(tmpdir(), 'direction-note-')), 'docs/design/tmp', slug, 'imagine/direction-note.md');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, md);
  return file;
}

const check = (file, ...extra) => spawnSync(process.execPath, [script, file, ...extra], { encoding: 'utf8' });

test('cli: a complete note in docs/design/tmp/<spec-slug>/imagine/ passes', () => {
  const file = noteAtHome(note());
  const res = check(file);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /green/);
  assert.ok(res.stdout.includes('docs/design/tmp/cookbook-redesign/imagine/direction-note.md'));
});

test('cli: a note missing a section at that path fails with exit 2 and names the section', () => {
  const file = noteAtHome(note().replace('## 验收矩阵', '## 别的'));
  const res = check(file, '--json');
  assert.equal(res.status, 2);
  assert.deepEqual(JSON.parse(res.stdout).missing, ['验收矩阵']);
});

test('cli: no path, or a path nobody wrote, is a usage error (exit 1)', () => {
  assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 1);
  assert.equal(check(join(tmpdir(), 'docs/design/tmp/nope/imagine/direction-note.md')).status, 1);
});
