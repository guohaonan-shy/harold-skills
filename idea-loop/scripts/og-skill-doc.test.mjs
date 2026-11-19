/**
 * Tripwire — the `og` skill (OG share cards) says what the code and the project's files actually provide.
 *
 * Spec split-blog-publisher, ticket 04. What is pinned: the description routes only and carries the three triggers; the
 * body stays under 5000 characters; the SEO.md keys the skill reads exist in the parser; every script it names exists;
 * the layouts the docs name are the templates on disk and the default is one of them; a project with no OG recipe is told
 * so in the handback; the templates hold no color literals (every color comes in as a token, so no project's brand can be
 * baked in); both READMEs list the skill; the layout notes keep no copy of the default title sizes (the render script
 * holds them); the no-browser exit tells the agent to load the browser skill with the Skill tool.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail there
 * first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSeoMd } from './seo-md.mjs';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (...p) => join(root, ...p);
const read = (...p) => readFileSync(path(...p), 'utf8');
const body = (md) => md.split(/^---\s*$/m).slice(2).join('---');

const SKILL = read('skills', 'seo', 'og', 'SKILL.md');
const LAYOUTS = read('skills', 'seo', 'og', 'references', 'layouts.md');
const ASSETS = path('skills', 'seo', 'og', 'assets');
const onDisk = () => readdirSync(ASSETS).filter((f) => f.endsWith('.html') && !f.startsWith('_')).map((f) => f.slice(0, -5)).sort();

test('description routes only: a trigger for each branch, no flow or artifact', () => {
  const d = SKILL.match(/^description: (.*)$/m)[1];
  for (const trigger of ['做 OG', '分享卡', '重做 OG']) assert.ok(d.includes(trigger), `description lacks 「${trigger}」: ${d}`);
  assert.match(d, /时用/);
  for (const w of ['人在场时', '发现清单', '草稿箱', '表单', '报告', 'PNG', 'HTML', 'DESIGN.md']) assert.ok(!d.includes(w), `description mentions 「${w}」`);
  assert.ok(!/^disable-model-invocation:/m.test(SKILL), 'the model has to be able to call it: seo-brief and seo-writing do');
  assert.match(SKILL, /^name: og$/m);
});

test('the body is under 5000 characters', () => {
  assert.ok([...body(SKILL)].length < 5000, `${[...body(SKILL)].length} characters`);
});

test('the SEO.md keys it reads are keys the parser returns, and the skill uses their names', () => {
  const parsed = parseSeoMd('## 配图\n- 图片目录：`a/`\n- OG 字段：`ogImage`\n- DESIGN.md 路径：`DESIGN.md`\n');
  for (const k of ['dir', 'ogField', 'designMd']) {
    assert.ok(k in parsed.images, `parseSeoMd has no images.${k}`);
    assert.ok(SKILL.includes(k), `SKILL.md does not name images.${k}`);
  }
});

test('every script the skill names exists, and the reference files it points at exist', () => {
  for (const script of ['seo-md.mjs', 'og-render.mjs']) {
    assert.ok(SKILL.includes(script), `SKILL.md does not name ${script}`);
    assert.ok(existsSync(path('scripts', script)), `${script} is missing`);
  }
  for (const ref of ['references/layouts.md', 'references/templates.md']) {
    assert.ok(SKILL.includes(ref), `SKILL.md does not point at ${ref}`);
    assert.ok(existsSync(path('skills', 'seo', 'og', ref)), `${ref} is missing`);
  }
  assert.match(SKILL, /og-render\.mjs md5/, 'the cache check is a step');
});

test('the layouts the docs name are the templates on disk (2 to 3), and the default is one of them', () => {
  const layouts = onDisk();
  assert.ok(layouts.length >= 2 && layouts.length <= 3, layouts.join(','));
  const named = [...LAYOUTS.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]).sort();
  assert.deepEqual(named, layouts, 'references/layouts.md table vs assets/*.html');
  const def = SKILL.match(/没指定用 `(\w+)`/);
  assert.ok(def, 'SKILL.md does not name the default layout');
  assert.ok(layouts.includes(def[1]), `default ${def[1]} is not a layout`);
});

test('a project with no OG recipe is told so, and a missing image directory or field is looked up from the other articles of the site, and when it cannot be found the PNG waits in .tmp/og', () => {
  assert.match(SKILL, /项目没配 OG 配方，用的默认/);
  assert.match(SKILL, /托管时看同站已有文章里图片引用的目录/);
  assert.match(SKILL, /\.tmp\/og\//);
  assert.match(SKILL, /人在场就问/);
});

test('the templates carry no color literals: every color comes in as a token', () => {
  const files = readdirSync(ASSETS).filter((f) => /\.(html|css|js)$/.test(f));
  const hits = [];
  for (const f of files) {
    readFileSync(join(ASSETS, f), 'utf8').split('\n').forEach((line, i) => {
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(line)) hits.push(`${f}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('the plugin README and the seo group README both list og', () => {
  assert.match(read('README.md'), /`og`/);
  assert.match(read('skills', 'seo', 'README.md'), /`og`/);
});

test('the layout notes keep no copy of the default title sizes, and point at the render script that holds them', () => {
  assert.ok(!/字号（最大/.test(LAYOUTS), 'layouts.md has a title-size column');
  assert.ok(!/\d+\s*→\s*\d+/.test(LAYOUTS), 'layouts.md lists a title-size range');
  assert.match(LAYOUTS, /og-render\.mjs/);
  assert.match(LAYOUTS, /TITLE_SIZE/);
  assert.match(read('scripts', 'og-render.mjs'), /const TITLE_SIZE = /, 'the script no longer holds the sizes');
});

test('with no browser available, the skill says to load the browser skill with the Skill tool', () => {
  assert.match(SKILL, /用 Skill 工具调 `idea-loop:browser`/);
});

test('a default recipe is also a verified row the caller writes, so the sentence reaches the PR description', () => {
  const tail = SKILL.split('## 6.')[1] ?? '';
  assert.match(tail, /调用方（执行方）[^\n]*`verified`/);
  assert.match(tail, /这一栏进 PR 描述/);
  assert.ok(tail.includes('`分享卡配方 | 默认配方 | 项目没配 OG 配方，用的默认`'), 'the row shape');
  assert.match(read('skills', 'engineering', 'implement', 'SKILL.md'), /\| `verified` \| PR 描述 \|/);
});
