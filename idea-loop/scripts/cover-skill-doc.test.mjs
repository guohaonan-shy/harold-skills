/**
 * Tripwire — the `cover` skill (seo group) and the lines that point at it.
 *
 * Spec split-blog-publisher, ticket 03. What an agent running `cover` reads has to agree with what the scripts
 * return and with the files around it: the `SEO.md` keys it names are keys `seo-md.mjs` parses, the DESIGN.md it
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
import { parseSeoMd } from './seo-md.mjs';

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
  for (const w of ['PNG', 'HTML', 'DESIGN.md', 'SEO.md', '默认配方', '1600']) assert.ok(!DESCRIPTION.includes(w), `description mentions 「${w}」: ${DESCRIPTION}`);
});

test('cover: the body stays under 5000 characters', () => {
  assert.ok([...BODY].length < 5000, `body is ${[...BODY].length} characters`);
});

test('cover: every SEO.md key it reads from `images` is one parseSeoMd returns, and it runs seo-md.mjs', () => {
  const images = parseSeoMd('# SEO\n').images;
  const named = [...BODY.matchAll(/`images\.(\w+)`/g)].map((m) => m[1]);
  assert.ok(named.length >= 3, 'names the images keys it reads');
  for (const key of new Set(named)) assert.ok(key in images, `images.${key} is not parsed by seo-md.mjs`);
  for (const key of ['dir', 'tool', 'coverField', 'designMd']) assert.ok(named.includes(key), `does not read images.${key}`);
  assert.match(BODY, /node S\/seo-md\.mjs SEO\.md/);
  assert.ok(existsSync(path('scripts', 'seo-md.mjs')));
});

test('cover: finds DESIGN.md with git ls-files, reads the blog-cover component, and says what a project without a recipe gets', () => {
  assert.ok(BODY.includes("git ls-files | grep -i 'DESIGN.md$'"));
  assert.match(BODY, /`images\.designMd` 指/);
  assert.match(BODY, /Components 章的 `blog-cover` 组件/);
  for (const part of ['logo 路径', '底色', '主体风格', '生图提示词骨架']) assert.ok(BODY.includes(part), `blog-cover field 「${part}」`);
  assert.match(BODY, /人在场问人/);
  assert.match(BODY, /托管时用默认配方/);
  assert.match(BODY, /项目没配封面配方，用的默认/);
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
  assert.match(read('README.md'), /`seo-check`, `cover` \| SEO · solve/);
  assert.match(read('skills', 'seo', 'README.md'), /`cover`（/);
  const table = read('skills', 'design', 'design-modeling', 'SKILL.md');
  assert.match(table, /博客封面、OG 卡这类品牌对外图的配方算 Components 章的组件/);
});

test('cover: nothing in the skill carries a real project’s values', () => {
  const files = ['SKILL.md', 'references/default-recipe.md', 'references/headline.md', 'references/render.md', 'references/cover-template.html', 'references/crop-check.html'];
  for (const f of files) {
    const text = read(...COVER_DIR, ...f.split('/'));
    assert.doesNotMatch(text, /toeflair|tofelair|toefl|#137fec|#0f6fd1|image_generate_blog_cover/i, f);
  }
});
