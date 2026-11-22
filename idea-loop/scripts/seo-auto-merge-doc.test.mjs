/**
 * Pins the sentences that make "只改内容的 SEO PR 由 Claude 合并" true in the docs: the SEO exception in
 * decision-rules「护栏」 (three checkable conditions + the revert PR, any one failing goes back to "只由人定"),
 * pr-review's SEO branch after "交审核报告" (condition: `type:seo/*`, the three conditions, a 上线自查的网址 section;
 * otherwise stop as before) with its detail in pr-review's own references, merge.md naming the one exception to
 * "合并只由人说", the PR description rule that an SEO issue writes 上线自查的网址, and 内容路径 in SEO.md's format
 * and the SEO module's inference.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => (existsSync(path(...p)) ? readFileSync(path(...p), 'utf8') : '');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');
const section = (doc, title) => doc.split(/^#{2,3} /m).find((s) => s.startsWith(title)) ?? '';

const RULES = body(read('skills', 'productivity', 'decision-rules', 'SKILL.md'));
const REVIEW = body(read('skills', 'engineering', 'pr-review', 'SKILL.md'));
const AUTO = read('skills', 'engineering', 'pr-review', 'references', 'seo-auto-merge.md');
const MERGE = read('skills', 'engineering', 'pr-review', 'references', 'merge.md');
const PR = body(read('skills', 'engineering', 'pr', 'SKILL.md'));
const DESCRIPTION = read('skills', 'engineering', 'pr', 'references', 'description.md');
const FORMAT = read('skills', 'engineering', 'setup', 'references', 'seo', 'seo-md.md');
const SETUP = read('skills', 'engineering', 'setup', 'references', 'seo', 'steps.md');

test('decision-rules 护栏 has an SEO exception written as three checkable conditions', () => {
  const guard = section(RULES, '护栏');
  assert.match(guard, /type:seo\/\*/);
  assert.match(guard, /REVIEW\.md/, 'condition 1 names REVIEW.md checks');
  assert.match(guard, /dyna seo check/, 'condition 1 names the seo check');
  assert.match(guard, /两轴没有阻塞项/, 'condition 2');
  assert.match(guard, /dyna seo scope/, 'condition 3 is judged by the script');
  assert.match(guard, /内容路径/);
  assert.match(guard, /缺一条[^\n]*只由人定/, 'a missing condition goes back to 只由人定');
});

test('decision-rules 护栏 lets Claude merge the revert PR a failed post-deploy check opens', () => {
  const guard = section(RULES, '护栏');
  assert.match(guard, /revert PR/);
  assert.match(guard, /上线自查/);
});

test('the five old guardrails are still there and the exception frees merging only', () => {
  const guard = section(RULES, '护栏');
  for (const item of ['术语', '动生产数据', '真实支付', '对外发布', '合并改了代码的 PR']) assert.match(guard, new RegExp(item), item);
  assert.match(guard, /只放开「?合并/, 'the exception says it frees merging only');
});

test('pr-review: after 交审核报告 an SEO branch, pointing at its reference; merging stays with the human otherwise', () => {
  const next = section(REVIEW, '一轮之后往哪走');
  assert.match(next, /type:seo\/\*/);
  assert.match(next, /references\/seo-auto-merge\.md/);
  assert.match(next, /自动合并/);
  assert.match(next, /停下，人读报告、追问、说合并/, 'the ordinary way is unchanged');
});

test('seo-auto-merge.md: when it applies, the three conditions, the 上线自查的网址 section, what it does, and when it stops', () => {
  assert.ok(AUTO, 'references/seo-auto-merge.md is missing');
  assert.match(AUTO, /type:seo\/\*/);
  assert.match(AUTO, /dyna seo check/);
  assert.match(AUTO, /dyna seo scope/);
  assert.match(AUTO, /--base=/);
  assert.match(AUTO, /dyna pr body get [^\n]*live-check/, 'reads the section back with dyna pr body get');
  assert.match(AUTO, /上线自查的网址/);
  assert.match(AUTO, /没有[^\n]*(不自动合并|停下)/, 'no section → no auto-merge');
  assert.match(AUTO, /merge\.md/, 'merges the way merge.md says');
  assert.match(AUTO, /已自动合并/, 'the report and the push say so');
  assert.match(AUTO, /review loop[^\n]*归档|归档[^\n]*review loop/, 'the review loop is archived as usual');
  assert.match(AUTO, /deliver\.md/, 'the report is written as usual first');
  assert.match(AUTO, /任一|缺一|有一条不满足|任何一条/, 'one failing condition stops');
  assert.doesNotMatch(AUTO, /每个 PR/, 'one issue has one PR: no several-PR rule');
});

test('merge.md: 人说合并 is still the way in, with the SEO exception named', () => {
  const head = MERGE.split('\n').slice(0, 6).join('\n');
  assert.match(head, /人在会话里明确说合并/);
  assert.match(head, /seo-auto-merge\.md/);
});

test('the PR description rules say an SEO issue writes 上线自查的网址, and what a line looks like', () => {
  assert.match(PR, /上线自查的网址/);
  assert.match(PR, /live-check/);
  assert.match(PR, /type:seo\/\*/);
  assert.match(DESCRIPTION, /上线自查的网址/);
  assert.match(DESCRIPTION, /目标词/);
  assert.match(DESCRIPTION, /没有[^\n]*(不自动合并|不会自动合并)/);
});

test('SEO.md format: 内容路径 sits in 构建与检查, read by dyna seo scope, written with globs in backticks', () => {
  assert.match(FORMAT, /- 内容路径：/);
  assert.match(FORMAT, /\| 构建与检查 \|[^\n]*内容路径[^\n]*dyna seo scope/);
});

test('the SEO module infers 内容路径 and asks the human to confirm it', () => {
  assert.match(SETUP, /内容路径/);
  const step = section(SETUP, '3. 逐节问人');
  assert.match(step, /内容路径/, 'asked in the section-by-section step');
});
