/**
 * Tripwire — dreaming asks the human only about the rows `dyna dreaming table split` hands over and carries out the rest itself.
 *
 * Spec dreaming-triage-autonomous, ticket 02. Before: dreaming stopped after the proposal pass, showed the
 * whole table and ran the execution pass only on the rows the human approved. What stays: the full table is
 * never shown, the ask-or-auto rule lives in `dyna dreaming table split` and nowhere else, the automatic
 * part is committed to home after the checks (no PR since docs/spec/skills-read-home), the push has three cases,
 * a run can be rolled back with git revert, and the run's tmp directory is deleted only after the asked rows are
 * handled and the automatic part is committed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDyna } from './dyna-test-bin.mjs';

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

// How the docs word each kind of row `dyna dreaming table split` hands to the human, in the opening's order. One
// table holds both the wording and the order: each entry says which probe rows (type, disposition, object) it
// names. A kind the command asks about that no entry names shows up as unnamed; an entry the command no longer
// asks about, or one the opening list lacks, is red too.
const ASK_KINDS = [
  { word: '`DESIGN.md`', names: (t) => t.type === 'DESIGN.md 条目' },
  { word: '文档里的冲突', names: (t) => t.type === '文档' && ['报警', '问人'].includes(t.disposition) },
  { word: '`GLOSSARY.md`', names: (t) => t.type === '文档' && /^`?GLOSSARY\.md/.test(t.object) },
  { word: '要删的暂缓设计', names: (t) => t.type === '暂缓设计' && t.disposition === '删除' },
  { word: '`记忆` 的 `问人` 行', names: (t) => t.type === '记忆' && t.disposition === '问人' },
  { word: '`候选`', names: (t) => t.type === '候选' },
];
const ASK_WORDING = ASK_KINDS.map((k) => k.word);

// The row types and their dispositions are the command's own closed set (dyna/internal/dreaming/table.go).
const tableGo = readFileSync(join(pluginRoot, '..', 'dyna', 'internal', 'dreaming', 'table.go'), 'utf8');
const rowTypesBlock = tableGo.slice(tableGo.indexOf('var RowTypes = []RowType{'), tableGo.indexOf('\n}\n', tableGo.indexOf('var RowTypes')));
const ROW_TYPES = Object.fromEntries(
  [...rowTypesBlock.matchAll(/\{"([^"]+)", \[\]string\{([^}]*)\}\}/g)].map((m) => [m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])]),
);
const COLUMNS = ['对象', '发现', '证据', '建议处置', '选项'];

// One row per type that passes the command's checks; a probe swaps in the disposition (and the object).
const imgProd = '![档案](docs/design/prod/pages/cart--empty/assets/cart--empty.png)';
const imgTmp = '![实现](docs/design/tmp/dreaming-2026-10-19/assets/cart--empty.png)';
const imgCard = '![卡片](docs/design/prod/components/Card/assets/card.png)';
const BASE = {
  '文档': ['docs/spec/cart-promo/cart-promo.md', '自称 在飞；代码物已在树上', 'src/cart/promo.ts'],
  '档案对象': ['components/PromoBadge', '挂的代码路径 src/ui/PromoBadge.tsx 已不存在', '仓库里无此路径；引用：pages/cart--empty 的区域「促销」、边 pages/cart--list#open-promo'],
  '档案状态': ['pages/cart--empty', '档案过期：空购物车文案改了，引用的代码自上次改动有提交 3 次', `${imgProd} ${imgTmp}`],
  '初扫页面': ['pages/wishlist', '档案里没有这一页；路由 /wishlist 可进', 'docs/design/tmp/dreaming-2026-10-19/delta/pages/wishlist/wishlist.md'],
  '候选': ['候选：卡片内边距统一 16px（组件 Card、OrderCard 重复，共 2 次）', '与已有规则「卡片内边距 12px」矛盾', `${imgCard} 并进：Components · 卡片；旧：「卡片内边距 12px」→ 新：「卡片内边距 16px」`],
  'DESIGN.md 条目': ['Motion 章第 3 条', '带日期的先例：不该在文件里', 'DESIGN.md 第 88 行；旧：「结账页弹层淡入 0.2s（2026-07-16 定）」→ 删；依据：design-modeling「明确不进 DESIGN.md 的内容」里的带日期的先例'],
  '漏归档': ['docs/design/tmp/cart-promo/', 'spec 的 issue 全关了，tmp/cart-promo/ 里还留着画布与 delta', 'git ls-tree HEAD docs/design/tmp/cart-promo/；#31 closed'],
  'retro 候选': ['候选：下单前先核对自动填好的字段（落点 `idea-loop:seo-outreach`）', '出现 3 次（#108、#112、#115）；无已推翻；无反例', '#108：「留在候选吧。」；决定记录：[[108]]'],
  '记忆': ['memory/shop-launch-batch.md', '只讲 shop 的上线批次，别的项目用不到', '正文第一句「On shop」；frontmatter originSessionId 的工作目录是 shop'],
  '暂缓设计': ['docs/design/pending/cart-promo/', 'spec 已了结：cart-promo 的 issue #31 已关；暂缓的设计还在（imagine/、canvas/ 到 v7）', '项目目录 ~/home/projects/shop；imagine/ canvas/；spec 目录已不在'],
  '缺陷': ['pages/cart--checkout', '产品坏了：结算按钮点了没反应；控制台 TypeError', `${imgProd} ${imgTmp}`],
};
// 档案状态's finding names the verdict its disposition follows from (and 进不去 says what is missing and what was tried).
const FINDING = { '改进入方式': '进入方式过期：入口按钮改了位置', '补进不去说明': '进不去：要登录' };
const EVIDENCE = { '补进不去说明': `${imgProd} ${imgTmp} 缺登录态；试过直接打开 /cart 与从首页点进` };

/** Run `dyna dreaming table split` on one probe row per (row type, disposition, object) and collect what it hands to the human. */
function askedBySplit() {
  const dir = mkdtempSync(join(tmpdir(), 'dreaming-ask-'));
  const file = join(dir, 'proposal.md');
  const asked = [];
  for (const [type, dispositions] of Object.entries(ROW_TYPES)) {
    assert.ok(BASE[type], `no probe row for the row type ${type}`);
    for (const disposition of dispositions) {
      for (const object of [null, '`GLOSSARY.md`']) {
        const [obj, finding, evidence] = BASE[type];
        const cells = [object ?? obj, (type === '档案状态' && FINDING[disposition]) || finding, (type === '档案状态' && EVIDENCE[disposition]) || evidence, disposition.replace('#N', '#12'), '批 / 不批 / 改成…'];
        writeFileSync(file, `# 提议表 2026-10-19\n\n## ${type}\n\n| ${COLUMNS.join(' | ')} |\n|---|---|---|---|---|\n| ${cells.join(' | ')} |\n`);
        const r = runDyna(['dreaming', 'table', 'split', file]);
        assert.equal(r.status, 0, `the probe row ${type} / ${disposition} does not pass the table check: ${r.stdout}${r.stderr}`);
        if (!/无问人的行/.test(r.stdout)) asked.push({ type, disposition, object: object ?? obj });
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

test('dreaming, adr-reconciler and design-steward keep their body under the 4500 line; the partial-run branch lives in its own reference behind one pointer', () => {
  assert.ok([...skill].length <= 4500, `dreaming body is ${[...skill].length} characters`);
  for (const f of ['adr-reconciler.md', 'design-steward.md']) {
    const n = [...body(read('agents', f))].length;
    assert.ok(n <= 4500, `${f} body is ${n} characters`);
  }
  assert.match(skill, /\[references\/partial-runs\.md\]\(references\/partial-runs\.md\)/);
  assert.doesNotMatch(skill, /## 只跑一部分|单条蒸馏/, 'the partial-run branch is moved out of SKILL.md');
  const partial = read(...dir, 'references', 'partial-runs.md');
  assert.match(partial, /只跑记忆[^\n]*只出 `记忆` 一节/);
  assert.match(partial, /## 单条蒸馏[\s\S]*candidate-distillation\.md/);
});

test('dreaming: the full table is not shown; the split comes from the script', () => {
  assert.match(skill, /完整表[^\n]*不摆给人/);
  assert.match(skill, /dyna dreaming table split[^\n]*--out/);
  assert.match(proposal, /dyna dreaming table split[^\n]*--out/);
});

test('the ask-or-auto rule is written once, in the script: the docs point at it and list no dispositions', () => {
  assert.match(proposal, /问人的行和自动的行/);
  const part = proposal.split('## 问人的行和自动的行')[1].split('\n## ')[0];
  assert.match(part, /dyna dreaming table split/);
  for (const k of ['报警', '问人 ·', '`GLOSSARY.md`', '`DESIGN.md 条目`', ...ASK_WORDING, '大意', '设计规范', '术语']) {
    assert.ok(!part.includes(k), `the split section repeats the rule: ${k}`);
  }
  assert.match(part, /`idea-loop:dreaming`[^\n]*开头/);
});

test('the automatic part commits to home on generic checks, with no project command in the plugin', () => {
  const merge = proposal.split('4. **提交前检查**')[1].split('5. 最后报告')[0];
  assert.match(merge, /REVIEW\.md` 的验证命令/);
  assert.match(merge, /dyna spec check/);
  assert.match(merge, /删除后查死链/);
  assert.match(merge, /dyna design archive check/);
  assert.doesNotMatch(merge, /CI|gh pr/, 'no PR, so nothing to wait for or merge');
  assert.match(merge, /不提交，改动留在工作区/);
  assert.match(merge, /home 没推上去/);
  assert.doesNotMatch(merge, /node --test/);
});

test('three push cases, rollback, when the tmp directory goes and idempotence are written down once, in the proposal reference\'s 收尾; SKILL.md points there', () => {
  assert.match(skill, /\[references\/proposal-table\.md\]\(references\/proposal-table\.md\) 的「收尾」/);
  const end = proposal.split('\n## 收尾')[1];
  assert.ok(end, 'proposal-table.md has no 收尾 section');
  assert.match(end, /推送只有三种情况[^\n]*有问人的行[^\n]*没提交成[^\n]*没跑成/);
  assert.match(end, /这次无事[^\n]*也不发/);
  // the rollback is a result constraint (revert by a new commit, no history rewrite), not a pinned command
  assert.match(end, /\*\*回滚\*\*[^\n]*还原[^\n]*不改写历史/);
  assert.match(end, /中间物何时删[^\n]*问人的行处理完[^\n]*自动那份已经提交/);
  assert.match(end, /幂等[^\n]*提议表应为空/);
  assert.doesNotMatch(skill, /推送只有三种情况|中间物何时删|git revert/, 'the moved paragraphs are not repeated in SKILL.md');
});

test('no automatic row waits for approval: retro candidates and missed archive run on their own suggestion', () => {
  assert.match(retro, /按每一行的建议处置执行，不等人批/);
  assert.doesNotMatch(retro, /只执行人批了的行/);
  assert.match(retro, /驳回[^\n]*候选文件里记着人说过驳回/);
  assert.doesNotMatch(missed, /摆给人看/);
  assert.doesNotMatch(missed, /人通过后/);
});

test('dreaming and the weekly setup text say what dreaming still asks', () => {
  // dreaming's opening lists the kinds of rows `dyna dreaming table split` hands to the human; the kinds
  // come from running the script's own judgment, not from a word list kept here. The weekly setup text points
  // at the opening instead of listing them again.
  const ask = skill.match(/行按风险分两类[^\n]*会判错[^（\n]*（([^）\n]*)）问人[^\n]*其余[^\n]*自己执行/);
  assert.ok(ask, 'the opening sentence about the two risk classes is missing');
  const asked = askedBySplit();
  assert.ok(asked.length > 0, 'the script hands nothing to the human');
  const unnamed = asked.filter((t) => !ASK_KINDS.some((k) => k.names(t)));
  assert.deepEqual(unnamed, [], `dyna dreaming table split hands these rows to the human but dreaming's opening names no such kind: ${JSON.stringify(unnamed)}`);
  const derived = ASK_KINDS.filter((k) => asked.some((t) => k.names(t)));
  for (const k of ASK_KINDS) {
    assert.ok(derived.includes(k), `dreaming's opening names ${k.word} but dyna dreaming table split no longer asks about it`);
  }
  for (const k of derived) {
    assert.ok(ask[1].includes(k.word), `dreaming's opening list lacks ${k.word}: ${ask[1]}`);
  }
  const at = derived.map((k) => ask[1].indexOf(k.word));
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
