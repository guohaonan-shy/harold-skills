/**
 * Tripwire — the `cover` skill (seo group) and the lines that point at it.
 *
 * Spec split-blog-publisher, ticket 03. What an agent running `cover` reads has to agree with what the scripts
 * return and with the files around it: the `SEO.md` keys it names are keys `dyna seo parse` returns, the DESIGN.md it
 * looks for is found the way the ticket says, every reference it points at exists, its description routes only,
 * its body stays under 5000 characters, the plugin READMEs list it and design-modeling's admission table says
 * where a brand's outward-facing image recipes go.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSeoMd } from './dyna-seo-parse.mjs';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');
const COVER_DIR = ['skills', 'seo', 'cover'];

const FILE = read(...COVER_DIR, 'SKILL.md');
const FRONT = FILE.match(/^---\n([\s\S]*?)\n---\n/)[1];
const BODY = FILE.replace(/^---\n[\s\S]*?\n---\n/, '');
const DESCRIPTION = FRONT.match(/^description: (.*)$/m)[1];

test('cover: a model-invocable seo skill whose description routes only (a trigger per branch, no flow or artifact)', () => {
  assert.match(FRONT, /^name: cover$/m);
  assert.doesNotMatch(FRONT, /disable-model-invocation/);
  for (const trigger of ['做封面', '重出封面']) assert.ok(DESCRIPTION.includes(trigger), `description lacks 「${trigger}」: ${DESCRIPTION}`);
  assert.match(DESCRIPTION, /时用/);
  for (const w of ['PNG', 'HTML', 'DESIGN.md', 'SEO.md', '默认出图配方', '1600']) assert.ok(!DESCRIPTION.includes(w), `description mentions 「${w}」: ${DESCRIPTION}`);
});

test('cover: the body stays under 5000 characters', () => {
  assert.ok([...BODY].length < 5000, `body is ${[...BODY].length} characters`);
});

test('cover: every SEO.md key it reads from `images` is one `dyna seo parse` returns, and it runs that command', () => {
  const images = parseSeoMd('# SEO\n').images;
  const named = [...BODY.matchAll(/`images\.(\w+)`/g)].map((m) => m[1]);
  assert.ok(named.length >= 3, 'names the images keys it reads');
  for (const key of new Set(named)) assert.ok(key in images, `images.${key} is not parsed by dyna seo parse`);
  for (const key of ['dir', 'tool', 'coverField', 'designMd']) assert.ok(named.includes(key), `does not read images.${key}`);
  assert.match(BODY, /`dyna seo parse <项目目录>\/SEO\.md`/);
});

test('cover: finds DESIGN.md in the project directory, reads the blog-cover component, and says what a project without a recipe gets', () => {
  assert.ok(BODY.includes('没指定读 `<项目目录>/DESIGN.md`'));
  assert.match(BODY, /`images\.designMd` 指/);
  assert.match(BODY, /Components 章的 `blog-cover` 组件/);
  for (const part of ['logo 路径', '底色', '主体风格', '生图提示词骨架']) assert.ok(BODY.includes(part), `blog-cover field 「${part}」`);
  assert.match(BODY, /人在场问人/);
  assert.match(BODY, /托管时用默认出图配方/);
  assert.match(BODY, /项目没配出图配方，用的默认/);
});

test('cover: the references it points at exist, and the template and crop check carry the pieces the doc relies on', () => {
  const linked = [...BODY.matchAll(/\]\((references\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(linked.length >= 3);
  for (const rel of linked) assert.ok(existsSync(path(...COVER_DIR, rel)), `${rel} is missing`);
  const template = read(...COVER_DIR, 'references', 'cover-template.html');
  for (const piece of ['id="motif"', 'id="grain"', 'canvas', 'color-mix', "get('logo')", "get('bg')", "get('headline')"]) assert.ok(template.includes(piece), `template lacks ${piece}`);
  assert.ok(existsSync(path(...COVER_DIR, 'references', 'crop-check.html')));
  assert.match(BODY, /md5/);
});

test('cover: the plugin READMEs list it and design-modeling places brand image recipes in the Components chapter', () => {
  assert.match(read('README.md'), /`seo-outreach`, `cover` \| SEO · solve/);
  assert.match(read('skills', 'seo', 'README.md'), /`cover`（/);
  const table = read('skills', 'design', 'design-modeling', 'SKILL.md');
  assert.match(table, /博客封面、OG 卡这类品牌对外图的出图配方算 Components 章的组件/);
});

test('cover: nothing in the skill carries a real project’s values', () => {
  const files = ['SKILL.md', 'references/default-recipe.md', 'references/headline.md', 'references/render.md', 'references/cover-template.html', 'references/crop-check.html'];
  for (const f of files) {
    const text = read(...COVER_DIR, ...f.split('/'));
    assert.doesNotMatch(text, /toeflair|tofelair|toefl|#137fec|#0f6fd1|image_generate_blog_cover/i, f);
  }
});

test('cover: every numbered step ends with a completion condition, and the headless browser and its limits are fetched from dyna runtime', () => {
  const steps = BODY.split(/^## /m).filter((s) => /^\d\. /.test(s));
  assert.equal(steps.length, 5, 'five numbered steps');
  for (const s of steps) assert.match(s, /完成条件：/, `step 「${s.split('\n')[0]}」 has no completion condition`);
  const render = read(...COVER_DIR, 'references', 'render.md');
  assert.match(render, /照 `dyna runtime show 浏览器` 的「无头」/);
  assert.match(render, /照『浏览器』（`dyna runtime show 浏览器`）/);
  assert.doesNotMatch(render, /idea-loop:(browser|runtime)/);
});

test('cover: a default recipe is also a verified row the caller writes, so the sentence reaches the PR description', () => {
  const tail = BODY.split('## 交回')[1] ?? '';
  assert.match(tail, /调用方（执行方）[^\n]*`verified`/);
  assert.match(tail, /这一栏进 PR 描述/);
  assert.ok(tail.includes('`封面出图配方 | 默认出图配方 | 项目没配出图配方，用的默认`'), 'the row shape');
  // the route it relies on is the one the implement doc actually has
  assert.match(read('skills', 'engineering', 'implement', 'SKILL.md'), /\| `verified` \| PR 描述 \|/);
});
