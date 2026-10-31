/**
 * Pins the sentences that make "seo 要用的项目信息：推测 → 人确认 → 写入 → 只读写着的" true in the
 * docs: the convention and the 每个方向要用的信息 table in seo-md.md, seo-scan's 缺口关卡, seo-setup
 * writing `无`, and the two brand-term judges reading `无` as no brand terms.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to
 * see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

const SCAN = read('skills', 'seo', 'seo-scan', 'SKILL.md');
const SETUP = read('skills', 'seo', 'seo-setup', 'SKILL.md');
const FORMAT = read('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
const CLUSTERING = read('skills', 'seo', 'keyword-clustering', 'SKILL.md');
const FINDINGS = read('skills', 'seo', 'seo-scan', 'references', 'findings.md');
const PAGE_OPTIMIZER = read('agents', 'page-optimizer.md');

/** The body of `## <title>` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, title) {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

const frontmatterField = (doc, name) => doc.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1] ?? '';
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');

test('seo-md.md: the convention sits between 「每节读的人」 and 「不写进 SEO.md 的」', () => {
  const at = (s) => FORMAT.indexOf(s);
  assert.ok(at('## 每节读的人') >= 0 && at('## 项目信息从哪来') > at('## 每节读的人'));
  assert.ok(at('不写进 SEO.md 的：') > at('## 项目信息从哪来'));
});

test('seo-md.md: the convention says who infers, who confirms, what a skill reads and what a scan does when it is missing', () => {
  const c = section(FORMAT, '项目信息从哪来[^\\n]*');
  assert.match(c, /seo-setup`? 推测/);
  assert.match(c, /人确认/);
  assert.match(c, /skill 只读写着的/);
  assert.match(c, /seo-scan`? 开场[\s\S]*推测、停下等人确认/);
  assert.match(c, /不在运行时推一个值直接拿去用/);
  assert.match(c, /品牌词是第一个实例/);
});

test('seo-md.md: the 每个方向要用的信息 table has a row per direction with its stores', () => {
  const c = section(FORMAT, '项目信息从哪来[^\\n]*');
  assert.match(c, /\| technical \| 业务概述 `business_overview` \| OpenSEO 项目上下文 \|/);
  assert.match(c, /\| pages \| 竞品；品牌词 \| `SEO.md` \|/);
  assert.match(c, /\| keywords \| 业务概述、当前目标 `current_goal` \| OpenSEO 项目上下文 \|/);
  assert.match(c, /\| backlinks \| 定位 `positioning`；竞品 \| 定位在 OpenSEO 项目上下文，竞品在 `SEO.md` \|/);
  assert.match(c, /\| geo \| 不新增 \| — \|/);
});

test('seo-md.md: 「无」 is in the format notes and on the 品牌 row, "missing" is defined', () => {
  const notes = FORMAT.slice(0, FORMAT.indexOf('```markdown'));
  assert.match(notes, /写 `无`：`- 品牌词：无`/);
  assert.match(notes, /整节留空写一行 `- 无`/);
  const brandRow = FORMAT.split('\n').find((l) => l.startsWith('| 品牌 |'));
  assert.match(brandRow, /写 `无`/);
  assert.match(section(FORMAT, '项目信息从哪来[^\\n]*'), /写了 `无` 不算缺/);
});

test('seo-scan: the gate sits after 方向 and before 预算', () => {
  const at = (h) => SCAN.indexOf(`\n## ${h}\n`);
  assert.ok(at('方向') > 0 && at('缺口关卡') > at('方向') && at('预算') > at('缺口关卡'));
});

test('seo-scan: the gate notifies, lists guesses with their source, stops without dispatching, then writes and goes on', () => {
  const g = section(SCAN, '缺口关卡');
  assert.match(g, /seo-gaps\.mjs/);
  assert.match(g, /find_serp_competitors/);
  assert.match(g, /allow` 大于 0，就不推/, 'competitors are only inferred when the budget lets it');
  assert.match(g, /PushNotification/);
  assert.match(g, /推测值、出处/);
  assert.match(g, /一次最多三个问题/);
  assert.match(g, /不派任何方向 agent/);
  assert.match(g, /用 Edit 改在工作区/);
  assert.match(g, /人说留空的写 `无`/);
  assert.match(g, /update_project_context/);
  assert.match(g, /从「预算」往下跑/);
});

test('seo-scan: after the human answers, the project context is fetched again before the gaps are rechecked (S1)', () => {
  const g = section(SCAN, '缺口关卡');
  const answered = g.slice(g.indexOf('人回复后'));
  const refetch = answered.search(/重新调 `get_project_context`[^\n]*覆盖[^\n]*context\.json/);
  const recheck = answered.search(/重跑第 2 步/);
  assert.ok(refetch >= 0, 'the opening copy of context.json would still show the filled field as empty');
  assert.ok(recheck > refetch, 'the recheck runs on the fresh copy');
});

test('seo-scan: credits the gate spent count toward the run, and 预算 reads the balance again (S2)', () => {
  const g = section(SCAN, '缺口关卡');
  assert.match(g, /find_serp_competitors[^\n]*调完再调一次[^\n]*`whoami`/, 'the gate reads the balance after the paid call');
  const b = section(SCAN, '预算');
  assert.match(b, /重新读/, '预算 reads creditsRemaining itself');
  assert.ok(!/用关卡那次读到的/.test(b), 'the gate\'s reading is stale once it has spent');
  assert.match(b, /--spent/);
  assert.match(b, /开始余额[^\n]*第一次/, 'the run-start balance is the first reading, gate included');
});

test('seo-scan: does not point at seo-setup\'s private references (C1)', () => {
  const g = section(SCAN, '缺口关卡');
  assert.ok(!/seo-md\.md/.test(SCAN), 'seo-md.md is seo-setup\'s own reference');
  assert.ok(!/格式定义/.test(g));
  assert.ok(!/seo-setup[^\n]*references\//.test(SCAN));
});

test('seo-scan: three stop cases, a stop-and-wait return shape, and SEO.md changes reported', () => {
  assert.match(SCAN, /只有三种情形停下/);
  assert.ok(!/只有开场的两种情形停下/.test(SCAN));
  assert.match(SCAN, /停下等确认：/);
  assert.match(SCAN, /- SEO\.md：这次改了/);
});

test('seo-scan: allowed-tools has what the gate uses', () => {
  const tools = frontmatterField(SCAN, 'allowed-tools');
  for (const t of ['PushNotification', 'Edit', 'Bash(node *seo-gaps.mjs:*)', 'mcp__plugin_idea-loop_openseo__find_serp_competitors']) {
    assert.ok(tools.includes(t), `allowed-tools lacks ${t}`);
  }
});

test('seo-scan: the body stays under 5000 characters', () => {
  assert.ok([...body(SCAN)].length < 5000, `${[...body(SCAN)].length} characters`);
});

test('seo-setup: the brand step points at the convention and writes 无 for a blank answer', () => {
  const brand = SETUP.split('\n').find((l) => l.startsWith('- **品牌**'));
  assert.match(brand, /项目信息从哪来/);
  assert.ok(!/不自己从域名推一个写进去/.test(brand), 'the brand-only rule moved into the convention');
  assert.match(section(SETUP, '4\\. 写 SEO.md'), /人说留空的键[\s\S]*写成 `无`/);
});

test('page-optimizer and keyword-clustering: 无 reads as no brand terms', () => {
  for (const [name, doc] of [['page-optimizer', PAGE_OPTIMIZER], ['keyword-clustering', CLUSTERING]]) {
    assert.match(doc, /没写品牌词，或写的是 `无`（人确认过没有）：不排除/, name);
  }
});

test('findings.md: assumptions also carries a missing project fact and the part left undone', () => {
  assert.match(FINDINGS, /缺的项目信息不推断着用，写清缺什么、哪部分因此没做/);
});
