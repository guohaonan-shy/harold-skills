/**
 * The SEO.md parser and the image-directory check for the tests of seo skill text, through the real command line:
 * `dyna seo parse` and `dyna seo scope --image-dir` (they replaced `seo-md.mjs` and `seo-content-scope.mjs`).
 * Writes the text to a temp SEO.md and returns the command's JSON, so a test can ask the same questions it asked the
 * old functions.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDyna } from './dyna-test-bin.mjs';

function seoMdFile(md) {
  const file = join(mkdtempSync(join(tmpdir(), 'seo-md-')), 'SEO.md');
  writeFileSync(file, md);
  return file;
}

function json(r, what) {
  if (r.status !== 0) throw new Error(`${what} exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** `dyna seo parse` on this SEO.md text. */
export function parseSeoMd(md) {
  return json(runDyna(['seo', 'parse', seoMdFile(md)]), 'dyna seo parse');
}

/** `dyna seo scope <SEO.md> --image-dir=<dir>`: is the image directory inside the 内容路径 this SEO.md lists. */
export function imageDirInScope(dir, contentPaths) {
  const md = contentPaths.length ? `# SEO\n\n## 构建与检查\n- 内容路径：${contentPaths.map((c) => `\`${c}\``).join('；')}\n` : '# SEO\n';
  return json(runDyna(['seo', 'scope', seoMdFile(md), `--image-dir=${dir}`]), 'dyna seo scope --image-dir');
}
