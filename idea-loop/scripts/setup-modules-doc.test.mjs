/**
 * Tripwire — setup's 「模块」 asks design → SEO → evaluation (spec setup-modules, #420).
 *
 * - The 「模块」 section lists three parts in this order: design, SEO, evaluation, each named with the skill that decides
 *   whether it is asked (`idea-loop:uiux-imagine`, `idea-loop:seo-scan`, `ai-eval:eval-setup`) and a steps link that opens.
 * - Design's two pieces left the core: no Mobbin row in the preflight table, no "做不做 UI 设计" in the questions, no LFS
 *   line in 「写」; they live in `references/design.md`.
 * - The evaluation steps say `EVAL.md` is at the code repository root and setup does not commit it.
 * - The four device / repo tasks sit in one 「定时任务」 section; the body stays at or under 4500 characters (the plugin line; the 「迁移」 pointer took the room that was left under the old 4000).
 *
 * SETUP_MODULES_DOCS_ROOT points the test at another copy of the plugin (the text before the change) to see it fail first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.SETUP_MODULES_DOCS_ROOT ?? join(here, '..');
const dir = join(root, 'skills', 'engineering', 'setup');
const read = (...p) => readFileSync(join(dir, ...p), 'utf8');
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');
const section = (doc, name) => doc.match(new RegExp(`^## ${name}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))?.[1] ?? '';

const SETUP = body(read('SKILL.md'));

test('「模块」 lists design, SEO, evaluation in that order, each with its skill and an opening steps link', () => {
  const m = section(SETUP, '模块');
  assert.ok(m, 'setup has a 「模块」 section');
  const parts = [
    ['**设计**', 'idea-loop:uiux-imagine', 'references/design.md'],
    ['**SEO**', 'idea-loop:seo-scan', 'references/seo/steps.md'],
    ['**评测**', 'ai-eval:eval-setup', 'references/eval.md'],
  ];
  let last = -1;
  for (const [name, skill, link] of parts) {
    const at = m.indexOf(name);
    assert.ok(at > last, `${name} comes after the previous part`);
    last = at;
    const row = m.slice(at).split('\n')[0];
    assert.ok(row.includes(`\`${skill}\``), `${name} is asked by ${skill}`);
    assert.ok(row.includes(`(${link})`), `${name} points at ${link}`);
    assert.ok(existsSync(join(dir, link)), `${link} exists`);
  }
  assert.match(m, /skill 清单/, 'whether a part is asked is read from the session skill list');
  assert.match(m, /^完成条件：/m);
});

test('design left the core: no Mobbin preflight row, no UI question, no LFS line in 「写」', () => {
  assert.doesNotMatch(read('references', 'preflight-table.md'), /\| Mobbin/);
  assert.doesNotMatch(read('references', 'questions.md'), /做不做 UI 设计/);
  assert.doesNotMatch(section(SETUP, '写'), /LFS/);
  const design = read('references', 'design.md');
  assert.match(design, /Git LFS/);
  assert.match(design, /Mobbin/);
});

test('the evaluation steps say EVAL.md is at the code repository root and setup does not commit it', () => {
  const ev = read('references', 'eval.md');
  assert.match(ev, /`ai-eval:eval-setup`/);
  assert.match(ev, /`EVAL.md`[^\n]*代码仓库根/);
  assert.match(ev, /setup 不替人提交/);
});

test('the four tasks sit in one 「定时任务」 section and the body is at most 4500 characters', () => {
  const t = section(SETUP, '定时任务');
  for (const f of ['replay-runner.md', 'weekly-dreaming.md', 'weekly-triage.md', 'dispatch.md']) assert.ok(t.includes(`references/${f}`), f);
  for (const old of ['规则回放 runner', '每周对账', '每周分拣', '调度']) assert.equal(section(SETUP, old), '', `no separate 「${old}」 section`);
  assert.ok([...SETUP.replace(/^\n/, '')].length <= 4500, `body is ${[...SETUP].length} characters`);
});
