/**
 * SEO.md's writing-check keys (「写作」: lint 配置 / 补充 lint / 第二评委) and the 「配图」 section
 * (图片目录 / 生图工具 / 封面字段 / OG 字段 / DESIGN.md 路径): the parse result, `无` read as empty and
 * confirmed, and the check the SEO module runs before writing an image directory (it has to sit inside the
 * 内容路径 an auto-merged SEO PR may touch).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeoMd, imageDirInScope } from './dyna-seo-parse.mjs';

const WRITTEN = `# SEO

## 写作
- 文风：\`docs/reference/voice.md\`
- lint 配置：\`docs/reference/writing-lint.json\`
- 补充 lint：\`node scripts/voice-lint.mjs\`
- 第二评委：\`node scripts/second-judge.mjs\`

## 配图
- 图片目录：\`apps/site/public/images/blog/\`
- 生图工具：\`mcp__imagegen__generate_image\`
- 封面字段：\`cover\`
- OG 字段：\`ogImage\`
- DESIGN.md 路径：\`apps/site/DESIGN.md\`
`;

const NONE = `# SEO

## 写作
- lint 配置：无
- 补充 lint：无
- 第二评委：无

## 配图
- 图片目录：无
- 生图工具：无
- 封面字段：无
- OG 字段：无
- DESIGN.md 路径：无
`;

const UNWRITTEN = `# SEO

## 写作
- 文风：\`docs/reference/voice.md\`

## 配图
- 说明：随便写点什么
`;

const NEW_KEYS = ['lintConfig', 'extraLint', 'secondJudge', 'imageDir', 'imageTool', 'coverField', 'ogField', 'designMd'];
const EMPTY_IMAGES = { dir: null, tool: null, coverField: null, ogField: null, designMd: null };

test('SEO.md 写作: lint 配置, 补充 lint and 第二评委 read as their values', () => {
  const w = parseSeoMd(WRITTEN).writing;
  assert.equal(w.lintConfig, 'docs/reference/writing-lint.json');
  assert.equal(w.extraLint, 'node scripts/voice-lint.mjs');
  assert.equal(w.secondJudge, 'node scripts/second-judge.mjs');
  assert.equal(w.voice, 'docs/reference/voice.md', 'the existing keys are untouched');
});

test('SEO.md 配图: every key reads as its value', () => {
  assert.deepEqual(parseSeoMd(WRITTEN).images, {
    dir: 'apps/site/public/images/blog/',
    tool: 'mcp__imagegen__generate_image',
    coverField: 'cover',
    ogField: 'ogImage',
    designMd: 'apps/site/DESIGN.md',
  });
});

test('SEO.md: 无 on a new key reads as empty and confirmed', () => {
  const s = parseSeoMd(NONE);
  assert.deepEqual([s.writing.lintConfig, s.writing.extraLint, s.writing.secondJudge], [null, null, null]);
  assert.deepEqual(s.images, EMPTY_IMAGES);
  for (const k of NEW_KEYS) assert.equal(s.confirmed[k], true, `${k} 写了无，是已确认`);
});

test('SEO.md: a new key that was never written reads as empty and unconfirmed; so does a missing 配图 section', () => {
  for (const md of [UNWRITTEN, '# SEO\n']) {
    const s = parseSeoMd(md);
    assert.deepEqual([s.writing.lintConfig, s.writing.extraLint, s.writing.secondJudge], [null, null, null]);
    assert.deepEqual(s.images, EMPTY_IMAGES);
    for (const k of NEW_KEYS) assert.equal(s.confirmed[k], false, `${k} 没写，是未确认`);
  }
});

test('SEO.md: a key with an empty value is not written; the keys written do not leak into each other', () => {
  const s = parseSeoMd('## 写作\n- 补充 lint：\n- 第二评委：`./judge.sh --strict`\n\n## 配图\n- 封面字段：`cover`\n');
  assert.equal(s.writing.extraLint, null);
  assert.equal(s.confirmed.extraLint, false);
  assert.equal(s.writing.secondJudge, './judge.sh --strict');
  assert.equal(s.images.coverField, 'cover');
  assert.equal(s.images.ogField, null);
  assert.equal(s.confirmed.coverField, true);
  assert.equal(s.confirmed.ogField, false);
});

test('SEO.md: the existing confirmed keys keep their meaning', () => {
  const s = parseSeoMd(WRITTEN);
  assert.equal(s.confirmed.competitors, false);
  assert.equal(s.confirmed.brandTerms, false);
});

const CONTENT = ['apps/site/src/content/blog/', 'apps/site/public/images/**'];

test('image directory: inside 内容路径 passes (by glob, by directory)', () => {
  assert.equal(imageDirInScope('apps/site/public/images/blog/', CONTENT).inScope, true, 'under a ** glob');
  assert.equal(imageDirInScope('apps/site/public/images', CONTENT).inScope, true, 'the directory the glob names');
  assert.equal(imageDirInScope('./apps/site/src/content/blog/img', CONTENT).inScope, true, 'under a listed directory, ./ is spelling');
});

test('image directory: outside 内容路径 is reported with the directory and why', () => {
  const r = imageDirInScope('apps/site/src/assets/blog', CONTENT);
  assert.equal(r.inScope, false);
  assert.equal(r.dir, 'apps/site/src/assets/blog');
  assert.match(r.reason, /内容路径/);
  assert.equal(imageDirInScope('apps/site/public', CONTENT).inScope, false, 'a directory wider than the scope is outside');
  assert.equal(imageDirInScope('apps/site/public/images/blog', []).inScope, false, 'no 内容路径 written: nothing counts');
  assert.equal(imageDirInScope('docs/assets', []).inScope, false, 'docs/ is in the project directory, not the code repository: it does not count by itself');
  assert.equal(imageDirInScope('../elsewhere', CONTENT).inScope, false, 'climbing out is never inside');
  assert.equal(imageDirInScope('', CONTENT).inScope, false, 'no directory is not inside');
});

test('CLI: --image-dir prints the verdict and the content paths it judged against as JSON', () => {
  const outside = imageDirInScope('apps/site/src/assets/blog', CONTENT);
  assert.equal(outside.inScope, false);
  assert.deepEqual(outside.contentPaths, CONTENT);
});
