/**
 * Tripwire — the pr skill is written from its reader: two deliverables, each with a table of sections and
 * what each section gives the reader.
 *
 * Spec decision-rules-who-decides, ticket 03 (issue #80). Before: four deliverables (the PR description, a
 * stop report, a review report, the review-loop file) grown one rule at a time, 11841 characters over five
 * files, with no place that said what a section is for. The human decided (2026-10-31): the deliverables
 * are the PR description on GitHub and one Review 汇报 in the conversation (stops during implementation and
 * review rounds are the same report); the review-loop file is only where that report is kept; both have a
 * 能否回滚 section; every 要你决定 item has one format. These checks pin: the two section tables (three
 * columns, no empty cell), the item format, the reference files and their total size, the SKILL.md body
 * under 5000 characters, no pointer left at the removed files or the removed names, and the shared writing
 * rules cited from evidence rather than restated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const prDir = join(pluginRoot, 'skills', 'engineering', 'pr');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');
const chars = (s) => [...s].length;

const skillRaw = readFileSync(join(prDir, 'SKILL.md'), 'utf8');
const skill = bodyOf(skillRaw);

/** Rows of every markdown table in `text` whose header is the section table: 节 | 这一节给读者什么 | 谁写. */
function sectionTables(text) {
  const tables = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|\s*节\s*\|\s*这一节给读者什么\s*\|\s*谁写\s*\|\s*$/.test(lines[i])) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) {
      rows.push(lines[j].slice(1, -1).split('|').map((c) => c.trim()));
    }
    tables.push(rows);
  }
  return tables;
}

test('the pr skill has exactly two section tables, one per deliverable, every row with a name, what it gives the reader, and who writes it', () => {
  const tables = sectionTables(skill);
  assert.equal(tables.length, 2, '两份交付物各一张节表');
  for (const rows of tables) {
    for (const cells of rows) {
      assert.equal(cells.length, 3, `一行三列：${cells.join(' | ')}`);
      assert.ok(cells.every((c) => c.length > 0), `没有空格：${cells.join(' | ')}`);
    }
  }
  const [description, report] = tables;
  assert.deepEqual(description.map((r) => r[0].replace(/`[^`]*`/g, '').trim()), ['一句话', '问题', '怎么修', '怎么验证', '能否回滚', '要你做的事', '参考']);
  assert.deepEqual(report.map((r) => r[0]), ['开头一句', '已按规则处理', '要你决定', '能否回滚', '要你看的', '折叠区']);
});

test('the description table carries the script section names in order, with 能否回滚 after 怎么验证 and no 顺带开的 issue of its own', () => {
  const [description] = sectionTables(skill);
  const names = description.map((r) => r[0].match(/`([^`]*)`/)?.[1]);
  assert.deepEqual(names, ['summary', 'problem', 'changes', 'verification', 'rollback', 'your-todo', 'reference']);
  assert.ok(!description.some((r) => r[0].includes('顺带开的 issue')));
});

test('the skill body is at most 5000 characters (UTF-8 characters, not bytes), and names only the two deliverables', () => {
  assert.ok(chars(skill) <= 5000, `body is ${chars(skill)} characters`);
  const description = skillRaw.match(/^description: (.*)$/m)[1];
  assert.match(description, /PR 描述/);
  assert.match(description, /Review 汇报/);
  assert.doesNotMatch(description, /停下汇报/);
});

test('the pr skill has three reference files and they total no more than the four it replaced', () => {
  const files = readdirSync(join(prDir, 'references')).sort();
  assert.deepEqual(files, ['description.md', 'review-loop.md', 'review-report.md']);
  // the four references before the rewrite: 2491 + 2888 + 1654 + 2444 characters
  const total = files.reduce((n, f) => n + chars(readFileSync(join(prDir, 'references', f), 'utf8')), 0);
  assert.ok(total <= 9477, `references total ${total} characters`);
});

test('the Review 汇报 gives every 要你决定 item one format: now, impact, evidence, options with cost and rollback, recommendation', () => {
  const text = readFileSync(join(prDir, 'references', 'review-report.md'), 'utf8');
  const item = text.match(/#### [^\n]*\n([\s\S]*?)\n### 能否回滚/);
  assert.ok(item, 'the template has a 要你决定 item before 能否回滚');
  const at = ['现状', '对用户的影响', '证据', '选项', '推荐'].map((f) => item[1].indexOf(`**${f}**`));
  assert.ok(at.every((i) => i >= 0), `item fields found at ${at}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'fields are in the stated order');
  assert.match(item[1], /代价[\s\S]*能否回滚|能否回滚[\s\S]*代价/, '每个选项带代价和能否回滚');
  // the template has the sections the table names, in the table's order
  const heads = [...text.matchAll(/^### (已按规则处理|要你决定|能否回滚|要你看的)/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['已按规则处理', '要你决定', '能否回滚', '要你看的']);
  assert.match(text, /Standards[\s\S]*规则原文[\s\S]*现状|现状[\s\S]*Standards[\s\S]*规则原文/, 'Standards 的规则原文写在现状里');
});

test('the PR description template has 能否回滚 right after 怎么验证, and none of the sections that were folded away', () => {
  const text = readFileSync(join(prDir, 'references', 'description.md'), 'utf8');
  const heads = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['一句话', '问题', '怎么修', '怎么验证', '能否回滚', '要你做的事', '参考']);
  assert.doesNotMatch(text, /\*\*切法\*\*/);
});

test('the shared writing rules are cited from evidence, not restated in the pr skill', () => {
  const all = [skill, ...readdirSync(join(prDir, 'references')).map((f) => readFileSync(join(prDir, 'references', f), 'utf8'))].join('\n');
  assert.match(skill, /idea-loop:evidence/);
  for (const [name, re] of [['陌生叫法第一次出现', /第一次出现/], ['比对同条件', /同条件/], ['规模数字', /规模数字/], ['裸编号', /裸编号/], ['评判标准', /评判标准/]]) {
    assert.doesNotMatch(all, re, `pr 里复述了 evidence 的共用写法：${name}`);
  }
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'evals', 'docs'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|mjs|json)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(p);
  }
  return out;
}

test('nothing in the plugin points at the removed stop-report / review-round files, the 停下汇报, or the 需要你决定 heading', () => {
  const hits = [];
  for (const file of walk(pluginRoot)) {
    const text = readFileSync(file, 'utf8');
    // review-loop.mjs keeps reading the old 需要你决定 heading in files already written; that is its one mention
    const scrubbed = file.endsWith('review-loop.mjs') ? text.replace(/需要你?决定|需要\|要/g, '') : text;
    if (/stop-report|review-round\.md|停下汇报|需要你决定/.test(scrubbed)) hits.push(relative(pluginRoot, file));
  }
  assert.deepEqual(hits, [], `还指着旧的停下汇报：${hits.join(', ')}`);
});

test('the callers name the new sections: deliver.md writes rollback, not issues, and the implement skill reports through the one Review 汇报', () => {
  const deliver = read('skills', 'engineering', 'pr-review', 'references', 'deliver.md');
  const writes = deliver.match(/`problem`[^\n]*/)?.[0] ?? '';
  assert.match(writes, /`rollback`/);
  assert.doesNotMatch(writes, /`issues`/);
  const implement = read('skills', 'engineering', 'implement', 'SKILL.md');
  assert.match(implement, /Review 汇报/);
  assert.match(implement, /review-loop\.mjs" next[^\n]*review impl/);
  assert.doesNotMatch(implement, /next[^\n]* pause/);
});
