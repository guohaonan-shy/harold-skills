import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseSeoMd } from './seo-md.mjs';
import { plan as budgetPlan, spendings, billingPeriod } from './seo-budget.mjs';
import { syncPlan } from './seo-context.mjs';
import { regressions } from './seo-baseline.mjs';
import { due } from './seo-due.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const SEO_MD = `# SEO

说明文字可以写在这里，脚本不读。

## 站点
- 域名：\`cookbook.example\`
- 语言：\`en\` → \`/\`；\`zh-CN\` → \`/zh/\`
- Search Console：\`sc-domain:cookbook.example\`

## OpenSEO
- 项目：\`00000000-0000-4000-8000-000000000000\`
- 余额下限：1000
- 套餐额度：每月 10000，每月 1 日重置
- 每周分配：排名追踪 300；扫描 technical 200，pages 300，keywords 600，backlinks 400，geo 0，results 100；起草与验证 400

## 竞品
- \`recipebox.example\`：RecipeBox，按食材搜菜谱的订阅制 app
- \`panfry.example\`：PanFry

## 重点页面
- \`https://cookbook.example/pricing\`：头词 \`recipe app subscription\`
- \`https://cookbook.example/blog/weeknight-dinners\`

## 构建与检查
- 产物目录：\`apps/site/dist\`
- 检查参数：\`--title-max=70 --desc-max=160\`
- 内容路径：\`apps/site/src/content/blog/\`；\`apps/site/public/images/**\`；\`apps/site/public/llms.txt\`

## 写作
- 文风：\`docs/reference/voice.md\`
- 类型字段：\`category\`
- 类型映射：\`COMPARISON\` → 对比与研究；\`HOW-TO\` → 教程

## 品牌
- 品牌词：\`cookbook\`；\`cook book\`
`;

test('SEO.md: seven sections parse into the shape the scripts read', () => {
  const s = parseSeoMd(SEO_MD);
  assert.equal(s.site.domain, 'cookbook.example');
  assert.deepEqual(s.site.languages, [{ code: 'en', prefix: '/' }, { code: 'zh-CN', prefix: '/zh/' }]);
  assert.equal(s.openseo.projectId, '00000000-0000-4000-8000-000000000000');
  assert.equal(s.openseo.floor, 1000);
  assert.equal(s.openseo.monthly, 10000);
  assert.equal(s.openseo.resetDay, 1);
  assert.deepEqual(s.openseo.weekly, { tracking: 300, scan: { technical: 200, pages: 300, keywords: 600, backlinks: 400, geo: 0, results: 100 }, drafting: 400 });
  assert.deepEqual(s.competitors, [
    { domain: 'recipebox.example', name: 'RecipeBox', notes: '按食材搜菜谱的订阅制 app' },
    { domain: 'panfry.example', name: 'PanFry', notes: '' },
  ]);
  assert.deepEqual(s.keyPages, [
    { url: 'https://cookbook.example/pricing', keyword: 'recipe app subscription' },
    { url: 'https://cookbook.example/blog/weeknight-dinners', keyword: null },
  ]);
  assert.deepEqual(s.build, {
    distDir: 'apps/site/dist',
    checkArgs: ['--title-max=70', '--desc-max=160'],
    contentPaths: ['apps/site/src/content/blog/', 'apps/site/public/images/**', 'apps/site/public/llms.txt'],
  });
  assert.deepEqual(s.writing.typeMap, { COMPARISON: '对比与研究', 'HOW-TO': '教程' });
  assert.deepEqual(s.brand.terms, ['cookbook', 'cook book']);
});

test('SEO.md: 内容路径 is read as a list of globs; a project that has not written it reads as none (only docs/ and SEO.md count as content)', () => {
  assert.deepEqual(parseSeoMd('## 构建与检查\n- 产物目录：`dist`\n').build.contentPaths, []);
  assert.deepEqual(parseSeoMd('## 构建与检查\n- 内容路径：无\n').build.contentPaths, []);
  assert.deepEqual(parseSeoMd('## 构建与检查\n- 内容路径：`content/**/*.md`\n').build.contentPaths, ['content/**/*.md']);
});

test('SEO.md: 内容原则 reads one principle per line, with its source; no section reads as none, without an error', () => {
  const md = `## 内容原则
每行一条：原则（出处：人的原话或 issue 号）
- 数据只当佐证，不罗列（出处：#12，「数据只当佐证」）
- 拿不出能直接练的东西、跟已有文章大面积重合的，不开新页（出处：#30）
- 没写出处的也读得出
- 无
`;
  assert.deepEqual(parseSeoMd(md).principles, [
    { text: '数据只当佐证，不罗列', source: '#12，「数据只当佐证」' },
    { text: '拿不出能直接练的东西、跟已有文章大面积重合的，不开新页', source: '#30' },
    { text: '没写出处的也读得出', source: '' },
  ]);
  assert.deepEqual(parseSeoMd('# SEO\n\n## 站点\n- 域名：`cookbook.example`\n').principles, []);
  assert.deepEqual(parseSeoMd('## 内容原则\n\n## 品牌\n- 品牌词：`cookbook`\n').principles, []);
  assert.deepEqual(parseSeoMd(SEO_MD).principles, [], 'a SEO.md written before the section existed has none');
});

test('SEO.md: 内容原则 does not leak into its neighbours, and the neighbours not into it', () => {
  const s = parseSeoMd('## 内容原则\n- 写短句（出处：#1）\n\n## 品牌\n- 品牌词：`cookbook`\n');
  assert.deepEqual(s.principles, [{ text: '写短句', source: '#1' }]);
  assert.deepEqual(s.brand.terms, ['cookbook']);
});

test('SEO.md: a missing 品牌 section, a missing 品牌词 key or a value without backticks reads as no brand terms', () => {
  assert.deepEqual(parseSeoMd('# SEO\n\n## 站点\n- 域名：`cookbook.example`\n').brand.terms, []);
  assert.deepEqual(parseSeoMd('## 品牌\n- 说明：随便写点什么\n').brand.terms, []);
  assert.deepEqual(parseSeoMd('## 品牌\n- 品牌词：cookbook\n').brand.terms, []);
  assert.deepEqual(parseSeoMd('## 品牌\n- 品牌词：\n').brand.terms, []);
});

test('SEO.md: 品牌词 写「无」读成没有品牌词并标成已确认；没写这个键是未确认', () => {
  const none = parseSeoMd('## 品牌\n- 品牌词：无\n');
  assert.deepEqual(none.brand.terms, []);
  assert.equal(none.confirmed.brandTerms, true);
  assert.equal(parseSeoMd('## 品牌\n- 说明：随便写点什么\n').confirmed.brandTerms, false);
  assert.equal(parseSeoMd('# SEO\n').confirmed.brandTerms, false);
  assert.equal(parseSeoMd('## 品牌\n- 品牌词：cookbook\n').confirmed.brandTerms, false, '没有反引号的值不算写了');
  assert.equal(parseSeoMd(SEO_MD).confirmed.brandTerms, true, '写了品牌词也是已确认');
});

test('SEO.md: 竞品节写 `- 无` 读成没有竞品并标成已确认；节是空的是未确认', () => {
  const none = parseSeoMd('## 竞品\n- 无\n\n## 品牌\n- 品牌词：无\n');
  assert.deepEqual(none.competitors, []);
  assert.equal(none.confirmed.competitors, true);
  assert.equal(parseSeoMd('## 竞品\n\n## 品牌\n').confirmed.competitors, false);
  assert.equal(parseSeoMd('# SEO\n').confirmed.competitors, false);
  assert.equal(parseSeoMd(SEO_MD).confirmed.competitors, true);
});

test('SEO.md: missing sections read as empty, unknown directions and page types are refused', () => {
  const s = parseSeoMd('# SEO\n\n## 站点\n- 域名：`cookbook.example`\n');
  assert.deepEqual(s.competitors, []);
  assert.equal(s.build.distDir, null);
  assert.throws(() => parseSeoMd('## 写作\n- 类型映射：`X` → 杂谈\n'), /杂谈/);
});

test('SEO.md: 套餐额度 and 每周分配 read as numbers; a part left out is simply not allocated', () => {
  const s = parseSeoMd('## OpenSEO\n- 套餐额度：每月 10,000，每月 31 日重置\n- 每周分配：扫描 pages 300\n');
  assert.equal(s.openseo.monthly, 10000);
  assert.equal(s.openseo.resetDay, 31);
  assert.deepEqual(s.openseo.weekly, { tracking: 0, scan: { pages: 300 }, drafting: 0 });
  const none = parseSeoMd('## OpenSEO\n- 余额下限：1000\n').openseo;
  assert.deepEqual([none.monthly, none.resetDay, none.weekly], [null, null, null]);
});

test('SEO.md: the old 单次额度 key is refused and the error says to migrate with seo-setup', () => {
  assert.throws(() => parseSeoMd('## OpenSEO\n- 单次额度：technical 200，pages 300\n'), /单次额度[\s\S]*\/idea-loop:seo-setup/);
  assert.throws(() => parseSeoMd(SEO_MD.replace('- 套餐额度', '- 单次额度：pages 300\n- 套餐额度')), /单次额度/, 'even with the new keys beside it');
});

test('SEO.md: an allocation that names something unknown, or a reset day that is not a day, is refused', () => {
  assert.throws(() => parseSeoMd('## OpenSEO\n- 每周分配：扫描 social 100\n'), /social/);
  assert.throws(() => parseSeoMd('## OpenSEO\n- 每周分配：社交 100\n'), /社交/);
  assert.throws(() => parseSeoMd('## OpenSEO\n- 套餐额度：每月 10000，每月 32 日重置\n'), /32/);
});

const OPENSEO = parseSeoMd(SEO_MD).openseo; // 套餐 10000，每月 1 日重置；每周分配合计 300 + 1600 + 400 = 2300
const spend = (date, lines) => ({ entryDate: date, summary: `seo-scan ${date} 22:05，方向：pages\n采集：pages 1 条\n${lines}` });

test('billing period: starts on the reset day, a reset day past the month end falls on its last day', () => {
  assert.deepEqual(billingPeriod(15, '2026-11-10'), { start: '2026-10-15', end: '2026-11-15' });
  assert.deepEqual(billingPeriod(15, '2026-11-15'), { start: '2026-11-15', end: '2026-12-15' }, 'the reset day itself opens the new period');
  assert.deepEqual(billingPeriod(31, '2027-02-20'), { start: '2027-01-31', end: '2027-02-28' });
  assert.deepEqual(billingPeriod(1, '2026-12-31'), { start: '2026-12-01', end: '2027-01-01' });
  assert.deepEqual(billingPeriod(20, '2027-01-05'), { start: '2026-12-20', end: '2027-01-20' }, 'across the new year');
});

test('spendings: sums 花费 lines by 份, a line without 份 counts as 扫描, 未知 counts as nothing, the date comes from entryDate or the first line', () => {
  const log = [
    { entryDate: '2027-02-02', summary: 'seo-scan 2027-02-02 22:05，方向：pages\n采集：pages 1 条\n花费：300 credits，余额 9000，份：扫描；预算跳过：无\n花费：50 credits，份：排名追踪' },
    { summary: '起草 2027-02-03：issue #12\n花费：1,200 credits，份：起草与验证' },
    { entryDate: '2027-02-04', summary: 'seo-scan 2027-02-04 22:05，方向：pages\n花费：未知 credits，余额 未知' },
    { entryDate: '2027-02-05', summary: 'Keyword research: weeknight dinners. Verdict: ...' },
    { summary: '没有日期的一条\n花费：999 credits' },
  ];
  assert.deepEqual(spendings(log), [
    { date: '2027-02-02', share: '扫描', credits: 300 },
    { date: '2027-02-02', share: '排名追踪', credits: 50 },
    { date: '2027-02-03', share: '起草与验证', credits: 1200 },
  ]);
});

// 2027-02 has 28 days, so on 2027-02-15 the period (2027-02-01 .. 2027-03-01) has two weeks left.
const FEB = [
  spend('2027-01-28', '花费：700 credits，余额 15000'), // last period
  spend('2027-02-02', '花费：3000 credits，余额 9000，份：扫描'),
  spend('2027-02-09', '花费：1500 credits，份：扫描'),
  { entryDate: '2027-02-10', summary: '起草 2027-02-10：issue #7\n花费：900 credits，份：起草与验证' },
];

test('budget: 套餐 10000, two weeks left, 5400 spent this period → 2300 for the week, split by the allocation ratio into three shares', () => {
  const r = budgetPlan(OPENSEO, 20000, ['technical'], { log: FEB, today: '2027-02-15' });
  assert.equal(r.week.weeksLeft, 2);
  assert.equal(r.week.periodSpent, 5400);
  assert.equal(r.week.budget, 2300);
  assert.deepEqual(r.week.shares['排名追踪'], { quota: 300, spent: 0, left: 300 });
  assert.deepEqual(r.week.shares['扫描'], { quota: 1600, spent: 0, left: 1600 });
  assert.deepEqual(r.week.shares['起草与验证'], { quota: 400, spent: 0, left: 400 });
  assert.deepEqual(r.allow, { technical: 200 });
});

test('budget: what the week has spent so far comes out of its share; the budget itself is fixed at the start of the week', () => {
  const log = [...FEB, spend('2027-02-16', '花费：1300 credits，份：扫描'), { entryDate: '2027-02-17', summary: '起草 2027-02-17：issue #9\n花费：100 credits，份：起草与验证' }];
  const r = budgetPlan(OPENSEO, 20000, [], { log, today: '2027-02-18' });
  assert.equal(r.week.budget, 2300, 'this week\'s own spending does not shrink the week\'s budget');
  assert.equal(r.week.shares['扫描'].spent, 1300);
  assert.equal(r.week.shares['扫描'].left, 300);
  assert.equal(r.week.shares['起草与验证'].left, 300);
  assert.deepEqual(r.allow, {}, 'no directions asked: the week\'s books only');
});

test('budget: an unspent period is spread over the weeks left, so the shares grow', () => {
  const r = budgetPlan(OPENSEO, 20000, ['technical', 'pages', 'keywords', 'backlinks', 'geo'], { log: [], today: '2027-02-15' });
  assert.equal(r.week.budget, 5000, '10000 over two weeks');
  assert.deepEqual(r.allow, { technical: 434, pages: 652, keywords: 1304, backlinks: 869, geo: 0 }, 'each direction\'s allocation scaled by 5000 / 2300, rounded down');
});

test('budget: an estimate larger than its share\'s weekly remainder is not run and goes to skipped; the others run', () => {
  const log = [...FEB, spend('2027-02-16', '花费：1300 credits')]; // 扫描 left 300 of 1600
  const r = budgetPlan(OPENSEO, 20000, ['keywords', 'technical', 'pages'], { log, today: '2027-02-18' });
  assert.deepEqual(r.allow, { keywords: 0, technical: 200, pages: 0 }, 'keywords (600) does not fit 300; technical (200) does and leaves 100, which pages (300) does not fit');
  assert.deepEqual(r.skipped.map((s) => s.direction), ['keywords', 'pages']);
  assert.match(r.skipped[0].reason, /预估 600[\s\S]*本周[\s\S]*剩余 300/);
});

test('budget: credits the gate spent earlier in the run come out of the same week\'s 扫描 share', () => {
  const r = budgetPlan(OPENSEO, 20000, ['technical', 'pages'], { log: FEB, today: '2027-02-15', spent: 1500 });
  assert.equal(r.week.shares['扫描'].left, 100);
  assert.deepEqual(r.allow, { technical: 0, pages: 0 });
});

test('budget: a week with no budget left (the plan already spent) runs free calls only', () => {
  const log = [spend('2027-02-02', '花费：10000 credits，份：扫描')];
  const r = budgetPlan(OPENSEO, 20000, ['technical'], { log, today: '2027-02-15' });
  assert.equal(r.week.budget, 0);
  assert.deepEqual(r.allow, { technical: 0 });
  assert.equal(r.skipped.length, 1);
});

test('budget: below the floor nothing paid runs', () => {
  const r = budgetPlan(OPENSEO, 800, ['technical', 'pages'], { log: [], today: '2027-02-15' });
  assert.deepEqual(r.allow, { technical: 0, pages: 0 });
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped[0].reason, /余额 800 低于下限 1000/);
});

test('budget: never spends into the floor; unknown balance means free calls only', () => {
  const o = { ...OPENSEO, weekly: { tracking: 0, scan: { keywords: 600 }, drafting: 0 } };
  assert.deepEqual(budgetPlan(o, 1300, ['keywords'], { log: [], today: '2027-02-15' }).allow, { keywords: 300 });
  assert.equal(budgetPlan(o, 1300, [], { log: [], today: '2027-02-15' }).week.floorRoom, 300);
  const r = budgetPlan(o, NaN, ['keywords'], { log: [], today: '2027-02-15' });
  assert.deepEqual(r.allow, { keywords: 0 });
  assert.match(r.skipped[0].reason, /读不到余额/);
  assert.throws(() => budgetPlan(o, 5000, ['social'], { log: [], today: '2027-02-15' }), /social/);
});

test('budget: a SEO.md without 套餐额度 / 每周分配 is refused with the way out; a bad date is refused', () => {
  assert.throws(() => budgetPlan({ floor: 1000, monthly: null, resetDay: null, weekly: null }, 5000, ['pages'], { log: [], today: '2027-02-15' }), /套餐额度[\s\S]*seo-setup/);
  assert.throws(() => budgetPlan(OPENSEO, 5000, ['pages'], { log: [], today: '15/02' }), /YYYY-MM-DD/);
});

test('budget: the command line reads SEO.md and the context file, and prints the week with the plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-budget-'));
  try {
    writeFileSync(join(dir, 'SEO.md'), SEO_MD);
    writeFileSync(join(dir, 'context.json'), JSON.stringify({ researchLog: FEB }));
    const cli = (...args) => spawnSync('node', [join(here, 'seo-budget.mjs'), join(dir, 'SEO.md'), ...args], { encoding: 'utf8' });
    const r = cli('20000', 'technical', 'pages', '--context', join(dir, 'context.json'), '--today', '2027-02-15', '--spent', '0');
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.allow, { technical: 200, pages: 300 });
    assert.equal(out.week.budget, 2300);
    assert.equal(out.week.logKnown, true);
    const bare = JSON.parse(cli('20000', '--today', '2027-02-15').stdout);
    assert.equal(bare.week.logKnown, false, 'no context file: the book is unknown, not empty');
    assert.equal(cli('x', 'pages', '--today', '2027-02-15').status, 0, 'an unreadable balance is "unknown", not a usage error');
    assert.equal(cli().status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('context: one-way — SEO.md adds, changes and removes; OpenSEO is never read back', () => {
  const seo = parseSeoMd(SEO_MD);
  const context = {
    competitors: [
      { id: 'a', domain: 'recipebox.example', name: 'RecipeBox', notes: '按食材搜菜谱的订阅制 app' },
      { id: 'b', domain: 'oldrival.example', name: 'OldRival', notes: '' },
    ],
    keyPages: [{ id: 'c', url: 'https://cookbook.example/pricing', topic: 'recipe app' }],
  };
  const { updates, summary } = syncPlan(seo, context);
  assert.deepEqual(updates, [
    { addCompetitors: [{ domain: 'panfry.example', name: 'PanFry' }] },
    { removeCompetitors: ['oldrival.example'] },
    { addKeyPages: [{ url: 'https://cookbook.example/pricing', topic: 'recipe app subscription' }, { url: 'https://cookbook.example/blog/weeknight-dinners' }] },
  ]);
  assert.match(summary, /加竞品 panfry\.example/);
  assert.match(summary, /删竞品 oldrival\.example/);
});

test('context: already in sync plans nothing (domain case, www and trailing slash do not count)', () => {
  const seo = parseSeoMd('## 竞品\n- `recipebox.example`：RecipeBox\n## 重点页面\n- `https://cookbook.example/pricing`\n');
  const context = { competitors: [{ domain: 'www.RecipeBox.example/', name: 'RecipeBox', notes: '' }], keyPages: [{ url: 'https://cookbook.example/pricing/', topic: 'anything' }] };
  assert.deepEqual(syncPlan(seo, context).updates, []);
});

const page = (url, over = {}) => ({ url, statusCode: 200, title: 'Pricing', metaDescription: 'Plans', isIndexable: true, inSitemap: true, ...over });

test('baseline: a key page turning non-indexable is severe; a changed title is a warning', () => {
  const seo = parseSeoMd(SEO_MD);
  const prev = { auditId: 'old', pages: [page('https://cookbook.example/pricing'), page('https://cookbook.example/blog/weeknight-dinners/', { title: 'Weeknight' })] };
  const cur = { auditId: 'new', completedAt: '2026-10-20T10:00:00Z', pages: [page('https://cookbook.example/pricing', { isIndexable: false }), page('https://cookbook.example/blog/weeknight-dinners', { title: 'Weeknight dinners' })] };
  const [severe, warning] = regressions(seo, prev, cur);
  assert.equal(severe.kind, 'key-page-regression');
  assert.deepEqual(severe.targets, ['https://cookbook.example/pricing']);
  assert.match(severe.evidence.values, /可索引 → 不可索引/);
  assert.equal(severe.evidence.when, '2026-10-20');
  assert.match(severe.repro, /auditId old/);
  assert.equal(warning.kind, 'key-page-meta-changed');
  assert.deepEqual(warning.targets, ['https://cookbook.example/blog/weeknight-dinners']);
});

test('baseline: a key page missing from this audit is severe; unchanged pages give nothing', () => {
  const seo = parseSeoMd('## 重点页面\n- `https://cookbook.example/pricing`\n- `https://cookbook.example/about`\n');
  const prev = { pages: [page('https://cookbook.example/pricing'), page('https://cookbook.example/about')] };
  const cur = { pages: [page('https://cookbook.example/about')] };
  const out = regressions(seo, prev, cur);
  assert.equal(out.length, 1);
  assert.match(out[0].evidence.values, /本次审计里没有这个页面/);
  assert.deepEqual(regressions(seo, prev, prev), []);
});

const run = (date, collected) => ({ entryDate: date, summary: `seo-scan ${date} 22:05，方向：${collected}\n采集：${collected}\n花费：0 credits` });

test('due: an empty log runs everything; a collected run waits its cadence, a skipped one does not', () => {
  assert.deepEqual(due({ researchLog: [] }, '2026-10-25').due, ['technical', 'pages', 'keywords', 'backlinks', 'geo']);
  const log = [
    run('2026-10-18', 'technical 3 条；pages 2 条'),
    run('2026-10-04', 'technical 1 条；pages 0 条；keywords 4 条；backlinks 未采集（数据源不可用）；geo 0 条'),
    { entryDate: '2026-10-10', summary: 'Keyword research: weeknight dinners. Verdict: ...' },
  ];
  const r = due({ researchLog: log }, '2026-10-25');
  assert.deepEqual(r.last, { technical: '2026-10-18', pages: '2026-10-18', keywords: '2026-10-04', backlinks: null, geo: '2026-10-04' });
  assert.deepEqual(r.due, ['technical', 'pages', 'backlinks']);
  assert.deepEqual(due({ researchLog: log }, '2026-10-31').due, ['technical', 'pages', 'keywords', 'backlinks', 'geo']);
});

test('due: a weekly run a few minutes early still counts as a week', () => {
  assert.deepEqual(due({ researchLog: [run('2026-10-18', 'technical 1 条；pages 1 条')] }, '2026-10-24').due.slice(0, 2), ['technical', 'pages']);
  assert.ok(!due({ researchLog: [run('2026-10-18', 'technical 1 条；pages 1 条')] }, '2026-10-20').due.includes('technical'));
  assert.throws(() => due({}, '10/25'), /YYYY-MM-DD/);
});
