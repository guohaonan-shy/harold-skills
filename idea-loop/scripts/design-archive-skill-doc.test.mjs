/**
 * Tripwire — the design-archive skill stays short, and everyone who points at one of its sections points at
 * one that exists.
 *
 * 1. The SKILL.md body (frontmatter stripped, counted in UTF-8 characters) is under 5000: the repo rule is
 *    "SKILL.md 主体 < 5000 字"; long reference material lives in the skill's own `references/`.
 * 2. Other skills and agents call the skill by name plus a section title (`idea-loop:design-archive` 的「X」),
 *    never by file path. When a section is renamed or moved, those titles silently go stale. Every title quoted
 *    right after a `idea-loop:design-archive` mention must be a heading of the SKILL.md or of one of its
 *    `references/` files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(pluginRoot, 'skills', 'design', 'design-archive');
const MAX_BODY_CHARS = 5000;

function mdFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return mdFiles(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

/** Everything after the closing `---` of the frontmatter. */
function body(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n/);
  return m ? text.slice(m[0].length) : text;
}

function headings(text) {
  let fenced = false;
  const out = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const m = !fenced && line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

test('design-archive SKILL.md body is under 5000 characters', () => {
  const n = [...body(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'))].length;
  assert.ok(n < MAX_BODY_CHARS, `SKILL.md body is ${n} characters; the limit is ${MAX_BODY_CHARS}. Move long material into references/.`);
});

test('every section of design-archive that a skill or agent quotes exists as a heading of its SKILL.md or references/', () => {
  const known = [join(skillDir, 'SKILL.md'), ...mdFiles(join(skillDir, 'references'))].flatMap((f) => headings(readFileSync(f, 'utf8')));
  const exists = (title) => known.some((h) => h === title || h.startsWith(`${title}：`) || h.startsWith(`${title}（`));

  // `idea-loop:design-archive` 的「A」「B」 / ，看它的「A」到「B」 / （看它的「A」 / 的 `references/x.md`「A」 / 的「A」里的「B」
  const POINTER = /`idea-loop:design-archive`(?:，看它的|（看它的|\s*的\s*(?:`references\/[\w.-]+\.md`)?)((?:「[^」]+」(?:里的|的|、|到|和)?)+)/g;

  const bad = [];
  let seen = 0;
  for (const dir of ['skills', 'agents']) {
    for (const file of mdFiles(join(pluginRoot, dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(POINTER)) {
          for (const [, title] of m[1].matchAll(/「([^」]+)」/g)) {
            seen += 1;
            if (!exists(title)) bad.push(`${relative(pluginRoot, file)}:${i + 1}  「${title}」`);
          }
        }
      });
    }
  }
  assert.ok(seen > 0, 'expected the skills and agents to quote at least one design-archive section');
  assert.deepEqual(bad, [], `these design-archive sections do not exist (renamed or moved?):\n${bad.join('\n')}`);
});
