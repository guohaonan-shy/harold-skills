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

test('规矩的归属: seventeen rules, each owned by one place (seven from the rewrite, eight found while rewriting, three from splitting the old decision skill)', () => {
  const rows = tableRows(section('规矩的归属'));
  assert.equal(rows.length, 17);
  const owned = rows.map((r) => r.split('|')[2]?.trim() ?? '');
  for (const o of ['evidence', 'pr-review', 'wiki-conventions', 'issues', 'pr', 'tdd', 'dyna runtime show', 'writing-for-agents', 'implementer', 'seo-scan', 'dreaming', 'design-archive']) {
    assert.ok(owned.some((c) => c.includes(`\`${o}`)), `no row is owned by ${o}`);
  }
  assert.equal(owned.filter((c) => c.startsWith('`issues`')).length, 3, 'status / body format, the comment marker and the Linear way are owned by issues');
  assert.ok(rows.some((r) => /评论里的 idea-loop 标记/.test(r) && r.includes('`issues` 的「评论」')));
  assert.ok(rows.some((r) => /Linear 项目上怎么读写 issue/.test(r) && r.includes('`issues` 的 Linear 做法')));
  assert.ok(rows.some((r) => /暂缓的设计/.test(r) && r.includes('design/pending/')));
  assert.ok(rows.some((r) => /第 1 轮 review 把实现期间开的存量 issue/.test(r) && r.includes('`pr`')));
  assert.ok(rows.some((r) => /交回前要跑的那一组测试/.test(r) && r.includes('implementer')));
  assert.ok(rows.some((r) => /SEO 方向 agent 的提示各行/.test(r) && r.includes('提示模板')));
  assert.ok(rows.some((r) => /dreaming 的收尾/.test(r) && r.includes('proposal-table.md')));
  assert.ok(rows.some((r) => /发现文件形状/.test(r) && r.includes('review-walkthrough.md')));
  assert.ok(rows.some((r) => /证据怎么写/.test(r) && r.includes('`evidence`')), '证据一项归 evidence');
  assert.ok(rows.some((r) => /依据只认四种/.test(r) && r.includes('`pr-review`')), '依据一项归 pr-review 的 review 标准');
  assert.ok(rows.some((r) => /停不停下/.test(r) && r.includes('用户规则')), '停不停下一项归用户规则');
});

test('SKILL-MECHANICS: an injected skill points at its own references by the full plugin-root path, because the injected body has no base directory', () => {
  const m = readFileSync(join(dir, 'SKILL-MECHANICS.md'), 'utf8');
  const part = m.slice(m.indexOf('## 引用另一个 skill'), m.indexOf('## 按调用方式拆'));
  assert.match(part, /开场注入的 skill[^\n]*插件根下的完整路径[^\n]*没有 base directory/);
});

test('SKILL-MECHANICS: 「别的 skill 不读它的 references」记了 pr-review 审查标准的例外，带理由（#280 工单 02，review 第 1 轮 C2）', () => {
  const m = readFileSync(join(dir, 'SKILL-MECHANICS.md'), 'utf8');
  const part = m.slice(m.indexOf('## 引用另一个 skill'), m.indexOf('## 按调用方式拆'));
  const line = part.split('\n').find((l) => l.includes('例外')) ?? '';
  assert.match(line, /pr-review/);
  assert.match(line, /review-standards\.md/);
  assert.match(line, /issue-session/);
  assert.match(line, /`pr`/);
  assert.match(line, /理由/);
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
