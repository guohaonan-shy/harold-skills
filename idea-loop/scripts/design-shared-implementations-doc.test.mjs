/**
 * Tripwire — DESIGN.md can register a 「共用实现」 entry (the one implementation a class of screens must use), the
 * implementer checks those entries before building a UI, the reconcile references check them, and the chapter table
 * follows the official section order with a Voice & Content Strategy chapter.
 *
 * Spec design-shared-implementations, ticket 01 (issue #366). Before: chapters.md's Components entry only held
 * "recipes that hold on any page" and excluded page-level structure, so nothing could say "this class of screen must
 * use that implementation", and reconcile could not tell a page that drew its own copy; the chapter table lacked
 * Voice & Content Strategy and listed Motion after Do's and Don'ts. These checks read the plugin's reference text and
 * pin the sentences that carry the change; they cannot see whether an agent follows them at run time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const modelingDir = ['skills', 'design', 'design-modeling'];
const skill = read(...modelingDir, 'SKILL.md');
const chapters = read(...modelingDir, 'references', 'chapters.md');
const reconcile = read(...modelingDir, 'references', 'reconcile.md');
const newRef = read(...modelingDir, 'references', 'new.md');
const distill = read(...modelingDir, 'references', 'distill.md');
const dreamingReconcile = read('skills', 'productivity', 'dreaming', 'references', 'design-md-reconcile.md');
const uiTickets = read('skills', 'engineering', 'implement', 'references', 'ui-tickets.md');
const humanDoc = read('docs', 'design-modeling.md');

/** Text of a `## <title>` (or `### `) section, up to the next heading of the same or higher level. */
function section(doc, title, level = 2) {
  const mark = '#'.repeat(level);
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${mark} ${title}`));
  assert.ok(start >= 0, `no "${mark} ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6} /.test(l) && l.match(/^#+/)[0].length <= level);
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

/** The official order, then the two extensions the plugin adds after it. */
const ORDER = ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Motion', 'Voice & Content Strategy', 'Components', "Do's and Don'ts", 'Responsive Behavior', 'Known Gaps'];

function assertInOrder(text, names, where) {
  let at = -1;
  for (const n of names) {
    const i = text.indexOf(n, at + 1);
    assert.ok(i > at, `${where}: "${n}" is missing or out of order`);
    at = i;
  }
}

/** SKILL.md body = after the frontmatter, same measure as AGENTS.md. */
function body(doc) {
  let seen = 0;
  const rest = [];
  for (const line of doc.split('\n')) {
    if (seen >= 2) rest.push(line);
    if (line === '---') seen++;
  }
  return rest.join('\n');
}

// --- Components: the 共用实现 entry ------------------------------------------------------------------------------

test('chapters.md Components: a 共用实现 entry with the @ pointer and the four other fields', () => {
  const c = section(chapters, 'Components');
  assert.match(c, /共用实现/, 'Components has no 共用实现 entry');
  assert.match(c, /`@<路径>`|`@[^`\s]+`/, 'no @ pointer');
  for (const field of ['用在', '可变', '不许自画', '检查']) assert.match(c, new RegExp(field), `entry field missing: ${field}`);
});

test('chapters.md Components: whole-page views shared by a group of pages enter as this entry; the entry does not recopy looks; not in front matter', () => {
  const c = section(chapters, 'Components');
  assert.match(c, /整页[^。\n]*(失败|404|空状态)/, 'whole-page shared views (失败 / 404 / 空状态) are not named');
  assert.match(c, /不重抄外观/, 'missing: the entry does not recopy the look recipe');
  assert.match(c, /不进 front matter/, 'missing: the entry is not in front matter');
  assert.match(c, /首页 hero/, 'ordinary page-level structure (首页 hero) must still be excluded');
});

test('chapters.md Components: pointer resolution rules and the project-owned check', () => {
  const c = section(chapters, 'Components');
  // 0.2.0: DESIGN.md lives in the project directory in home, the implementation in the code repository
  assert.match(c, /从代码仓库根目录解析/, 'missing: the path resolves from the code repository root');
  assert.match(c, /不以 `\/` 开头/, 'missing: no leading slash');
  assert.match(c, /不出代码仓库/, 'missing: does not leave the code repository');
  assert.match(c, /名单外自己画就红/, 'missing: the check goes red when drawn outside the list');
  assert.match(c, /违规还在的提交上[^。\n]*红/, 'missing: see it red on a commit where the violation is still present');
  assert.match(c, /豁免清单[^。\n]*只减不增/, 'missing: the exemption list only shrinks');
  assert.match(c, /不提供扫描脚本/, 'missing: the plugin ships no scan script');
});

test('chapters.md Components: who registers matches distill — human judges must-unify; fresh DESIGN.md does not register; a candidate with no check yet is written with 检查 待补 plus a drafted issue', () => {
  const c = section(chapters, 'Components');
  const who = c.split('\n').find((l) => l.includes('谁来登记'));
  assert.ok(who, 'no 谁来登记 line');
  assert.match(who, /必须统一/);
  assert.match(who, /不主动登记/);
  assert.match(who, /待补/, 'missing: 检查 is written as 待补 when no project check exists yet');
  assert.match(who, /共用实现缺检查/, 'missing: the drafted issue');
  assert.doesNotMatch(who, /已有项目测试/, 'an existing project test must not be a precondition for registering');
});

test('chapters.md: the example entry uses generic names', () => {
  const c = section(chapters, 'Components');
  assert.match(c, /整页加载失败视图/, 'the example entry should be the generic 整页加载失败视图');
});

// --- Implementer: check the entries before building ---------------------------------------------------------------

test('ui-tickets.md: before building a UI, look up DESIGN.md 共用实现 entries; a hit uses the named implementation; beyond 可变 stops for the human', () => {
  const s = section(uiTickets, '建一块 UI 前查共用实现');
  assert.match(s, /DESIGN\.md/);
  assert.match(s, /共用实现/);
  assert.match(s, /命中[^。\n]*用(那个|指定)的?实现|命中就用/, 'missing: a hit uses the named implementation');
  assert.match(s, /超出[^。\n]*可变[^。\n]*停下/, 'missing: beyond 可变 stops');
  assert.match(s, /加进「可变」还是另起/, 'missing: the human decides between widening 可变 and starting another');
});

test('ui-tickets.md: reaches the 共用实现 entries by calling the design-modeling skill, not by pointing at its references file', () => {
  const s = section(uiTickets, '建一块 UI 前查共用实现');
  assert.match(s, /Skill 工具调 `idea-loop:design-modeling`/, 'missing: call the skill with the Skill tool');
  assert.doesNotMatch(s, /chapters\.md/, "another skill's references/ file must not be named");
});

// --- Reconcile: one more kind of finding --------------------------------------------------------------------------

for (const [name, doc] of [['design-modeling reconcile.md', reconcile], ['dreaming design-md-reconcile.md', dreamingReconcile]]) {
  test(`${name}: has a 共用实现 kind with dead pointer, missing check, exemption count vs last time`, () => {
    assert.match(doc, /共用实现/, 'no 共用实现 kind');
    assert.match(doc, /`@`[^。\n]*(不在|失效)|(不在|失效)[^。\n]*`@`/, 'missing: dead @ pointer');
    assert.match(doc, /共用实现缺检查/, 'missing: the issue 「共用实现缺检查」');
    assert.match(doc, /豁免清单/, 'missing: exemption list');
    assert.match(doc, /基准提交/, 'missing: compared with the exemption list at the baseline commit of the last scheduled run');
    assert.match(doc, /只报当前条数/, 'missing: with no baseline commit only the current count is reported');
    assert.doesNotMatch(doc, /提议表比|上一次 dreaming 的提议表/, 'the last proposal table is deleted after handling, so it cannot be the comparison source');
    assert.match(doc, /变多/, 'missing: more exemptions than last time is raised');
    assert.match(doc, /变少或持平只报不提|持平[^。\n]*只报不提/, 'missing: fewer or equal is only reported');
  });
}

test('design-modeling reconcile.md: the baseline commit is taken by calling idea-loop:dreaming with the Skill tool and reading its 对账范围', () => {
  assert.match(reconcile, /用 Skill 工具调 `idea-loop:dreaming`/, 'missing: call the dreaming skill with the Skill tool');
  assert.match(reconcile, /『对账范围』/, 'missing: the section name 对账范围');
  assert.doesNotMatch(reconcile, /`idea-loop:dreaming` 的增量范围/, 'the old bare pointer to dreaming is gone');
});

test('reconcile.md: the official lint 0.4.0 does not report a missing @ target, so reconcile checks the file itself; broken-ref later', () => {
  assert.match(reconcile, /@google\/design\.md` 0\.4\.0|@google\/design\.md 0\.4\.0/, 'missing: lint version 0.4.0');
  assert.match(reconcile, /不报缺失的 `@` 目标|不报[^。\n]*缺失/, 'missing: lint does not report a missing @ target');
  assert.match(reconcile, /broken-ref/, 'missing: broken-ref');
  assert.match(reconcile, /官方 `lint` 的 warning/, 'missing: later handled as an official lint warning');
});

test('dreaming design-md-reconcile.md: a dead pointer is a 「DESIGN.md 条目」 row for the human; a missing check or more exemptions drafts a 缺陷 issue', () => {
  assert.match(dreamingReconcile, /DESIGN\.md 条目/);
  assert.match(dreamingReconcile, /改指针|删条目/, 'missing: the human chooses between re-pointing and deleting the entry');
  assert.match(dreamingReconcile, /缺陷/, 'missing: the 缺陷 section drafts the issue');
});

// --- Chapter table: official order, Voice chapter -----------------------------------------------------------------

test('SKILL.md chapter table follows the official order; Motion is no longer an extension; Voice chapter is listed', () => {
  const table = section(skill, '结构', 2);
  const rows = table.split('\n').filter((l) => /^\| [A-Z]/.test(l)).map((l) => l.split('|')[1].trim());
  const names = rows.map((r) => r.replace(/（扩展）/, ''));
  assert.deepEqual(names, ORDER, 'SKILL.md chapter table order');
  assert.ok(!rows.includes('Motion（扩展）') && rows.includes('Motion'), 'Motion should be listed without the 扩展 mark');
  assert.ok(rows.includes('Responsive Behavior（扩展）') && rows.includes('Known Gaps（扩展）'), 'Responsive Behavior and Known Gaps stay marked 扩展');
});

test('chapters.md headings follow the official order', () => {
  const heads = chapters.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim().replace(/（扩展）/, ''));
  assert.deepEqual(heads, ORDER, 'chapters.md section order');
  assert.ok(chapters.includes('## Motion\n'), 'chapters.md keeps the chapter name "Motion" without the 扩展 mark');
});

test('docs/design-modeling.md lists the chapters in the official order', () => {
  const line = humanDoc.split('\n').find((l) => l.startsWith('- 正文 `##` 章节'));
  assert.ok(line, 'the 正文章节 line is gone');
  assertInOrder(line, ORDER, 'docs/design-modeling.md');
});

test('chapters.md Voice & Content Strategy: tone, case, button copy, empty / loading / error copy with a next step, numbers dates units; terms point at GLOSSARY.md', () => {
  const v = section(chapters, 'Voice & Content Strategy');
  for (const w of ['语气', '大小写', '按钮文案', '空', '加载', '错误', '下一步', '数字', '日期', '单位']) assert.match(v, new RegExp(w), `Voice chapter misses: ${w}`);
  assert.match(v, /GLOSSARY\.md/, 'terms must point at GLOSSARY.md');
  assert.match(v, /不重抄词表/, 'missing: do not recopy the word list');
  assert.match(v, /没有[^。\n]*才在本章写/, 'missing: only a project without GLOSSARY.md writes terms here');
});

test('new.md writes the new order and Voice chapter but does not register shared implementations', () => {
  assert.match(newRef, /Voice/, 'new.md does not mention the Voice chapter');
  assert.match(newRef, /不主动登记共用实现/, 'missing: no shared-implementation entries on a fresh DESIGN.md');
  assert.match(newRef, /候选/, 'missing: they come later through candidates');
  assert.doesNotMatch(newRef, /项目测试/, 'new.md must only say nobody has judged 必须统一 yet, not name a project test as a precondition');
});

test('distill.md writes a 共用实现 candidate in the entry shape and drafts 「共用实现缺检查」 when there is no check yet', () => {
  assert.match(distill, /共用实现/);
  assert.match(distill, /条目形状|chapters\.md/, 'missing: written in the entry shape');
  assert.match(distill, /共用实现缺检查/, 'missing: the issue draft when there is no check');
  assert.match(distill, /缺陷/, 'missing: the 缺陷 section');
});

// --- Nothing regresses --------------------------------------------------------------------------------------------

test('no reference still marks Motion as an extension', () => {
  for (const [n, d] of [['SKILL.md', skill], ['chapters.md', chapters], ['new.md', newRef], ['docs/design-modeling.md', humanDoc]]) {
    assert.doesNotMatch(d, /Motion（扩展）/, `${n} still marks Motion as 扩展`);
  }
});

test('design-modeling SKILL.md body stays under 5000 characters', () => {
  const n = [...body(skill)].length;
  assert.ok(n < 5000, `body is ${n} characters`);
});
