import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeoMd } from './seo-md.mjs';
import { plan as budgetPlan, RUN_CAP } from './seo-budget.mjs';
import { syncPlan } from './seo-context.mjs';
import { regressions } from './seo-baseline.mjs';

const SEO_MD = `# SEO

说明文字可以写在这里，脚本不读。

## 站点
- 域名：\`cookbook.example\`
- 语言：\`en\` → \`/\`；\`zh-CN\` → \`/zh/\`
- Search Console：\`sc-domain:cookbook.example\`

## OpenSEO
- 项目：\`00000000-0000-4000-8000-000000000000\`
- 余额下限：1000
- 单次额度：technical 200，pages 300，keywords 600，backlinks 400

## 竞品
- \`recipebox.example\`：RecipeBox，按食材搜菜谱的订阅制 app
- \`panfry.example\`：PanFry

## 重点页面
- \`https://cookbook.example/pricing\`：头词 \`recipe app subscription\`
- \`https://cookbook.example/blog/weeknight-dinners\`

## 构建与检查
- 产物目录：\`apps/site/dist\`
- 检查参数：\`--title-max=70 --desc-max=160\`

## 写作
- 文风：\`docs/reference/voice.md\`
- 类型字段：\`category\`
- 类型映射：\`COMPARISON\` → 对比与研究；\`HOW-TO\` → 教程
`;

test('SEO.md: six sections parse into the shape the scripts read', () => {
  const s = parseSeoMd(SEO_MD);
  assert.equal(s.site.domain, 'cookbook.example');
  assert.deepEqual(s.site.languages, [{ code: 'en', prefix: '/' }, { code: 'zh-CN', prefix: '/zh/' }]);
  assert.equal(s.openseo.projectId, '00000000-0000-4000-8000-000000000000');
  assert.equal(s.openseo.floor, 1000);
  assert.deepEqual(s.openseo.budgets, { technical: 200, pages: 300, keywords: 600, backlinks: 400 });
  assert.deepEqual(s.competitors, [
    { domain: 'recipebox.example', name: 'RecipeBox', notes: '按食材搜菜谱的订阅制 app' },
    { domain: 'panfry.example', name: 'PanFry', notes: '' },
  ]);
  assert.deepEqual(s.keyPages, [
    { url: 'https://cookbook.example/pricing', keyword: 'recipe app subscription' },
    { url: 'https://cookbook.example/blog/weeknight-dinners', keyword: null },
  ]);
  assert.deepEqual(s.build, { distDir: 'apps/site/dist', checkArgs: ['--title-max=70', '--desc-max=160'] });
  assert.deepEqual(s.writing.typeMap, { COMPARISON: '对比与研究', 'HOW-TO': '教程' });
});

test('SEO.md: missing sections read as empty, unknown directions and page types are refused', () => {
  const s = parseSeoMd('# SEO\n\n## 站点\n- 域名：`cookbook.example`\n');
  assert.deepEqual(s.competitors, []);
  assert.equal(s.build.distDir, null);
  assert.throws(() => parseSeoMd('## OpenSEO\n- 单次额度：social 100\n'), /social/);
  assert.throws(() => parseSeoMd('## 写作\n- 类型映射：`X` → 杂谈\n'), /杂谈/);
});

test('budget: below the floor nothing paid runs', () => {
  const r = budgetPlan({ floor: 1000, budgets: { technical: 200, pages: 300 } }, 800, ['technical', 'pages']);
  assert.deepEqual(r.allow, { technical: 0, pages: 0 });
  assert.equal(r.skipped.length, 2);
  assert.match(r.skipped[0].reason, /余额 800 低于下限 1000/);
});

test('budget: a run never plans more than the cap, granted in argument order', () => {
  const budgets = { technical: 600, pages: 600, keywords: 600, backlinks: 600, geo: 200 };
  const r = budgetPlan({ floor: 1000, budgets }, 20000, ['technical', 'pages', 'keywords', 'backlinks', 'geo']);
  assert.equal(Object.values(r.allow).reduce((a, b) => a + b, 0), RUN_CAP);
  assert.deepEqual(r.allow, { technical: 600, pages: 600, keywords: 600, backlinks: 200, geo: 0 });
  assert.deepEqual(r.skipped.map((s) => s.direction), ['backlinks', 'geo']);
});

test('budget: never spends into the floor; unknown balance means free calls only', () => {
  assert.deepEqual(budgetPlan({ floor: 1000, budgets: { keywords: 600 } }, 1300, ['keywords']).allow, { keywords: 300 });
  const r = budgetPlan({ floor: 1000, budgets: { keywords: 600 } }, NaN, ['keywords']);
  assert.deepEqual(r.allow, { keywords: 0 });
  assert.match(r.skipped[0].reason, /读不到余额/);
  assert.throws(() => budgetPlan({ floor: 1000, budgets: {} }, 5000, ['social']), /social/);
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
