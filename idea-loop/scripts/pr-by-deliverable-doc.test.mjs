/**
 * Tripwire — the pr skill is written from its reader: one deliverable, the PR description, with a table of
 * its sections and what each gives the reader; the Review 汇报 and the review loop file belong to pr-review.
 *
 * Spec who-decides, ticket 03 (issue #80) split the pr skill by deliverable (the PR description on GitHub, and
 * one Review 汇报 in the conversation kept in the review-loop file). Spec pr-five-sections, ticket 02 (issue
 * #452) cut the description to five sections (问题, 概要, 证据, 合并风险, 要你做的事; an SEO PR adds 上线自查的网址)
 * and moved the Review 汇报 and the review loop file, with everything about showing them, into pr-review. These
 * checks pin: the one section table (three columns, no empty cell, the script section names in order), the
 * template headings, the references of both skills, nothing of the old structure left in pr, the 汇报 item
 * format pointing at home's 一道题 instead of restating it, no pointer at the removed files or names, the
 * shared writing rules cited from evidence rather than restated, and the 「视图菜单」 section dyna prints.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const prDir = join(pluginRoot, 'skills', 'engineering', 'pr');
const prReviewDir = join(pluginRoot, 'skills', 'engineering', 'pr-review');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const bodyOf = (raw) => raw.replace(/^---\n[\s\S]*?\n---\n/, '');

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

test('the pr skill has exactly one section table, every row with a name, what it gives the reader, and who writes it', () => {
  const tables = sectionTables(skill);
  assert.equal(tables.length, 1, 'PR 描述一张节表；汇报的节表在 pr-review');
  for (const cells of tables[0]) {
    assert.equal(cells.length, 3, `一行三列：${cells.join(' | ')}`);
    assert.ok(cells.every((c) => c.length > 0), `没有空格：${cells.join(' | ')}`);
  }
  assert.deepEqual(tables[0].map((r) => r[0].replace(/`[^`]*`/g, '').trim()), ['问题', '概要', '证据', '合并风险', '要你做的事', '上线自查的网址']);
});

test('the description table carries the script section names in order', () => {
  const [description] = sectionTables(skill);
  assert.deepEqual(description.map((r) => r[0].match(/`([^`]*)`/)?.[1]), ['problem', 'outline', 'evidence', 'risk', 'your-todo', 'live-check']);
});

test('the pr skill names only the PR description, and none of the old section names or the review-report sections are left in it', () => {
  const description = skillRaw.match(/^description: (.*)$/m)[1];
  assert.match(description, /PR 描述/);
  assert.doesNotMatch(description, /Review 汇报|review loop/);
  const all = [skill, ...readdirSync(join(prDir, 'references')).map((f) => readFileSync(join(prDir, 'references', f), 'utf8'))].join('\n');
  for (const name of ['summary', 'changes', 'verification', 'rollback', 'night-decided', 'night-waiting', 'reference']) {
    assert.doesNotMatch(all, new RegExp(`\`${name}\``), `pr 里还写着旧节名 \`${name}\``);
  }
  assert.doesNotMatch(skill, /^## (Review 汇报|在会话里给人看|review loop 文件)/m, 'review 汇报三节已挪去 pr-review');
});

test('the pr skill has two reference files; the review report and the review loop file live in pr-review', () => {
  assert.deepEqual(readdirSync(join(prDir, 'references')).sort(), ['delivery-evidence.md', 'description.md']);
  assert.deepEqual(
    readdirSync(join(prReviewDir, 'references')).filter((f) => /^review-(report|loop)\.md$/.test(f)).sort(),
    ['review-loop.md', 'review-report.md'],
  );
});

test('the Review 汇报 has its section table in pr-review and writes the 要你决定 item as home\'s 一道题, not as a format of its own', () => {
  const text = readFileSync(join(prReviewDir, 'references', 'review-report.md'), 'utf8');
  const [table] = sectionTables(text);
  assert.deepEqual(table.map((r) => r[0]), ['开头一句', '已按规则处理', '要你决定', '合并风险', '要你看的', '折叠区']);
  const heads = [...text.matchAll(/^### (已按规则处理|要你决定|合并风险|要你看的)/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['已按规则处理', '要你决定', '合并风险', '要你看的']);
  assert.match(text, /照 home 固定文案「要我定的事写成一道题」/);
  for (const old of ['**现状**', '**对用户的影响**', '**证据**：', '**选项**：', '**推荐**：']) {
    assert.ok(!text.includes(old), `汇报里还有自己的一道题的形状：${old}`);
  }
  assert.match(text, /Standards 的题把规则原文写在问题里/);
  for (const phrase of ['编号 `S1` / `C1` / 工单号只在这一次汇报内有效', '术语表缺的词', '给修复方的位置', '在会话里给人看']) {
    assert.ok(text.includes(phrase), `review-report.md 缺：${phrase}`);
  }
});

test('the PR description template has the five sections in order, then the SEO one, and none of the sections that were folded away', () => {
  const text = readFileSync(join(prDir, 'references', 'description.md'), 'utf8');
  const heads = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['问题', '概要', '证据', '合并风险', '要你做的事', '上线自查的网址']);
  assert.doesNotMatch(text, /\*\*切法\*\*/);
});

test('pr has no review 汇报 sections while pr-review has them, and evidence has a 「视图菜单」 section', () => {
  for (const name of ['review loop 文件', '在会话里给人看', 'Review 汇报']) {
    assert.ok(!skill.includes(`## ${name}`), `pr 里还有「${name}」一节`);
  }
  const report = readFileSync(join(prReviewDir, 'references', 'review-report.md'), 'utf8');
  const loop = readFileSync(join(prReviewDir, 'references', 'review-loop.md'), 'utf8');
  assert.match(read('skills', 'engineering', 'pr-review', 'SKILL.md'), /^## Review 汇报$/m, 'pr-review 的 SKILL.md 有「Review 汇报」一节，别的 skill 照它的名字指过来');
  assert.match(report, /^# Review 汇报的格式/m);
  assert.match(report, /^## 在会话里给人看/m);
  assert.match(loop, /^# review loop 文件/m);
  const evidence = read('skills', 'productivity', 'evidence', 'SKILL.md');
  assert.equal(evidence.split('\n').filter((l) => l === '## 视图菜单').length, 1);
});

test('the shared writing rules are cited from evidence, not restated in the pr skill', () => {
  const all = [skill, ...readdirSync(join(prDir, 'references')).map((f) => readFileSync(join(prDir, 'references', f), 'utf8'))].join('\n');
  assert.match(skill, /idea-loop:evidence` 的「视图菜单」[\s\S]*「证据是什么」/);
  assert.match(skill, /idea-loop:evidence` 的「视图菜单」/);
  // description.md（#452 会话里人批过的草稿）里「没收的第一次出现时说清」是模板自己的一句，不算复述
  for (const [name, re] of [['比对同条件', /同条件/], ['规模数字', /规模数字/], ['裸编号', /裸编号/], ['评判标准', /评判标准/]]) {
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
  // home's fixed text names the 停下汇报 as one of the deliverables a decision is listed in; it is the same word, not the removed file
  for (const file of walk(pluginRoot).filter((f) => !f.endsWith('setup/references/home-rules.md'))) {
    const text = readFileSync(file, 'utf8');
    if (/stop-report|review-round\.md|停下汇报|需要你决定/.test(text)) hits.push(relative(pluginRoot, file));
  }
  assert.deepEqual(hits, [], `还指着旧的停下汇报：${hits.join(', ')}`);
});

test('nothing in the plugin points at the pr skill\'s old review-report.md / review-loop.md paths', () => {
  const hits = [];
  for (const file of walk(pluginRoot)) {
    const text = readFileSync(file, 'utf8');
    const where = relative(pluginRoot, file);
    // a path under pr/ (not pr-review/)
    if (/skills\/engineering\/pr\/references\/review-(report|loop)\.md/.test(text)) hits.push(`${where}：指着 pr 下的旧路径`);
  }
  assert.deepEqual(hits, [], `还指着旧位置：${hits.join(', ')}`);
});

test('the callers name the new sections: deliver.md writes the five, not the old ones', () => {
  const deliver = read('skills', 'engineering', 'pr-review', 'references', 'deliver.md');
  const writes = deliver.match(/`problem`[^\n]*/)?.[0] ?? '';
  for (const name of ['outline', 'evidence', 'risk', 'your-todo']) assert.match(writes, new RegExp(`\`${name}\``));
  for (const name of ['changes', 'verification', 'rollback', 'summary', 'reference']) {
    assert.doesNotMatch(deliver, new RegExp(`\`${name}\``), `deliver.md 还写着旧节名 \`${name}\``);
  }
  const other = read('skills', 'engineering', 'pr-review', 'references', 'other-directives.md');
  assert.match(other, /追加进 PR 描述 `your-todo`/);
  assert.doesNotMatch(other, /`rollback`|`reference`/);
});
