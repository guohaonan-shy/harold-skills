/**
 * Tripwire — the wiki-conventions skill stays short, and everyone who points at one of its sections points at
 * one that exists (docs/spec/wiki-conventions-slim). Same two checks as design-archive-skill-doc.test.mjs,
 * shared through `skill-doc-check.mjs`.
 *
 * 1. The SKILL.md body (frontmatter stripped, UTF-8 characters) is under 5000. Details only some callers need
 *    live in `references/`, one pointer line from the section that owns them.
 * 2. Other skills and agents call the skill by name plus a section title (idea-loop:wiki-conventions 的「X」, written without backticks here so this note is not itself scanned).
 *    Section names are the contract: every title quoted that way must be a heading of the SKILL.md or of one of
 *    its `references/` files. `spec.mjs` quotes one in its error text too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BODY_CHARS, bodyChars, danglingSectionPointers, mdFiles, headings } from './skill-doc-check.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'productivity', 'wiki-conventions');
const allHeadings = () => [join(skillDir, 'SKILL.md'), ...mdFiles(join(skillDir, 'references'))].flatMap((f) => headings(readFileSync(f, 'utf8')));

test('wiki-conventions SKILL.md body is under 5000 characters', () => {
  const n = bodyChars(skillDir);
  assert.ok(n < MAX_BODY_CHARS, `SKILL.md body is ${n} characters; the limit is ${MAX_BODY_CHARS}. Move long material into references/.`);
});

test('every section of wiki-conventions that a skill or agent quotes exists as a heading of its SKILL.md or references/', () => {
  const { seen, bad } = danglingSectionPointers({ pluginRoot, skillDir, skillName: 'wiki-conventions' });
  assert.ok(seen > 0, 'expected the skills and agents to quote at least one wiki-conventions section');
  assert.deepEqual(bad, [], `these wiki-conventions sections do not exist (renamed or moved?):\n${bad.join('\n')}`);
});

test('every section name other files point at is still a heading (any level): section names are the contract', () => {
  const names = ['知识库落地', '文件在不在，就是状态', '人机分工', '目录', '生命周期', '中间产物', '本地忽略', '从平铺布局迁移', 'frontmatter', 'slug 与链接', 'index.md', 'spec 和工单怎么写'];
  const have = headings(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'));
  assert.deepEqual(names.filter((s) => !have.includes(s)), []);
});

test('the body is two parts plus the scratch dir: the second-level headings are exactly 目录, 生命周期, 中间产物', () => {
  let fenced = false;
  const h2 = [];
  for (const line of readFileSync(join(skillDir, 'SKILL.md'), 'utf8').split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const m = !fenced && line.match(/^##\s+(.+?)\s*$/);
    if (m) h2.push(m[1]);
  }
  assert.deepEqual(h2, ['目录', '生命周期', '中间产物']);
});

test('the section spec.mjs sends people to exists', () => {
  const src = readFileSync(join(pluginRoot, 'scripts', 'spec.mjs'), 'utf8');
  const titles = [...src.matchAll(/wiki-conventions 的「([^」]+)」/g)].map((m) => m[1]);
  assert.ok(titles.length > 0);
  const known = allHeadings();
  assert.deepEqual(titles.filter((t) => !known.includes(t)), []);
});
