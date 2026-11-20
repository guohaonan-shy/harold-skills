/**
 * Pins the docs of SEO.md's new keys — 「写作」's lint 配置 / 补充 lint / 第二评委 and the 「配图」 section
 * (图片目录 / 生图工具 / 封面字段 / OG 字段 / DESIGN.md 路径): the format file's template and 「每节读的人」
 * table carry them and say who reads them, the template parses to a value for every key (so a key the doc
 * names and the script does not read, or the other way round, goes red), and seo-setup asks for them and
 * checks the image directory against 内容路径 before it writes it.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see
 * it fail there first.
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

const FORMAT = read('skills', 'seo', 'seo-setup', 'references', 'seo-md.md');
const SETUP_FILE = read('skills', 'seo', 'seo-setup', 'SKILL.md');
const SETUP = SETUP_FILE.split(/^---\s*$/m).slice(2).join('---');
const TEMPLATE = FORMAT.match(/```markdown([\s\S]*?)```/)[1];
const README = read('README.md');

const row = (name) => FORMAT.split('\n').find((l) => l.startsWith(`| ${name} |`)) ?? '';
const section = (doc, title) => {
  const m = doc.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
};

test('seo-md.md: ten sections, the template has 配图 right after 写作 with its five keys', () => {
  assert.match(FORMAT, /十个 `## ` 小节（「分析」可选）/);
  assert.doesNotMatch(FORMAT, /九个 `## ` 小节/);
  const at = (h) => TEMPLATE.indexOf(`\n## ${h}\n`);
  assert.ok(at('写作') > 0 && at('配图') > at('写作') && at('品牌') > at('配图'), '写作 → 配图 → 品牌');
  const images = section(TEMPLATE, '配图');
  for (const key of ['图片目录', '生图工具', '封面字段', 'OG 字段', 'DESIGN.md 路径']) assert.match(images, new RegExp(`^- ${key}：`, 'm'), key);
});

test('seo-md.md: the template of 写作 has the three new keys', () => {
  const writing = section(TEMPLATE, '写作');
  for (const key of ['lint 配置', '补充 lint', '第二评委']) assert.match(writing, new RegExp(`^- ${key}：`, 'm'), key);
});

test('seo-md.md: the template parses to a value for every new key, 无 included (the doc and the script read the same keys)', () => {
  const s = parseSeoMd(TEMPLATE);
  for (const k of ['lintConfig', 'extraLint', 'secondJudge', 'imageDir', 'imageTool', 'coverField', 'ogField', 'designMd']) {
    assert.equal(s.confirmed[k], true, `the template writes ${k}`);
  }
  assert.ok(s.writing.lintConfig && s.writing.extraLint, 'the template shows a lint config and a supplementary lint');
  assert.ok(Object.values(s.images).every(Boolean), 'the template shows a value for every 配图 key');
});

test('seo-md.md: the 每节读的人 table says what the new 写作 keys are and who reads them', () => {
  const r = row('写作');
  for (const key of ['lint 配置', '补充 lint', '第二评委']) assert.ok(r.includes(key), `${key} is in the 写作 row`);
  assert.match(r, /JSON/, 'lint 配置 is a JSON file');
  assert.match(r, /没写[^|]*默认/, 'lint 配置 not written: the defaults');
  assert.match(r, /seo-writing[^|]*改稿循环/, 'the writing loop reads them');
});

test('seo-md.md: the 每节读的人 table has a 配图 row: the keys, the 内容路径 rule, and who reads them', () => {
  const r = row('配图');
  assert.ok(r, 'no 配图 row');
  for (const key of ['图片目录', '生图工具', '封面字段', 'OG 字段', 'DESIGN.md 路径']) assert.ok(r.includes(key), `${key} is in the 配图 row`);
  assert.match(r, /内容路径以内/);
  assert.match(r, /`dyna seo scope --image-dir`/);
  assert.match(r, /封面[^|]*`cover`/);
  assert.match(r, /分享卡[^|]*`og`/);
  assert.match(r, /没有这一节[^|]*无[^|]*空/, 'a missing section, a missing key and 无 all read as empty');
});

test('seo-md.md: each new key is written once in the template, so none repeats an existing key name', () => {
  for (const key of ['lint 配置', '补充 lint', '第二评委', '图片目录', '生图工具', '封面字段', 'OG 字段', 'DESIGN.md 路径']) {
    assert.equal(TEMPLATE.split(`\n- ${key}：`).length - 1, 1, key);
  }
});

test('seo-setup: the writing-check keys and 配图 are inferred, asked and checked through references/writing-images.md', () => {
  assert.ok(SETUP.includes('references/writing-images.md'), 'SKILL.md points at the reference');
  assert.ok(existsSync(path('skills', 'seo', 'seo-setup', 'references', 'writing-images.md')), 'the reference exists');
  assert.match(section(SETUP, '2\\. 读现状，备推荐值'), /写作的检查键、配图[^\n]*writing-images\.md/);
  assert.match(section(SETUP, '3\\. 逐节问人'), /写作的检查键、配图[^\n]*图片目录检查/);
  assert.match(section(SETUP, '4\\. 写 SEO.md'), /九节都在/);
});

test('writing-images.md: a recommendation and a question per key, and the image-directory check before it is written', () => {
  const ref = read('skills', 'seo', 'seo-setup', 'references', 'writing-images.md');
  for (const key of ['lint 配置', '补充 lint', '第二评委', '图片目录', '生图工具', '封面字段', 'OG 字段', 'DESIGN.md 路径']) {
    assert.ok(ref.includes(key), `${key} is covered`);
  }
  const check = section(ref, '图片目录写入前的检查');
  assert.match(check, /dyna seo scope <项目目录>\/SEO\.md --image-dir=/);
  assert.match(check, /inScope/);
  assert.match(check, /不在[^\n]*不写[^\n]*告诉人/, 'outside the scope: not written, the human is told');
  assert.match(ref, /一次最多三个问题/);
});

test('seo-setup: the body stays under 5000 characters, what moved out is reachable by a pointer', () => {
  assert.ok([...SETUP].length < 5000, `${[...SETUP].length} characters`);
  assert.ok(SETUP.includes('references/pick-project.md'));
  assert.ok(existsSync(path('skills', 'seo', 'seo-setup', 'references', 'pick-project.md')));
});

test('README: seo-setup lists the writing-check keys and the 配图 section', () => {
  const line = README.split('\n').find((l) => l.startsWith('| `/idea-loop:seo-setup`')) ?? '';
  assert.match(line, /ten sections/);
  assert.match(line, /补充 lint/);
  assert.match(line, /配图/);
  assert.match(line, /image directory/);
});
