/**
 * Pins the sentences that make "a SEO issue's spec is settled by recommendation, and the principles the human has
 * stated live in SEO.md" true in the docs: draft-spec's SEO branch in 「跟人定要 grill 的」 and its 「输入」 line,
 * the 内容原则 section in the SEO.md format reference, and seo-setup creating it (format only, no project's own
 * principles).
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail
 * there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

const DRAFT_SPEC = read('skills', 'engineering', 'issue-session', 'references', 'draft-spec.md');
const FORMAT = read('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
const SETUP = read('skills', 'seo', 'seo-setup', 'SKILL.md');

/** The body of `## <title>` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, title) {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

test('draft-spec 输入: a SEO issue also reads SEO.md 「内容原则」, next to the direction skill\'s principles', () => {
  const input = section(DRAFT_SPEC, '输入');
  const lines = input.split('\n').filter((l) => /type:seo/.test(l));
  assert.ok(lines.some((l) => /先用 Skill 工具调这个方向的 agent 调的那个 SEO skill/.test(l)), 'the direction-principles line stays');
  assert.ok(lines.some((l) => /SEO\.md[\s\S]*「内容原则」/.test(l)), 'a type:seo line reads SEO.md 「内容原则」');
});

test('draft-spec has a SEO branch at the top of 「跟人定要 grill 的」, before the push-and-stop line', () => {
  const s = section(DRAFT_SPEC, '跟人定要 grill 的');
  const branch = s.indexOf('type:seo/');
  const stop = s.indexOf('停下等人');
  assert.ok(branch >= 0, 'the SEO branch is there');
  assert.ok(stop > branch, 'the SEO branch comes before the generic push-and-stop line');
});

test('the SEO branch names both conditions: type:seo/* and no 「前端交互」 section', () => {
  const s = section(DRAFT_SPEC, '跟人定要 grill 的');
  assert.match(s, /`type:seo\/\*`/);
  assert.match(s, /没有「前端交互」小节/);
});

test('the SEO branch settles 「待定」 by the recommendation and writes who decided and why', () => {
  const s = section(DRAFT_SPEC, '跟人定要 grill 的');
  assert.match(s, /「待定」[^\n]*照推荐/);
  assert.match(s, /AI 照推荐定：<推荐的理由>/);
});

test('the SEO branch answers 「需要 grill」 itself from the spec\'s conclusions and 「内容原则」, and deletes the mark', () => {
  const s = section(DRAFT_SPEC, '跟人定要 grill 的');
  assert.match(s, /「需要 grill」[^\n]*「内容原则」[^\n]*删掉/);
});

test('the SEO branch commits without pushing or stopping', () => {
  const s = section(DRAFT_SPEC, '跟人定要 grill 的');
  assert.match(s, /不推送、不停下/);
  assert.match(s, /提交/);
});

test('a SEO spec with a 「前端交互」 section goes back to triage like any 「冒出了要人定的」', () => {
  const s = section(DRAFT_SPEC, '跟人定要 grill 的');
  assert.match(s, /有「前端交互」小节[^\n]*issues set <docs> triage/);
});

test('seo-md.md: 「内容原则」 is a section of the format, with its line format and who reads it', () => {
  assert.match(FORMAT, /^## 内容原则\s*$/m, 'the example has the section');
  const example = FORMAT.match(/```markdown([\s\S]*?)```/)[1];
  assert.match(example, /## 内容原则\n- .+（出处：.+）/, 'the example shows one principle with its source');
  assert.match(FORMAT, /\| 内容原则 \|[^\n]*出处[^\n]*起草 SEO spec/);
  assert.match(FORMAT, /十个 `## ` 小节/);
});

test('seo-md.md: who appends a new principle, and that the plugin writes none of its own', () => {
  assert.match(FORMAT, /人以后说的新原则[^\n]*追加/);
  assert.match(FORMAT, /插件只定节名和格式/);
});

test('seo-setup creates the 「内容原则」 section when it writes SEO.md and fills in no principle', () => {
  const s = section(SETUP, '4\\. 写 SEO.md');
  assert.match(s, /内容原则/);
  assert.match(s, /内容由项目自己填/);
});
