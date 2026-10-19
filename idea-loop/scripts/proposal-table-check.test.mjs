/**
 * The seam is the command line: feed `proposal-table-check.mjs` a proposal table, read back the
 * exit code and the problems it prints. Every test here goes through that door, not through an
 * exported function, so the script can be restructured without touching the tests.
 *
 * All objects below are invented (a fictional "checkout" product); nothing here names a real project.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROW_TYPES } from './proposal-table-check.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'proposal-table-check.mjs');

/** Write `md` to a temp file, run the CLI on it, return what a caller of the CLI would see. */
function run(md, ...flags) {
  const file = join(mkdtempSync(join(tmpdir(), 'proposal-table-')), 'proposal.md');
  writeFileSync(file, md);
  const r = spawnSync(process.execPath, [SCRIPT, file, ...flags], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

const HEAD = '| 对象 | 发现 | 证据 | 建议处置 | 选项 |\n|---|---|---|---|---|';
const IMG_PROD = '![档案里的](docs/design/prod/pages/cart/assets/cart--empty.png)';
const IMG_TMP = '![现在的](docs/design/tmp/dreaming-2026-10-19/delta/pages/cart/assets/cart--empty.png)';
const OPTS = '批 / 不批 / 改成…';

/** A section: `## <row type>` then the shared header and the given rows (each an array of 5 cells). */
const section = (type, rows = []) =>
  `## ${type}\n\n${HEAD}\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`;

/** One valid row per row type; tests bend a single cell of a single section. */
const ROWS = {
  文档: [['docs/spec/cart-promo/cart-promo.md', '自称 在飞；代码物已在树上', 'src/cart/promo.ts', '写 ADR 删 spec', OPTS]],
  档案对象: [['components/PromoBadge', '挂的代码路径 src/ui/PromoBadge.tsx 已不存在', '仓库里无此路径；引用：pages/cart--empty 的区域「促销」、边 pages/cart--list#open-promo', '删对象', OPTS]],
  档案状态: [['pages/cart--empty', '档案过期：空购物车文案改了，引用的代码自上次改动有提交 3 次', `${IMG_PROD} ${IMG_TMP}`, '替换档案', OPTS]],
  初扫页面: [['pages/wishlist', '档案里没有这一页；路由 /wishlist 可进', 'docs/design/tmp/dreaming-2026-10-19/delta/pages/wishlist/wishlist.md', '新增页面', OPTS]],
  候选: [['候选：卡片内边距统一 16px（组件 PromoCard、OrderCard 重复，共 2 次）', '与已有规则「卡片内边距 12px」矛盾', 'components/PromoCard、components/OrderCard', '改写已有规则', OPTS]],
  'DESIGN.md 条目': [['Motion 章第 3 条', '带日期的先例：不该在文件里', 'DESIGN.md 第 88 行', '删除', OPTS]],
  缺陷: [['pages/cart--checkout', '产品坏了：结算按钮点了没反应（也可能是档案没跟上）；控制台 TypeError', `${IMG_PROD} ${IMG_TMP}`, '开 issue', OPTS]],
};

const TYPES = Object.keys(ROWS);
const sample = (over = {}) =>
  `# 提议表 2026-10-19\n\n${TYPES.map((t) => section(t, over[t] ?? ROWS[t])).join('\n')}`;

test('a well-formed proposal table, every row type present, exits 0', () => {
  const r = run(sample());
  assert.equal(r.status, 0, r.out);
});

test('a section that is not a known row type fails and is named', () => {
  const r = run(`${sample()}\n${section('随便写点什么', [['x', 'y', 'z', '驳回', OPTS]])}`);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /随便写点什么/);
  assert.match(r.out, /行类型/);
});

/** Replace the 建议处置 cell (index 3) of the one row of `type`. */
const withDisposition = (type, disposition) => [ROWS[type][0].map((c, i) => (i === 3 ? disposition : c))];

test('a disposition outside the row type\'s closed set fails and names the section, the cell and the legal set', () => {
  const r = run(sample({ 档案对象: withDisposition('档案对象', '顺手重构一下') }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /档案对象/);
  assert.match(r.out, /顺手重构一下/);
  assert.match(r.out, /改代码路径/); // the legal set is listed, so the human can fix the cell
});

test('a disposition that is legal for another row type is still wrong here', () => {
  // 「删除」 is a legal DESIGN.md disposition, not a legal archive-object one.
  const r = run(sample({ 档案对象: withDisposition('档案对象', '删除') }));
  assert.equal(r.status, 2, r.out);
});

test('a note in parentheses after a legal disposition is allowed; 已有 #N needs a real number', () => {
  assert.equal(run(sample({ 文档: withDisposition('文档', '订正（路径改名）') })).status, 0);
  assert.equal(run(sample({ 缺陷: withDisposition('缺陷', '已有 #57') })).status, 0);
  const r = run(sample({ 缺陷: withDisposition('缺陷', '已有 #N') }));
  assert.equal(r.status, 2, r.out);
});

/** Replace the 证据 cell (index 2) of the one row of `type`. */
const withEvidence = (type, evidence) => [ROWS[type][0].map((c, i) => (i === 2 ? evidence : c))];

test('an archive-state row with only one picture fails and says two are needed', () => {
  const r = run(sample({ 档案状态: withEvidence('档案状态', IMG_TMP) }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /档案状态/);
  assert.match(r.out, /两张图/);
});

test('an archive-state row whose second picture is not under tmp/ fails', () => {
  const both = `${IMG_PROD} ![现在的](docs/design/prod/pages/cart/assets/other.png)`;
  const r = run(sample({ 档案状态: withEvidence('档案状态', both) }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /tmp\//);
});

test('an archive-state row whose first picture is not the archive\'s own (under prod/) fails', () => {
  const swapped = `${IMG_TMP} ${IMG_TMP}`;
  const r = run(sample({ 档案状态: withEvidence('档案状态', swapped) }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /prod\//);
});

test('a state the product cannot reach is the one archive row that carries no pictures', () => {
  const unreachable = [['pages/cart--gift', '进不去：礼品卡状态需要一个未发放的礼品账号', '缺：一个未发放的礼品账号；试过：直接输入礼品码、从订单页进入', '补进不去说明', OPTS]];
  assert.equal(run(sample({ 档案状态: unreachable })).status, 0);
});

test('a 删对象 row has to name who refers to the object — deleting a component the graph still uses breaks the graph', () => {
  const noRefs = [['components/PromoBadge', '挂的代码路径 src/ui/PromoBadge.tsx 已不存在', '仓库里无此路径', '删对象', OPTS]];
  const r = run(sample({ 档案对象: noRefs }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /档案对象/);
  assert.match(r.out, /引用/);
  const none = [['components/PromoBadge', '没有任何节点、边、用户路径引用它', '引用：无', '删对象', OPTS]];
  assert.equal(run(sample({ 档案对象: none })).status, 0, '"引用：无" is an answer; silence is not');
  const other = [['components/PromoBadge', '挂的代码路径改名了', '重命名记录指向 src/ui/Badge.tsx', '改代码路径', OPTS]];
  assert.equal(run(sample({ 档案对象: other })).status, 0, 'only 删对象 needs the referrers');
});

test('a 进不去 state row says what was missing and what was tried', () => {
  const vague = [['pages/cart--gift', '进不去：礼品卡状态进不去', '走不通', '补进不去说明', OPTS]];
  const r = run(sample({ 档案状态: vague }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /缺/);
  assert.match(r.out, /试过/);
});

test('a defect row about a broken state needs the same two pictures; a rule-versus-code defect does not', () => {
  const noPics = [['pages/cart--checkout', '产品坏了：结算按钮点了没反应', '控制台 TypeError', '开 issue', OPTS]];
  const r = run(sample({ 缺陷: noPics }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /两张图/);
  const ruleVsCode = [['DESIGN.md 的 Motion 章第 1 条', '法对代码错：规则要求全站 0.2s，结算页写死 0.5s', 'src/checkout/Button.css 第 12 行', '开 issue', OPTS]];
  assert.equal(run(sample({ 缺陷: ruleVsCode })).status, 0);
});

const BROKEN = '产品坏了：结算按钮点了没反应（也可能是档案没跟上）；控制台 TypeError';
const withFinding = (type, finding, disposition) => [ROWS[type][0].map((c, i) => (i === 1 ? finding : i === 3 && disposition ? disposition : c))];

test('a 产品坏了 row never carries the replace-the-archive disposition — in the defect section', () => {
  const r = run(sample({ 缺陷: withFinding('缺陷', BROKEN, '替换档案') }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /产品坏了/);
  assert.match(r.out, /替换档案/);
  assert.match(r.out, /不许|不能/);
});

test('a 产品坏了 row never carries the replace-the-archive disposition — in the archive-state section either', () => {
  const r = run(sample({ 档案状态: withFinding('档案状态', BROKEN, '替换档案') }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /产品坏了.*替换档案|替换档案.*产品坏了/s);
});

test('a 产品坏了 row in the archive-state section is misfiled: it belongs in its own section', () => {
  const r = run(sample({ 档案状态: withFinding('档案状态', BROKEN, '改进入方式') }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /缺陷/);
});

test('an archive-state row\'s verdict must match what it proposes to do', () => {
  const r = run(sample({ 档案状态: withFinding('档案状态', '档案过期：文案改了', '改进入方式') }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /档案过期/);
  const noVerdict = run(sample({ 档案状态: withFinding('档案状态', '文案改了') }));
  assert.equal(noVerdict.status, 2, noVerdict.out);
  assert.match(noVerdict.out, /判定/);
});

test('a defect row opens with 产品坏了 or 法对代码错', () => {
  const r = run(sample({ 缺陷: withFinding('缺陷', '按钮有点怪') }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /产品坏了.*法对代码错|法对代码错.*产品坏了/s);
});

test('an initial-scan page row must point at what it built under tmp/ — it never writes prod/ itself', () => {
  const r = run(sample({ 初扫页面: withEvidence('初扫页面', 'docs/design/prod/pages/wishlist/wishlist.md') }));
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /初扫页面/);
  assert.match(r.out, /tmp\//);
});

test('the sample table printed in the dreaming reference is itself valid — the doc and the script cannot drift apart', () => {
  const ref = readFileSync(join(dirname(SCRIPT), '..', 'skills', 'dreaming', 'references', 'proposal-table.md'), 'utf8');
  const block = ref.match(/```markdown\n(# 提议表[\s\S]*?)\n```/);
  assert.ok(block, 'the reference carries no ```markdown sample table');
  const r = run(block[1]);
  assert.equal(r.status, 0, r.out);
});

test('every row type and disposition the reference lists is one the script accepts, and nothing more', () => {
  const ref = readFileSync(join(dirname(SCRIPT), '..', 'skills', 'dreaming', 'references', 'proposal-table.md'), 'utf8');
  for (const [type, set] of Object.entries(ROW_TYPES)) {
    const line = ref.split('\n').find((l) => l.startsWith(`| \`${type}\``));
    assert.ok(line, `the reference has no row for the ${type} row type`);
    const listed = line.split('|')[3].split('·').map((d) => d.trim().replace(/（.*$/, ''));
    assert.deepEqual(listed, set.map((d) => d.replace(/（.*$/, '')), `${type} dispositions drifted`);
  }
});

const EMPTY_SECTIONS =(placeholder) => TYPES.map((t) => `## ${t}\n\n${placeholder}\n`).join('\n');

test('a table with no rows anywhere is empty: valid, and reported as empty so the run pushes one sentence', () => {
  for (const body of [`${HEAD}`, '无']) {
    const r = run(`# 提议表 2026-10-19\n\n${EMPTY_SECTIONS(body)}`, '--json');
    assert.equal(r.status, 0, r.out);
    assert.equal(JSON.parse(r.out).empty, true);
  }
  const text = run(`# 提议表 2026-10-19\n\n${EMPTY_SECTIONS('无')}`);
  assert.match(text.out, /空表/);
});

test('a table with even one row is not empty', () => {
  const r = run(sample({ 候选: [], 缺陷: [], 档案状态: [], 初扫页面: [], 档案对象: [], 'DESIGN.md 条目': [] }), '--json');
  assert.equal(r.status, 0, r.out);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.empty, false);
  assert.equal(parsed.counts.文档, 1);
});

test('a note that something was left unscanned does not make an empty table non-empty', () => {
  const md = `# 提议表\n\n${EMPTY_SECTIONS('无')}\n## 初扫页面\n\n未扫：/wishlist、/settings（本次时间用完）\n`;
  // a second 初扫页面 section is a duplicate — the note belongs inside the first one
  assert.equal(run(md).status, 2);
  const inside = `# 提议表\n\n${EMPTY_SECTIONS('无').replace('## 初扫页面\n\n无', '## 初扫页面\n\n无\n未扫：/wishlist、/settings（本次时间用完）')}`;
  const r = run(inside, '--json');
  assert.equal(r.status, 0, r.out);
  assert.equal(JSON.parse(r.out).empty, true);
});

test('a file with no sections at all is not an empty table — it is a run that wrote nothing', () => {
  const r = run('# 提议表 2026-10-19\n\n本周没什么事。\n');
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /一节都没有|没有任何/);
});

test('the same section twice is an error, not a second chance', () => {
  const r = run(`${sample()}\n${section('文档', ROWS.文档)}`);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /重复/);
});

test('a row with an empty cell, or the wrong number of cells, fails', () => {
  const blank = ROWS.文档[0].map((c, i) => (i === 2 ? '' : c));
  assert.equal(run(sample({ 文档: [blank] })).status, 2);
  assert.equal(run(sample({ 文档: [ROWS.文档[0].slice(0, 4)] })).status, 2);
});
