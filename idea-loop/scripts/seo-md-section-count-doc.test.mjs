/**
 * Pins that no seo skill hard-codes how many sections SEO.md has. The section list lives in one place,
 * the format file (skills/seo/seo-setup/references/seo-md.md); a skill that says "读出八节" is a copy of it
 * and goes stale the day a section is added (it did, when 「配图」 came in). The only count a skill may
 * still state is seo-setup's "N节都在" completion check, and that one must equal the number of required
 * sections in the format file's template.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see
 * it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');

const NUM = '[一二三四五六七八九十零两\\d]+';
const DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

const seoSkills = readdirSync(path('skills', 'seo'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path('skills', 'seo', d.name, 'SKILL.md')))
  .map((d) => d.name);

test('no seo skill states a section count right after reading SEO.md', () => {
  const offenders = [];
  for (const name of seoSkills) {
    const body = read('skills', 'seo', name, 'SKILL.md');
    const m = body.match(new RegExp(`读出${NUM}\\s*(个\\s*)?(小)?节`));
    if (m) offenders.push(`${name}: ${m[0]}`);
  }
  assert.deepEqual(offenders, [], 'say "读出各节", not a number: the format file owns the section list');
});

test('the six skills that read SEO.md with `dyna seo parse` still do so, and say 读出各节', () => {
  const readers = ['keyword-clustering', 'keyword-research', 'competitor-analysis', 'link-prospecting', 'seo-audit', 'seo-coach'];
  for (const name of readers) {
    const body = read('skills', 'seo', name, 'SKILL.md');
    assert.match(body, /`dyna seo parse <项目目录>\/SEO\.md` 读出各节/, name);
  }
});

test('seo-setup completion check: "N节都在" equals the required sections in the template', () => {
  const format = read('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
  const template = format.match(/```markdown([\s\S]*?)```/)[1];
  const headings = [...template.matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1]);
  const required = headings.filter((h) => h !== '分析').length;
  const setup = read('skills', 'seo', 'seo-setup', 'SKILL.md');
  const m = setup.match(new RegExp(`(${NUM})节都在`));
  assert.ok(m, 'seo-setup states the completion check');
  const stated = DIGITS[m[1]] ?? Number(m[1]);
  assert.equal(stated, required, `template has ${required} required sections`);
});
