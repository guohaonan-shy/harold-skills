import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, matches } from './seo-content-scope.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'seo-content-scope.mjs');

const SEO_MD = (paths) => `# SEO

## 构建与检查
- 产物目录：\`apps/site/dist\`
${paths === undefined ? '' : `- 内容路径：${paths}\n`}`;

const BLOG_DIR = 'apps/site/src/content/blog/';
const BLOG = `\`${BLOG_DIR}\``;

test('a PR touching a blog post and a .tsx is not content-only, and the .tsx is listed', () => {
  const r = judge(['apps/site/src/content/blog/weeknight-dinners.md', 'apps/site/src/components/Hero.tsx'], [BLOG_DIR]);
  assert.equal(r.contentOnly, false);
  assert.deepEqual(r.outside, ['apps/site/src/components/Hero.tsx']);
});

test('files all under 内容路径 are content-only', () => {
  const r = judge(['apps/site/src/content/blog/a.md', 'apps/site/src/content/blog/img/b.png'], [BLOG_DIR]);
  assert.equal(r.contentOnly, true);
  assert.deepEqual(r.outside, []);
});

test('a .astro, .tsx or .css file counts only when 内容路径 lists it explicitly', () => {
  const css = 'apps/site/src/styles/blog.css';
  assert.equal(judge([css], [BLOG_DIR]).contentOnly, false);
  assert.equal(judge([css], ['apps/site/src/styles/blog.css']).contentOnly, true);
  assert.equal(judge(['apps/site/src/lib/analytics.ts'], ['apps/site/src/lib/analytics.ts']).contentOnly, true);
});

test('globs: * stays inside one directory, ** crosses directories, a glob that names a directory covers what is under it', () => {
  assert.equal(matches('public/robots.txt', ['public/robots.txt']), true);
  assert.equal(matches('public/images/a/b.webp', ['public/images/**']), true);
  assert.equal(matches('public/images/a/b.webp', ['public/images/*.webp']), false, '* does not cross a directory');
  assert.equal(matches('public/images/b.webp', ['public/images/*.webp']), true);
  assert.equal(matches('apps/site/public/llms.txt', ['**/llms.txt']), true);
  assert.equal(matches('llms.txt', ['**/llms.txt']), true);
  assert.equal(matches('public/images/a/b.webp', ['public/images']), true, 'a directory without a slash covers its files');
  assert.equal(matches('public/images-old/b.webp', ['public/images']), false, 'only at a path boundary');
});

test('docs/ and SEO.md are not content: they live in the project directory, a code PR does not carry them', () => {
  assert.equal(judge(['docs/spec/x/x.md'], []).contentOnly, false);
  assert.equal(judge(['SEO.md'], [BLOG_DIR]).contentOnly, false);
  assert.deepEqual(judge(['docs/a.md', 'SEO.md'], [BLOG_DIR]).outside, ['docs/a.md', 'SEO.md']);
});

test('a path that climbs out with .. is never content; a leading ./ is only spelling', () => {
  assert.equal(judge(['content/../src/App.tsx'], ['content']).contentOnly, false);
  assert.equal(judge(['./content/a.md'], ['content']).contentOnly, true);
});

test('an empty change list is not content-only: nothing to judge, nothing to auto-merge', () => {
  assert.deepEqual(judge([], [BLOG_DIR]), { contentOnly: false, files: 0, outside: [], reason: '没有改动文件' });
});

test('CLI: SEO.md + a file list on stdin → JSON; a project without 内容路径 passes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seo-scope-'));
  const withPaths = join(dir, 'with.md');
  const without = join(dir, 'without.md');
  writeFileSync(withPaths, SEO_MD(BLOG));
  writeFileSync(without, SEO_MD());
  const run = (md, files) => spawnSync('node', [script, md, '--files=-'], { input: files.join('\n') + '\n', encoding: 'utf8' });

  const a = run(withPaths, ['apps/site/src/content/blog/a.md', 'apps/site/src/components/Hero.tsx']);
  assert.equal(a.status, 0, a.stderr);
  assert.deepEqual(JSON.parse(a.stdout), { contentOnly: false, files: 2, outside: ['apps/site/src/components/Hero.tsx'] });

  const b = run(without, ['apps/site/src/content/blog/a.md']);
  assert.equal(JSON.parse(b.stdout).contentOnly, false, 'no 内容路径 → the blog post is outside');
  assert.equal(JSON.parse(run(without, ['docs/a.md', 'SEO.md']).stdout).contentOnly, false);
});

test('CLI: --base=<ref> reads the PR from the repo, and a rename counts under its old name too', () => {
  const repo = mkdtempSync(join(tmpdir(), 'seo-scope-repo-'));
  const vcs = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  vcs('init', '-q', '-b', 'main');
  mkdirSync(join(repo, 'apps/site/src/content/blog'), { recursive: true });
  mkdirSync(join(repo, 'apps/site/src/components'), { recursive: true });
  writeFileSync(join(repo, 'apps/site/src/components/Hero.tsx'), 'export const Hero = () => null;\n'.repeat(5));
  writeFileSync(join(repo, 'apps/site/src/content/blog/a.md'), 'a\n');
  vcs('add', '-A');
  vcs('commit', '-q', '-m', 'base');
  vcs('checkout', '-q', '-b', 'pr');
  // a code file moved into the blog directory: only its old name gives it away
  vcs('mv', 'apps/site/src/components/Hero.tsx', 'apps/site/src/content/blog/Hero.tsx');
  writeFileSync(join(repo, 'apps/site/src/content/blog/a.md'), 'a edited\n');
  vcs('add', '-A');
  vcs('commit', '-q', '-m', 'pr');
  const md = join(repo, 'SEO.md');
  writeFileSync(md, SEO_MD(BLOG));
  const r = spawnSync('node', [script, md, '--base=main'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.contentOnly, false);
  assert.deepEqual(out.outside, ['apps/site/src/components/Hero.tsx']);
});

test('CLI: unreadable SEO.md or no source for the file list exits 1 with a reason', () => {
  const r = spawnSync('node', [script, '/nonexistent/SEO.md', '--files=-'], { input: 'a\n', encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.ok(r.stderr.length > 0);
  const dir = mkdtempSync(join(tmpdir(), 'seo-scope-'));
  const md = join(dir, 'SEO.md');
  writeFileSync(md, SEO_MD(BLOG));
  const noSource = spawnSync('node', [script, md], { encoding: 'utf8' });
  assert.equal(noSource.status, 1);
  assert.match(noSource.stderr, /--files|--base/);
});
