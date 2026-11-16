/**
 * Tripwire — dreaming asks the human about two kinds of rows only and carries out the rest itself.
 *
 * Spec dreaming-triage-autonomous, ticket 02. Before: dreaming stopped after the proposal pass, showed the
 * whole table and ran the execution pass only on the rows the human approved. What stays: the full table is
 * never shown, the ask-or-auto rule lives in `proposal-table-check --split-ask` and nowhere else, the automatic
 * PR merges itself after the checks, the push has three cases, a run can be rolled back, and the run's tmp
 * directory is deleted only after the asked rows are handled and the automatic PR is merged.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const dir = ['skills', 'productivity', 'dreaming'];

const skillFull = read(...dir, 'SKILL.md');
const skill = body(skillFull);
const proposal = read(...dir, 'references', 'proposal-table.md');
const retro = read(...dir, 'references', 'retro-candidates.md');
const missed = read(...dir, 'references', 'missed-archive.md');
const wiki = body(read('skills', 'productivity', 'wiki-conventions', 'SKILL.md'));
const weekly = read('skills', 'engineering', 'setup', 'references', 'weekly-dreaming.md');
const readme = read('README.md');

test('dreaming: description routes only, body stays under 5000 characters', () => {
  const description = skillFull.match(/^description: (.*)$/m)[1];
  assert.ok(!description.includes('人批过才执行'), description);
  assert.ok([...skill].length < 5000, `body is ${[...skill].length} characters`);
});

test('dreaming: the full table is not shown; the split comes from the script', () => {
  assert.match(skill, /完整表[^\n]*不摆给人/);
  assert.match(skill, /proposal-table-check[^\n]*--split-ask/);
  assert.match(proposal, /--split-ask/);
});

test('the ask-or-auto rule is written once, in the script: the docs point at it and list no dispositions', () => {
  assert.match(proposal, /问人的行和自动的行/);
  const part = proposal.split('## 问人的行和自动的行')[1].split('\n## ')[0];
  assert.match(part, /splitAskRows/);
  for (const k of ['报警', '问人 ·', '`GLOSSARY.md`', '`DESIGN.md 条目`']) {
    assert.ok(!part.includes(k), `the split section repeats the rule: ${k}`);
  }
});

test('the automatic PR merges itself on generic checks, with no project command in the plugin', () => {
  const merge = proposal.split('4. **自己合并**')[1].split('5. **回滚**')[0];
  assert.match(merge, /`REVIEW\.md` 的验证命令/);
  assert.match(merge, /spec\.mjs check/);
  assert.match(merge, /link sweep/);
  assert.match(merge, /design-archive-check/);
  assert.match(merge, /CI/);
  assert.match(merge, /`DEVELOPMENT\.md`/);
  assert.match(merge, /不合并，PR 留着/);
  assert.doesNotMatch(merge, /node --test/);
});

test('three push cases, rollback and when the tmp directory goes are all written down', () => {
  assert.match(skill, /推送只有三种情况[^\n]*有问人的行[^\n]*没合成[^\n]*没跑成/);
  assert.match(skill, /「这次无事」也不发/);
  assert.match(skill, /回滚[^\n]*revert PR/);
  assert.match(skill, /中间物何时删[^\n]*问人的行处理完[^\n]*自动那份已经合并/);
  assert.match(proposal, /\*\*回滚\*\*[^\n]*revert PR/);
});

test('no automatic row waits for approval: retro candidates and missed archive run on their own suggestion', () => {
  assert.match(retro, /按每一行的建议处置执行，不等人批/);
  assert.doesNotMatch(retro, /只执行人批了的行/);
  assert.match(retro, /驳回[^\n]*候选文件里记着人说过驳回/);
  assert.doesNotMatch(missed, /摆给人看/);
  assert.doesNotMatch(missed, /人通过后/);
});

test('wiki-conventions and the weekly setup text say what dreaming still asks', () => {
  assert.match(wiki, /按风险分/);
  assert.match(wiki, /dreaming` 只问两类/);
  assert.match(weekly, /只有 `DESIGN\.md` 和文档里的冲突两类/);
  assert.doesNotMatch(weekly, /提议表照样等人批/);
});

test('the plugin README no longer says dreaming waits for the human on every row', () => {
  assert.doesNotMatch(readme, /Two passes with the human between them/);
  assert.doesNotMatch(readme, /nothing is executed until the human approves the proposal table/);
  assert.doesNotMatch(readme, /one table for the human to approve row by row/);
});
