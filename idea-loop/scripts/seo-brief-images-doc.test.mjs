/**
 * Pins the sentences that make "seo-brief hands out the cover and the share card once the angle and the title are
 * settled" true in the docs (spec split-blog-publisher, ticket 06): the 「配图」 step sits between step 5 (title and
 * description) and the step that writes the brief out, derives the cover-subject candidates from the angle and the OG
 * headline from the title, calls `cover` and `og`, settles the subject in the same question as the angle when a human
 * is in the session and by recommendation (basis 「AI 照推荐定」) when hosted, falls back to the default recipe with one
 * sentence in the brief, and commits the images on the issue branch; the brief template has the 「配图」 section the
 * `og` skill reads the headline from.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail
 * there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');

const BRIEF = body(read('skills', 'seo', 'seo-brief', 'SKILL.md'));
const OG = body(read('skills', 'seo', 'og', 'SKILL.md'));
const WRITING = body(read('skills', 'seo', 'seo-writing', 'SKILL.md'));
const DRAFT_SPEC = read('skills', 'engineering', 'issue-session', 'references', 'draft-spec.md');

/** The body of `## <title>` (up to the next `## ` heading), or '' when the heading is missing. */
function section(doc, title) {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

const IMAGES = section(BRIEF, '6\\. 配图');

test('seo-brief: a 「配图」 step sits after title and description and before the step that writes the brief out', () => {
  const heads = [...BRIEF.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => `${m[1]}. ${m[2]}`);
  const at = (re) => heads.findIndex((h) => re.test(h));
  const titleStep = at(/内链、title、description/);
  const imagesStep = at(/配图/);
  const writeStep = at(/写进去/);
  assert.ok(imagesStep >= 0, `a 配图 step exists (headings: ${heads.join(' | ')})`);
  assert.ok(titleStep >= 0 && writeStep >= 0);
  assert.equal(imagesStep, titleStep + 1, 'it comes right after the title and description step');
  assert.equal(writeStep, imagesStep + 1, 'it comes right before the step that writes the brief out');
});

test('配图 step: cover-subject candidates come from the angle (each tied to the thesis, with a recommendation), the OG headline from the title', () => {
  assert.match(IMAGES, /封面主体候选[^\n]*角度/);
  assert.match(IMAGES, /封面主体候选[^\n]*论点/);
  assert.match(IMAGES, /封面主体候选[^\n]*推荐/);
  assert.match(IMAGES, /OG 大标题[^\n]*title/);
});

test('配图 step: calls cover and og (as skills)', () => {
  assert.match(IMAGES, /`idea-loop:cover`/);
  assert.match(IMAGES, /`idea-loop:og`/);
});

test('配图 step: a human in the session gets angle and cover subject in one question; hosted, the recommendation decides and the basis is 「AI 照推荐定」', () => {
  assert.match(IMAGES, /人在场[^\n]*一问/);
  assert.match(IMAGES, /不问两次/);
  assert.match(IMAGES, /托管[^\n]*照推荐定/);
  assert.match(IMAGES, /AI 照推荐定：<[^>]+>/);
});

test('seo-brief step 4 points a human in the session at the one question, so the angle is not settled before the subject is offered', () => {
  const s = section(BRIEF, '4\\. 判意图、类型、能补什么');
  const line = s.split('\n').find((l) => /^- \*\*人在场\*\*/.test(l));
  assert.ok(line, 'a 人在场 line in step 4');
  assert.match(line, /封面主体/);
  assert.match(line, /一问/);
  assert.match(line, /第 5 步/);
});

test('配图 step: no recipe configured → default recipe, one sentence in the brief, never blocks', () => {
  assert.match(IMAGES, /项目没配出图配方，用的默认/);
  assert.match(IMAGES, /不阻塞/);
  assert.match(IMAGES, /人在场[^\n]*问[\s\S]*托管[^\n]*默认/, 'same fallback as cover / og: ask when a human is there, default when hosted');
});

test('配图 step: the images are committed on the issue branch together with the spec', () => {
  assert.match(IMAGES, /issue 分支/);
  assert.match(IMAGES, /提交/);
});

test('the brief template has a 「配图」 section after title and description, with subject candidates, the OG headline, and where the images are', () => {
  const tpl = BRIEF.match(/```markdown([\s\S]*?)```/)[1];
  const t = tpl.indexOf('#### title 与 description');
  const i = tpl.indexOf('#### 配图');
  assert.ok(t >= 0 && i > t, '「配图」 comes after 「title 与 description」');
  const sec = tpl.slice(i);
  assert.match(sec, /封面主体候选/);
  assert.match(sec, /选中/);
  assert.match(sec, /OG 大标题/);
  assert.match(sec, /图的位置/);
});

test('og reads the headline from the brief section seo-brief writes (same names)', () => {
  assert.match(OG, /brief「配图」一节写了大标题/);
  assert.match(BRIEF, /#### 配图/);
  assert.match(BRIEF, /OG 大标题/);
});

test('seo-brief intro mentions the cover and share card, and its step references point at the right steps', () => {
  const intro = BRIEF.split('\n## ')[0];
  assert.match(intro, /封面/);
  assert.match(intro, /第 4、7 步/);
});

test('draft-spec lets the images the brief produced into the spec commit', () => {
  const check = DRAFT_SPEC.split('\n').find((l) => /改动只在该在的地方/.test(l));
  assert.ok(check, 'the check line exists');
  assert.match(check, /图片目录/, 'the check allows the brief\'s images');
  const commit = section(DRAFT_SPEC, '提交');
  assert.match(commit, /图片目录/, 'the commit step adds them');
});

test('seo-writing 写: the cover and OG paths the brief recorded go into each language version\'s frontmatter, in the fields 「配图」 names, with the same fallback as cover / og', () => {
  const w = section(WRITING, '4\\. 写');
  const line = w.split('\n').find((l) => /^- \*\*封面和 OG 的字段\*\*/.test(l));
  assert.ok(line, 'a 封面和 OG 的字段 bullet in step 4');
  assert.match(line, /brief「配图」一节/);
  assert.match(line, /图的位置/);
  assert.match(line, /各语言版本[^\n]*frontmatter/);
  assert.match(line, /SEO\.md「配图」节的封面字段、OG 字段/);
  assert.match(line, /人在场[^\n]*问[^\n]*托管[^\n]*同站已有文章[^\n]*找不到就不写/, 'same fallback as cover / og');
  const keys = read('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
  for (const k of ['封面字段', 'OG 字段']) assert.ok(keys.includes(k), `${k} is a key in the SEO.md format doc`);
});

test('seo-writing: the body stays under 5000 characters with the new bullet', () => {
  assert.ok([...WRITING].length < 5000, `${[...WRITING].length} characters`);
});

test('seo-brief: the body stays under 5000 characters', () => {
  assert.ok([...BRIEF].length < 5000, `${[...BRIEF].length} characters`);
});

test('cover and og exist as skills the step can call', () => {
  for (const s of ['cover', 'og']) assert.ok(existsSync(path('skills', 'seo', s, 'SKILL.md')), `${s}/SKILL.md exists`);
});

test('配图 step: a default recipe is also a verified row the caller writes, so the sentence reaches the PR description', () => {
  const line = IMAGES.split('\n').find((l) => /^5\. \*\*没配出图配方\*\*/.test(l));
  assert.ok(line, 'the 没配出图配方 item');
  assert.match(line, /调用方（执行方）[^\n]*`verified`/);
  assert.match(line, /这一栏进 PR 描述/);
  assert.ok(line.includes('`出图配方 | 默认出图配方 | 项目没配出图配方，用的默认`'), 'the row shape');
  assert.match(read('skills', 'engineering', 'implement', 'SKILL.md'), /\| `verified` \| PR 描述 \|/);
});
