#!/usr/bin/env node
/**
 * Whether a PR only changes content. An SEO change that stays inside the project's blog, images,
 * `robots.txt`, sitemap or `llms.txt` can be merged without a person (decision-rules「护栏」); one that
 * touches a component, a template or a style cannot. This script is the judge for "stays inside".
 *
 * The content scope is the globs under `内容路径` in SEO.md's 构建与检查 section, nothing else: `docs/`
 * and `SEO.md` live in the project directory in home, not in the code repository, so a code PR never
 * carries them. A changed file counts only when it matches one of them: a `.astro`, `.tsx` or `.css`
 * file is content only when 内容路径 lists it. A glob is a path relative to the repo root: `*` stays
 * inside one directory, `**` crosses directories, `?` is one character, and a path that names a
 * directory (with or without a trailing `/`) covers everything under it. A path that climbs out with
 * `..` never matches. A change list with no files is not content-only: there is nothing to judge.
 *
 * The file list comes from `--files=<file>` (one path per line; `-` is stdin), or from the repo with
 * `--base=<ref>` (`git diff --name-only --no-renames <ref>...HEAD` in the current directory: a rename
 * is listed under both names, so a code file moved into the blog directory is still caught).
 *
 * Usage: node seo-content-scope.mjs <SEO.md> (--files=<file|-> | --base=<ref>)
 *   → { "contentOnly": true|false, "files": <n>, "outside": ["<changed file not in scope>", ...] }
 *     (a change list with no files adds "reason")
 * Exit: 0 = judged (either way; read `contentOnly`), 1 = unreadable SEO.md, no file list, or git failed (reason on stderr).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readSeoMd } from './seo-md.mjs';

const escape = (c) => c.replace(/[.+^${}()|[\]\\]/g, '\\$&');

/** One glob as a regex over a whole path. */
function globRegex(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        out += '(?:.*/)?'; // `**/` also matches nothing: **/llms.txt is llms.txt too
      } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += escape(c);
  }
  return new RegExp(`^${out}$`);
}

const clean = (p) => String(p).trim().replace(/^(?:\.\/)+/, '');
const climbs = (p) => p.split('/').includes('..') || p.startsWith('/');

/** Does `file` match one of `globs`, itself or through a directory above it? */
export function matches(file, globs) {
  const path = clean(file);
  if (climbs(path)) return false;
  const parts = path.split('/');
  const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  return globs.map((g) => clean(g).replace(/\/+$/, '')).filter(Boolean).some((g) => {
    const re = globRegex(g);
    return candidates.some((c) => re.test(c));
  });
}

/** The changed files outside the content scope, and the verdict. */
export function judge(files, contentPaths) {
  const list = [...new Set(files.map(clean).filter(Boolean))];
  if (!list.length) return { contentOnly: false, files: 0, outside: [], reason: '没有改动文件' };
  const outside = list.filter((f) => !matches(f, contentPaths));
  return { contentOnly: outside.length === 0, files: list.length, outside };
}

function changedFiles(argv) {
  const files = argv.find((a) => a.startsWith('--files='))?.slice('--files='.length);
  const base = argv.find((a) => a.startsWith('--base='))?.slice('--base='.length);
  if (files) return readFileSync(files === '-' ? 0 : files, 'utf8').split('\n');
  if (base) return execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');
  throw new Error('usage: seo-content-scope.mjs <SEO.md> (--files=<file|-> | --base=<ref>)');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [seoMd, ...rest] = process.argv.slice(2);
    if (!seoMd) throw new Error('usage: seo-content-scope.mjs <SEO.md> (--files=<file|-> | --base=<ref>)');
    const { build } = readSeoMd(seoMd);
    console.log(JSON.stringify(judge(changedFiles(rest), build.contentPaths)));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
