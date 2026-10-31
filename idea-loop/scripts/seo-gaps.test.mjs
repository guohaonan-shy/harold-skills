import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gaps } from './seo-gaps.mjs';
import { parseSeoMd } from './seo-md.mjs';

const seo = (competitors, brand) => parseSeoMd(`# SEO\n\n## 竞品\n${competitors}\n\n## 品牌\n${brand}\n`);

// get_project_context 的原始返回：业务概述有、当前目标和定位空。
const CONTEXT = {
  structuredContent: {
    sections: { business_overview: '菜谱网站，面向下班后要快手做晚饭的上班族。', current_goal: '', positioning: '' },
    missingSections: ['current_goal', 'positioning'],
  },
};

test('gaps: 竞品为空、品牌词写「无」、业务概述非空，方向 pages backlinks、定位为空 → 报竞品和定位，不报品牌词', () => {
  const r = gaps(seo('', '- 品牌词：无'), CONTEXT, ['pages', 'backlinks']);
  assert.deepEqual(r.gaps, [
    { item: 'competitors', label: '竞品', store: 'SEO.md', directions: ['pages', 'backlinks'] },
    { item: 'positioning', label: '定位', store: 'OpenSEO 项目上下文', directions: ['backlinks'] },
  ]);
  assert.equal(r.contextChecked, true);
});

test('gaps: 同一份 SEO.md，方向只有 technical → 不报竞品（technical 只要业务概述，它有）', () => {
  assert.deepEqual(gaps(seo('', '- 品牌词：无'), CONTEXT, ['technical']).gaps, []);
});

test('gaps: 项目上下文文件缺失或读不到 → 只报 SEO.md 那几项，项目上下文那几项不报', () => {
  for (const missing of [null, undefined, 'not an object']) {
    const r = gaps(seo('', ''), missing, ['pages', 'keywords', 'backlinks']);
    assert.deepEqual(r.gaps.map((g) => g.item), ['competitors', 'brand_terms']);
    assert.equal(r.contextChecked, false);
  }
});

test('gaps: 方向列表为空 → 无缺口', () => {
  assert.deepEqual(gaps(seo('', ''), CONTEXT, []).gaps, []);
});

test('gaps: geo 不新增要用的信息', () => {
  assert.deepEqual(gaps(seo('', ''), CONTEXT, ['geo']).gaps, []);
});

test('gaps: 竞品节写 `- 无` 不缺；品牌词没写这个键缺', () => {
  const r = gaps(seo('- 无', '- 说明：随便'), CONTEXT, ['pages']);
  assert.deepEqual(r.gaps.map((g) => g.item), ['brand_terms']);
});

test('gaps: 业务概述、当前目标为空，方向 technical keywords → 每项带上要它的方向', () => {
  const ctx = { structuredContent: { sections: {}, missingSections: ['business_overview', 'current_goal'] } };
  const r = gaps(seo('- `recipebox.example`：RecipeBox', '- 品牌词：`cookbook`'), ctx, ['technical', 'keywords']);
  assert.deepEqual(r.gaps, [
    { item: 'business_overview', label: '业务概述', store: 'OpenSEO 项目上下文', directions: ['technical', 'keywords'] },
    { item: 'current_goal', label: '当前目标', store: 'OpenSEO 项目上下文', directions: ['keywords'] },
  ]);
});

test('gaps: 项目上下文的节写成 { content } 或顶层键，非空都算有，纯空白算空', () => {
  const ctx = { business_overview: { content: '菜谱网站' }, current_goal: '半年内订阅翻倍', positioning: '   ' };
  const r = gaps(seo('- 无', '- 品牌词：无'), ctx, ['technical', 'keywords', 'backlinks']);
  assert.deepEqual(r.gaps.map((g) => g.item), ['positioning']);
});

test('gaps: 不认识的方向抛错', () => {
  assert.throws(() => gaps(seo('', ''), CONTEXT, ['social']), /social/);
});
