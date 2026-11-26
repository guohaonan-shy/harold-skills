/**
 * Tripwire — the places that go along with to-spec writing only for downstream agents: the three references that
 * served the human reader are gone and nothing links to them; the draft-spec reference has no verdict-line section;
 * the triage session hands the human the paragraph to-spec's step 5 writes in the conversation, and a night todo session
 * writes it into its last reply; home's fixed text and evidence's description name 「交 spec 的那段话」 where they named
 * the spec as a thing the human reads.
 *
 * Spec spec-for-agents (issue #451), ticket 02. Before: to-spec's template put a verdict line per issue under the
 * title, draft-spec's 「结论行」 section and self-check asked for it, design-handoff told the human the three things in a
 * few sentences of its own, and home-rules / evidence listed 「spec」 among what the human reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const SESSION = ['skills', 'engineering', 'issue-session'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'evals' || name === 'node_modules') return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test('the three references that served the human reader are deleted and nothing under the plugin links to them', () => {
  for (const f of ['figures.md', 'issue-verdicts.md', 'plan-subsections.md']) {
    assert.equal(existsSync(join(pluginRoot, 'skills', 'engineering', 'to-spec', 'references', f)), false, `${f} 还在`);
  }
  const hits = walk(pluginRoot)
    .filter((f) => /\.(md|json|mjs)$/.test(f) && !/\.test\.mjs$/.test(f))
    .filter((f) => /figures\.md|issue-verdicts|plan-subsections/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(pluginRoot, f));
  assert.deepEqual(hits, [], `还链接着已删的参考：${hits.join(', ')}`);
});

test('raw-template.md and land-on-main.md stay; land-on-main no longer asks to redraw a story tree', () => {
  const dir = ['skills', 'engineering', 'to-spec', 'references'];
  assert.ok(existsSync(join(pluginRoot, ...dir, 'raw-template.md')));
  assert.doesNotMatch(read(...dir, 'land-on-main.md'), /story 树/);
});

test('agent-docs.md: frontmatter 写 changes_agent_docs: true', () => {
  assert.match(read('skills', 'engineering', 'to-spec', 'references', 'agent-docs.md'), /frontmatter 写 `changes_agent_docs: true`/);
});

test('draft-spec has no 结论行 section and keeps 「起草时发现已被做掉就翻 canceled」; the self-check no longer asks for a line under the title, writes the reproduction into the 问题陈述 text, and numbers the expected behaviours against its sub-sections', () => {
  const md = read(...SESSION, 'references', 'draft-spec.md');
  assert.doesNotMatch(md, /^## 结论行/m);
  assert.doesNotMatch(md, /> #<号> 存在/);
  assert.match(md, /起草时发现 issue 已经被做掉了：`dyna issues set <docs> canceled <号> --comment=/);
  const check = md.slice(md.indexOf('## 自己校验'), md.indexOf('## 跟人定要 grill 的'));
  assert.doesNotMatch(check, /一行结论/);
  assert.match(check, /issue 在 spec frontmatter 的 `issues` 里/);
  assert.match(check, /「问题陈述」的文字里写了复现到的现象/);
  assert.match(check, /编号跟「问题陈述」的小节对得上/);
  assert.doesNotMatch(md, /牵出的图/, '没有图了，改 spec 时不用再同步图');
});

test('triage session: step 2 sends the human to design-handoff, whose first step points at to-spec step 5 (the paragraph already written, not retold)', () => {
  const skill = read(...SESSION, 'SKILL.md');
  const step2 = skill.split('\n').find((l) => /^2\.\s+\*\*设计\*\*/.test(l));
  assert.ok(step2, 'triage 会话有第 2 步「设计」');
  assert.match(step2, /references\/design-handoff\.md/);
  const handoff = read(...SESSION, 'references', 'design-handoff.md');
  const first = handoff.split('\n').find((l) => /^1\. /.test(l));
  assert.ok(first, 'design-handoff 有第 1 步');
  assert.match(first, /`idea-loop:to-spec` 第 5 步/);
  assert.match(first, /交 spec 的那段话/);
  assert.doesNotMatch(first, /几句话告诉人三件事/);
  assert.doesNotMatch(first, /要解决的问题、「前端交互」里要设计的场景、「实现决策」里定下的结构决策/, '不复述那段话里的内容');
});

test('night mode: a todo session that drafts the spec itself writes the to-spec step 5 paragraph into its last reply, where it stops', () => {
  const md = read(...SESSION, 'references', 'night-mode.md');
  const line = md.split('\n').find((l) => /交 spec 的那段话/.test(l));
  assert.ok(line, 'night-mode 没写交 spec 的那段话');
  assert.match(line, /`idea-loop:to-spec` 第 5 步/);
  assert.match(line, /停下时的最后一段回复/);
});

test('home fixed text lists 「交 spec 的那段话」, not 「spec」, among the deliverables the human reads; evidence\'s description does the same', () => {
  const rules = read('skills', 'engineering', 'setup', 'references', 'home-rules.md');
  const line = rules.split('\n').find((l) => l.startsWith('- **其余你自己定**'));
  assert.ok(line, '找不到「其余你自己定」那一句');
  assert.match(line, /在交付物（交 spec 的那段话、PR 汇报、停下汇报）里列进「已按规则处理」/);
  const evidence = read('skills', 'productivity', 'evidence', 'SKILL.md');
  const description = evidence.match(/^description: (.*)$/m)[1];
  assert.match(description, /交 spec 的那段话/);
  assert.doesNotMatch(description, /（对话、spec、PR）/);
});

test('old specs are not migrated: the three places that run or explain the spec check say the structure reports only bind the spec written this run; the others stay listed, neither handled nor blocking', () => {
  const dreaming = read('skills', 'productivity', 'dreaming', 'references', 'proposal-table.md');
  const places = {
    'to-spec step 1 (the opening check)': read('skills', 'engineering', 'to-spec', 'SKILL.md').split('\n').find((l) => /^1\.\s+\*\*开工\*\*/.test(l)),
    'issues category-and-spec (the line on dyna spec check)': read('skills', 'engineering', 'issues', 'references', 'category-and-spec.md').split('\n').find((l) => /`dyna spec index\|check <docs>`/.test(l)),
    'dreaming proposal-table (the check before committing)': dreaming.slice(dreaming.indexOf('4. **提交前检查**'), dreaming.indexOf('5. 最后报告给人')),
  };
  for (const [where, text] of Object.entries(places)) {
    assert.ok(text, `${where}: 找不到那一处`);
    assert.match(text, /结构(报告|问题)/, `${where}: 没提结构报告`);
    assert.match(text, /只管这次写/, `${where}: 没写结构报告只管这次写的 spec`);
    assert.match(text, /不处理、不挡/, `${where}: 没写老 spec 的报告不处理、不挡路`);
  }
});
