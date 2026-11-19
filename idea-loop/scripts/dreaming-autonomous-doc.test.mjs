/**
 * Tripwire — dreaming asks the human only about the rows `--split-ask` hands over and carries out the rest itself.
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
import { COLUMNS, ROW_TYPES, splitAskRows } from './proposal-table-check.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const dir = ['skills', 'productivity', 'dreaming'];

const skillFull = read(...dir, 'SKILL.md');
const skill = body(skillFull);
const proposal = read(...dir, 'references', 'proposal-table.md');
const retro = read(...dir, 'references', 'retro-candidates.md');
const missed = read(...dir, 'references', 'missed-archive.md');
const weekly = read('skills', 'engineering', 'setup', 'references', 'weekly-dreaming.md');
const readme = read('README.md');

// How the docs word each kind of row `--split-ask` hands to the human, in README order. `wording` reads the
// script's own verdict on one probe row and returns the words the docs use for it; null means "no wording
// exists for this kind", which is how a kind the script added and the docs never named shows up.
const ASK_WORDING = ['`DESIGN.md`', '文档里的冲突', '`GLOSSARY.md`', '要删的暂缓设计', '`候选`'];
function wording(type, disposition, object) {
  if (type === '文档' && /^`?GLOSSARY\.md/.test(object)) return '`GLOSSARY.md`';
  if (type === '文档' && ['报警', '问人'].includes(disposition)) return '文档里的冲突';
  if (type === 'DESIGN.md 条目') return '`DESIGN.md`';
  if (type === '暂缓设计' && disposition === '删除') return '要删的暂缓设计';
  if (type === '候选') return '`候选`';
  return null;
}

/** Feed `splitAskRows` one probe row per (row type, disposition, object) and collect what it hands to the human. */
function askedBySplit() {
  const asked = [];
  for (const [type, dispositions] of Object.entries(ROW_TYPES)) {
    for (const disposition of dispositions) {
      for (const object of ['`docs/x.md`', '`GLOSSARY.md`']) {
        const cells = [object, 'f', 'e', disposition, '—'];
        const table = `# t\n\n## ${type}\n\n| ${COLUMNS.join(' | ')} |\n|---|---|---|---|---|\n| ${cells.join(' | ')} |\n`;
        if (splitAskRows(table).count > 0) asked.push({ type, disposition, object });
      }
    }
  }
  return asked;
}

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
  for (const k of ['报警', '问人 ·', '`GLOSSARY.md`', '`DESIGN.md 条目`', ...ASK_WORDING, '大意', '设计规范', '术语']) {
    assert.ok(!part.includes(k), `the split section repeats the rule: ${k}`);
  }
  assert.match(part, /`idea-loop:dreaming`[^\n]*开头/);
});

test('the automatic PR merges itself on generic checks, with no project command in the plugin', () => {
  const merge = proposal.split('4. **自己合并**')[1].split('5. **回滚**')[0];
  assert.match(merge, /`REVIEW\.md` 的验证命令/);
  assert.match(merge, /spec\.mjs check/);
  assert.match(merge, /删除后查死链/);
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

test('dreaming and the weekly setup text say what dreaming still asks', () => {
  // dreaming's opening lists the kinds of rows `proposal-table-check --split-ask` hands to the human; the kinds
  // come from running the script's own judgment, not from a word list kept here. The weekly setup text points
  // at the opening instead of listing them again.
  const ask = skill.match(/行按风险分两类[^\n]*会判错[^（\n]*（([^）\n]*)）问人[^\n]*其余[^\n]*自己执行/);
  assert.ok(ask, 'the opening sentence about the two risk classes is missing');
  const asked = askedBySplit();
  assert.ok(asked.length > 0, 'the script hands nothing to the human');
  const unnamed = asked.filter((a) => wording(a.type, a.disposition, a.object) === null);
  assert.deepEqual(unnamed, [], `--split-ask hands these rows to the human but dreaming's opening names no such kind: ${JSON.stringify(unnamed)}`);
  const derived = new Set(asked.map((a) => wording(a.type, a.disposition, a.object)));
  for (const word of ASK_WORDING) {
    assert.ok(derived.has(word), `dreaming's opening names ${word} but --split-ask no longer asks about it`);
    assert.ok(ask[1].includes(word), `dreaming's opening list lacks ${word}: ${ask[1]}`);
  }
  const at = ASK_WORDING.map((k) => ask[1].indexOf(k));
  assert.deepEqual(at, [...at].sort((a, b) => a - b), `dreaming's opening list is out of order: ${ask[1]}`);
  assert.doesNotMatch(weekly, /两类/);
  assert.match(weekly, /`idea-loop:dreaming`[^\n]*开头/);
  assert.doesNotMatch(weekly, /提议表照样等人批/);
});

test('the plugin README no longer says dreaming waits for the human on every row', () => {
  assert.doesNotMatch(readme, /Two passes with the human between them/);
  assert.doesNotMatch(readme, /nothing is executed until the human approves the proposal table/);
  assert.doesNotMatch(readme, /one table for the human to approve row by row/);
});
