/**
 * Tripwire — writing-for-agents carries the rewrite rules every skill / agent-definition rewrite follows:
 * the 重写核对表 (eight items, each with how to verify), the 外部工具命令的归类 (four classes), the 4500 线,
 * and the 规矩的归属 table. They live in the skill's own reference file; the main file keeps one pointer that
 * says when to read it.
 *
 * Spec skill-rewrite, ticket 01. Before: the skill had no checklist, no command classification, the main body
 * was 4675 characters (no room for a new branch), and no table said which skill owns which shared rule — so
 * each rewrite re-decided those per file. These checks pin where the four things live and the shape each must
 * keep; whether a rewrite applying them reads better is judged by review's Standards axis.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(pluginRoot, 'skills', 'productivity', 'writing-for-agents');
const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');
const main = bodyOf(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
const refPath = join(dir, 'references', 'rewrite-checklist.md');
const ref = existsSync(refPath) ? readFileSync(refPath, 'utf8') : '';

const section = (title) => {
  const m = ref.match(new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  assert.ok(m, `参考文件里找不到「${title}」一节`);
  return m[1];
};
const tableRows = (text) =>
  text.split('\n').filter((l) => l.startsWith('|') && !/^\|[\s|:-]+\|$/.test(l)).slice(1);

test('the main body is within 4500 characters (UTF-8 characters, not bytes)', () => {
  assert.ok([...main].length <= 4500, `body is ${[...main].length} characters`);
});

test('the main file points at the reference once, saying when to read it', () => {
  assert.ok(existsSync(refPath), '缺 references/rewrite-checklist.md');
  const lines = main.split('\n').filter((l) => l.includes('references/rewrite-checklist.md'));
  assert.equal(lines.length, 1, '主文件里指针只写一处');
  const line = lines[0];
  assert.match(line, /重写或新写 skill、agent 定义时读/);
});

test('重写核对表: eight items, each with a way to verify', () => {
  const rows = tableRows(section('重写核对表'));
  assert.equal(rows.length, 8, `核对表应有八行，实际 ${rows.length}`);
  const keys = [
    /分支[^|]*(移出|references)/,
    /目标和交付物[^|]*完成条件/,
    /没有决策历史/,
    /否定句[^|]*硬护栏/,
    /长句定义[^|]*一个词/,
    /共享的规矩只写一处/,
    /dyna <模块> <命令>/,
    /不写外部工具的具体命令/,
  ];
  keys.forEach((re, i) => {
    assert.match(rows[i], re, `第 ${i + 1} 行不对`);
    const cells = rows[i].split('|').map((c) => c.trim()).filter(Boolean);
    assert.ok(cells.length >= 3 && cells[2].length > 0, `第 ${i + 1} 行缺「怎么验」`);
  });
});

test('重写核对表: the mechanical checks name their method (word count, history search, command search)', () => {
  const s = section('重写核对表');
  assert.match(s, /grep -nE '20\[0-9\]\{2\}-\[0-9\]\{2\}-\[0-9\]\{2\}\|人定\|原话\|依据：'/);
  assert.match(s, /\(gh\|git\) \[a-z\]/);
  assert.match(s, /Standards 轴/);
  assert.match(s, /最低版本/);
});

test('外部工具命令的归类: four classes, each with what to write', () => {
  const s = section('外部工具命令的归类');
  for (const k of ['目标型', '约束型', '坑', '适配层']) assert.match(s, new RegExp(`\\*\\*${k}\\*\\*`), `缺「${k}」`);
  assert.match(s, /要拿到的东西和完成条件/);
  assert.match(s, /结果约束和理由/);
  assert.match(s, /留 flag/);
  assert.match(s, /不动/);
  assert.match(s, /换路/);
});

test('4500 线: the cap, the headroom, and references measured with their skill', () => {
  const s = section('4500 线');
  assert.match(s, /4500/);
  assert.match(s, /500 字余量/);
  assert.match(s, /LC_ALL=en_US\.UTF-8 wc -m/);
  assert.match(s, /参考文件不受/);
  assert.match(s, /一起量/);
});

test('规矩的归属: seven rules, each owned by one place', () => {
  const rows = tableRows(section('规矩的归属'));
  assert.equal(rows.length, 7);
  const owners = ['decision-rules', 'wiki-conventions', 'issues', 'pr', 'tdd', 'dyna runtime show', 'writing-for-agents'];
  owners.forEach((o, i) => assert.ok(rows[i].includes(`\`${o}`), `第 ${i + 1} 行应归 ${o}`));
  assert.match(rows[0], /证据怎么写/, '证据一项归 decision-rules');
  assert.doesNotMatch(ref, /idea-loop:evidence|`evidence`/, '证据一项照合并后的名字写 decision-rules');
});

test('the rewritten files carry no decision history except the grep pattern that finds it', () => {
  const pattern = /20[0-9]{2}-[0-9]{2}-[0-9]{2}|人定|原话|依据：/;
  const skillMechanics = readFileSync(join(dir, 'SKILL-MECHANICS.md'), 'utf8');
  assert.doesNotMatch(main, pattern);
  assert.doesNotMatch(skillMechanics, pattern);
  const hits = ref.split('\n').filter((l) => pattern.test(l));
  assert.ok(hits.every((l) => l.includes("grep -nE '")), `参考文件里只有判法那一行可以含这些词：${hits.join(' / ')}`);
});

test('the rewritten files carry no inline gh / git command', () => {
  const skillMechanics = readFileSync(join(dir, 'SKILL-MECHANICS.md'), 'utf8');
  const inline = /`(gh|git) [a-z]/;
  for (const [name, text] of [['SKILL.md', main], ['SKILL-MECHANICS.md', skillMechanics], ['rewrite-checklist.md', ref]]) {
    const hits = text.split('\n').filter((l) => inline.test(l) && !l.includes('grep -nE'));
    assert.deepEqual(hits, [], `${name} 里有行内外部命令`);
  }
});
