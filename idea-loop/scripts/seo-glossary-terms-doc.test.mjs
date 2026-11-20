/**
 * Pins the two SEO-writing terms the project glossary settles — 「写作评委」 and 「出图配方」 — in the text the
 * blog workflow added: the glossary has both entries, the words each entry says to avoid appear nowhere in
 * the SEO skills, their READMEs, the night-mode reference or the design-modeling table, and nobody says a
 * bare 「评委」 on the writing side (a bare 评委 means the design-convergence judge). 「第二评委」 is the
 * `SEO.md` key name and stays.
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see
 * it fail there first. The glossary is always the repo's own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.SEO_DOCS_ROOT ?? join(here, '..');
const GLOSSARY = readFileSync(join(here, '..', '..', 'GLOSSARY.md'), 'utf8');

const entry = (name) => {
  const m = GLOSSARY.match(new RegExp(`^\\*\\*${name}\\*\\*：\\n([^\\n]+)\\n_Avoid_: ([^\\n]+)$`, 'm'));
  return m ? { definition: m[1], avoid: m[2].split(/[,、]\s*/).map((w) => w.replace(/（.*$/, '').trim()).filter(Boolean) } : null;
};

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(md|html|css|js|mjs)$/.test(n) ? [p] : [];
  });

const seoDirs = ['cover', 'og', 'seo-brief', 'seo-setup', 'seo-writing'].map((d) => join(root, 'skills', 'seo', d));
const WRITING_SIDE = [
  ...seoDirs.flatMap(walk),
  join(root, 'skills', 'seo', 'README.md'),
  join(root, 'skills', 'engineering', 'issue-session', 'references', 'night-mode.md'),
];
const WORDS_ONLY = [...WRITING_SIDE, join(root, 'README.md'), join(root, 'skills', 'design', 'design-modeling', 'SKILL.md')];

test('GLOSSARY.md: 写作评委 and 出图配方 are entries, with the old names to avoid', () => {
  const judge = entry('写作评委');
  const recipe = entry('出图配方');
  assert.ok(judge && recipe, 'both entries exist');
  assert.ok(judge.avoid.includes('冷读评委'), `写作评委 avoids 冷读评委: ${judge.avoid}`);
  for (const w of ['封面配方', 'OG 配方', '分享卡配方']) assert.ok(recipe.avoid.includes(w), `出图配方 avoids ${w}: ${recipe.avoid}`);
  assert.match(GLOSSARY, /^- \*\*评委\*\*：/m, 'the bare 评委 is a 歧义词 line, so the writing side must say 写作评委');
});

test('the words the glossary says to avoid appear in none of the files that carry the blog workflow', () => {
  const avoid = [...entry('写作评委').avoid, ...entry('出图配方').avoid];
  const hits = [];
  for (const f of WORDS_ONLY) {
    const text = readFileSync(f, 'utf8');
    for (const w of avoid) if (text.includes(w)) hits.push(`${f.slice(root.length + 1)}: ${w}`);
  }
  assert.deepEqual(hits, []);
});

test('the writing side never says a bare 评委 (only 写作评委 and the 第二评委 key)', () => {
  const hits = [];
  for (const f of WRITING_SIDE) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/(?<!第二)(?<!写作)评委/.test(line)) hits.push(`${f.slice(root.length + 1)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('no bare 配方 on the writing side: it is always 出图配方', () => {
  const hits = [];
  for (const f of WRITING_SIDE) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/(?<!图)配方/.test(line)) hits.push(`${f.slice(root.length + 1)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});
