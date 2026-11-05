/**
 * Tripwire — the four seo method skills do not infer project information when unattended.
 *
 * Spec seo-params-from-seo-md, ticket 02. Convention: project information a skill needs (business, goal, positioning,
 * competitors) is confirmed by a human and written down; an unattended run (a direction agent called by seo-scan) that
 * finds a gap must not infer a value from the site / find_serp_competitors and use it. Step 3 of 「项目上下文」 in
 * keyword-research, seo-audit, link-prospecting and competitor-analysis therefore reads 「缺了不推断」: say in
 * `assumptions` what is missing and which part was not done, finish the rest. The human-present branch (guess →
 * ask → write back) stays as it was, and competitor-analysis still analyses a competitor the caller names.
 *
 * SEO_SKILLS_DIR points the test at another copy of skills/seo (used to watch it fail on the pre-change text).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const seoDir = process.env.SEO_SKILLS_DIR ?? join(pluginRoot, 'skills', 'seo');
const read = (slug) => readFileSync(join(seoDir, slug, 'SKILL.md'), 'utf8');

function section(doc, title) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${title}`));
  assert.ok(start >= 0, `no "## ${title}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

// Step 3 of 「项目上下文」, split into its two branches (the bullets under the numbered step).
function step3(slug) {
  const ctx = section(read(slug), '项目上下文');
  const lines = ctx.split('\n');
  const from = lines.findIndex((l) => /^3\.\s/.test(l));
  assert.ok(from >= 0, `${slug}: 「项目上下文」 has no step 3`);
  const rest = lines.slice(from + 1);
  const end = rest.findIndex((l) => /^\d+\.\s/.test(l));
  const bullets = rest.slice(0, end < 0 ? undefined : end).join('\n');
  const present = bullets.split('\n').find((l) => /^\s+- 人在场：/.test(l));
  const unattended = bullets.split('\n').find((l) => /^\s+- 无人值守：/.test(l));
  assert.ok(present, `${slug}: step 3 has no 「人在场」 branch`);
  assert.ok(unattended, `${slug}: step 3 has no 「无人值守」 branch`);
  return { present, unattended };
}

const cases = [
  {
    slug: 'seo-audit',
    missing: /`business_overview`/,
    notDone: /按业务判断哪些发现要紧/,
    presentKept: /从站点推断业务，用一个问题和人确认/,
  },
  {
    slug: 'keyword-research',
    missing: /`business_overview`[\s\S]*`current_goal`/,
    notDone: /没法按业务筛种子词/,
    presentKept: /或从站点推断再确认/,
  },
  {
    slug: 'link-prospecting',
    missing: /`positioning`[\s\S]*竞品|竞品[\s\S]*`positioning`/,
    notDone: /SEO\.md 竞品为空，未挖竞品外链/,
    presentKept: /从站点和 `find_serp_competitors` 推断再确认/,
  },
  {
    slug: 'competitor-analysis',
    missing: /缺竞品/,
    notDone: /竞品分析因此没做/,
    presentKept: /或从 `find_serp_competitors` 推断再确认/,
  },
];

for (const c of cases) {
  test(`${c.slug}: unattended step 3 does not infer, it names what is missing and what was not done`, () => {
    const { unattended } = step3(c.slug);
    assert.match(unattended, /缺了不推断/, '无人值守 branch must say 「缺了不推断」');
    assert.match(unattended, /`assumptions`/, 'the gap goes into `assumptions`');
    assert.match(unattended, c.missing, 'must say what is missing');
    assert.match(unattended, c.notDone, 'must say which part was therefore not done');
    assert.match(unattended, /不写回/, 'still no write-back when unattended');
    // the old branch ended 「…推断…，写进 `assumptions`，不写回」 and then used the inferred value
    assert.ok(!/从站点推断[^，。；]*，?(写进|用)/.test(unattended), 'must not infer from the site and use it');
    assert.ok(!/用 `find_serp_competitors` 推断/.test(unattended), 'must not infer competitors with find_serp_competitors');
    assert.ok(!/(?<!不)推断[^。]*写进 `assumptions`/.test(unattended), 'must not write an inferred value into `assumptions` and carry on');
  });

  test(`${c.slug}: the human-present branch keeps guess → ask → write back`, () => {
    const { present } = step3(c.slug);
    assert.match(present, c.presentKept);
    assert.match(present, /update_project_context/, 'human-present still writes back');
  });

  test(`${c.slug}: nothing else in the skill uses an inferred project value`, () => {
    const doc = read(c.slug);
    assert.ok(!/推断[^。\n]*写进 `assumptions`，不写回/.test(doc), 'no 「推断…写进 assumptions，不写回」 residue');
    // 「不提问」 defaults are only the MCP defaults (market / language), never project information
    assert.match(section(doc, '两种调用'), /项目信息（业务、目标、定位、竞品）缺了不在此列，见「项目上下文」第 3 步/);
    // the hand-back template's `assumptions` says it can carry the missing project information
    assert.match(doc, /"assumptions": \["代替提问用的默认值；缺的项目信息及因此没做的部分"\]/);
    const body = doc.split(/^---\s*$/m).slice(2).join('---');
    assert.ok([...body].length < 5000, 'SKILL.md body stays under 5000 characters');
  });
}

test('competitor-analysis: a caller-named competitor is still analysed unattended', () => {
  const { unattended } = step3('competitor-analysis');
  assert.match(unattended, /只分析调用方点名的那家，照常做/);
  const inputs = section(read('competitor-analysis'), '必需输入');
  assert.match(inputs, /无人值守时用调用方点名的/);
});

test('keyword-research: seeds without business_overview (empty or 「无」) fall back to the key-page head terms', () => {
  const inputs = section(read('keyword-research'), '必需输入');
  assert.match(inputs, /`business_overview` 为空或写着「无」就只取头词/);
});

// Review round 1, S3: a project fact the human explicitly said they do not need is written down as 「无」. The four
// skills read it as "no such information": no inference, no question (also when a human is present), no write-back;
// the hand-back (or the report, when a human is present) says which part was therefore not done.
function step3Lead(slug) {
  const ctx = section(read(slug), '项目上下文');
  const line = ctx.split('\n').find((l) => /^3\.\s/.test(l));
  assert.ok(line, `${slug}: 「项目上下文」 has no step 3`);
  return line;
}

const noneCases = [
  {
    slug: 'keyword-research',
    needs: [/`business_overview`/, /`current_goal`/],
    notDone: [/没法按业务筛种子词/, /没法按目标给机会排优先级/],
  },
  {
    slug: 'seo-audit',
    needs: [/`business_overview`/],
    notDone: [/没法按业务判断哪些发现要紧/],
  },
  {
    slug: 'link-prospecting',
    needs: [/`positioning`/, /竞品/],
    notDone: [/未按主张定角度/, /未挖竞品外链/],
  },
  {
    slug: 'competitor-analysis',
    needs: [/竞品/],
    notDone: [/竞品分析因此没做/],
  },
];

for (const c of noneCases) {
  test(`${c.slug}: a fact written as 「无」 is read as absent — no inference, no question, no write-back, say what was not done`, () => {
    const lead = step3Lead(c.slug);
    assert.match(lead, /写着「无」/, 'step 3 must name the 「无」 case');
    assert.match(lead, /当作没有/, 'read 「无」 as no such information');
    assert.match(lead, /不推断、不问、不写回/, '「无」 means no inference, no question, no write-back');
    assert.match(lead, /人在场、无人值守都一样/, 'same for a present human and an unattended run');
    assert.match(lead, /`assumptions`/, 'what was not done goes into `assumptions`');
    for (const re of c.needs) assert.match(lead, re, 'must name the fact(s) this skill reads');
    for (const re of c.notDone) assert.match(lead, re, 'must say which part was therefore not done');
    // the 「为空」 branches below are the ones that ask / infer; they stay
    const { present } = step3(c.slug);
    assert.match(present, /update_project_context/);
  });
}
