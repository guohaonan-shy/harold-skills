/**
 * Pins that the two plugin descriptions tell a person how the blog workflow goes (spec split-blog-publisher,
 * ticket 07): brief with images → writing loop → publish; the two image skills (`cover`, `og`); the writing
 * lint; and what a project writes to use it (`SEO.md` 「写作」 / 「配图」 keys, `DESIGN.md` components).
 * The files, scripts and keys the sections name are checked to exist, so a rename in one place that the
 * descriptions miss turns this red.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it
 * fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const readIf = (...p) => (existsSync(join(root, ...p)) ? readFileSync(join(root, ...p), 'utf8') : '');

const README = readIf('README.md');
const SEO_README = readIf('skills', 'seo', 'README.md');

/** The body of `<hashes> <heading prefix>…` up to the next heading of the same or a higher level. */
function section(doc, hashes, headingStart) {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${hashes} ${headingStart}`));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const level = hashes.length;
  const end = rest.findIndex((l) => {
    const m = /^(#{1,6}) /.exec(l);
    return m && m[1].length <= level;
  });
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

const BLOG = section(README, '###', 'The blog workflow');
const SEO_BLOG = section(SEO_README, '##', '博客 workflow');

test('idea-loop/README.md has a blog workflow section with the three steps and the two image skills', () => {
  assert.ok(BLOG, 'a "### The blog workflow" section exists');
  assert.match(BLOG, /\*\*Brief, with images\*\*[\s\S]*`idea-loop:cover`[\s\S]*`idea-loop:og`/);
  assert.match(BLOG, /\*\*Draft, then a revision loop\*\*[\s\S]*`dyna seo writing lint`/);
  assert.match(BLOG, /\*\*Publish\*\*[\s\S]*`dyna seo check`/);
});

test("the README says a `premise` goes back to triage with the writing judge's words, in night mode too", () => {
  assert.match(BLOG, /`premise`/);
  assert.match(BLOG, /back to triage with the writing judge's own words/);
  assert.match(BLOG, /night mode/);
  assert.match(BLOG, /references\/night-mode\.md/);
});

test('the README names what a project writes: the 写作 and 配图 keys of SEO.md and the two DESIGN.md components', () => {
  for (const k of ['lint 配置', '补充 lint', '第二评委', '`SEO.md` 「配图」', '`blog-cover`', '`og-card`', 'DESIGN.md']) {
    assert.ok(BLOG.includes(k), `README blog section names ${k}`);
  }
  assert.match(BLOG, /skills\/engineering\/setup\/references\/seo\/seo-md\.md/);
});

test('the README architecture tree lists the writing loop tripwires; the lint itself is `dyna seo writing lint`, no script', () => {
  assert.doesNotMatch(README, /writing-lint\.mjs/);
  assert.match(README, /├── seo-writing-loop-doc\.test\.mjs /);
  assert.match(README, /├── seo-blog-workflow-readme-doc\.test\.mjs /);
});

test('the skills table lists cover and og, and the writing lint under seo-writing', () => {
  assert.match(README, /\| `idea-loop:seo-brief`, `seo-writing`, `seo-outreach`, `cover` \| SEO · solve \|[^\n]*`dyna seo writing lint`/);
  assert.match(README, /\| `idea-loop:og` \| SEO · solve \|/);
});

test('skills/seo/README.md has the same workflow, the project keys, and lists cover, og and the lint in the 解决 row', () => {
  assert.ok(SEO_BLOG, 'a "## 博客 workflow" section exists');
  assert.match(SEO_BLOG, /1\. \*\*brief 出图\*\*[\s\S]*`cover`[\s\S]*`og`/);
  assert.match(SEO_BLOG, /2\. \*\*写作循环\*\*[\s\S]*`dyna seo writing lint`/);
  assert.match(SEO_BLOG, /评论放写作评委原话/);
  assert.match(SEO_BLOG, /night-mode\.md/);
  for (const k of ['lint 配置', '补充 lint', '第二评委', '「配图」', '`blog-cover`', '`og-card`']) {
    assert.ok(SEO_BLOG.includes(k), `seo README blog section names ${k}`);
  }
  const solve = SEO_README.split('\n').find((l) => l.startsWith('| 解决 |')) ?? '';
  assert.match(solve, /`cover`/);
  assert.match(solve, /`og`/);
  assert.match(solve, /`dyna seo writing lint`/);
  assert.doesNotMatch(SEO_README, /\.mjs\b/);
});

test('every skill, script and SEO.md key the blog sections name exists', () => {
  for (const f of [
    ['skills', 'seo', 'cover', 'SKILL.md'],
    ['skills', 'seo', 'og', 'SKILL.md'],
    ['skills', 'engineering', 'issue-session', 'references', 'night-mode.md'],
    ['skills', 'engineering', 'setup', 'references', 'seo', 'seo-md.md'],
  ]) {
    assert.ok(existsSync(join(root, ...f)), `${f.join('/')} exists`);
  }
  const format = readIf('skills', 'engineering', 'setup', 'references', 'seo', 'seo-md.md');
  for (const k of ['lint 配置', '补充 lint', '第二评委', '## 配图']) assert.ok(format.includes(k), `the format file has ${k}`);
});
