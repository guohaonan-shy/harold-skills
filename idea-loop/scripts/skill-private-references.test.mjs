/**
 * Tripwire for idea-loop/AGENTS.md「参考资料归谁」: a skill's `references/` are that skill's own
 * detail, read only by it and the agents it starts. Another skill that needs the same text means
 * the text is a capability of its own — promote it to a skill, or move it into the skill that really
 * uses it, and call it by name.
 *
 * Mechanical form: in a skill's SKILL.md or its own references, "`idea-loop:<other>` 的 `references/…`"
 * or a path through `skills/<category>/<other>/references/` is a read of that other skill's private
 * references. (A skill that says "read it, then its `references/x.md` for the long case" is routing
 * you through its own body and is not this pattern.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = join(pluginRoot, 'skills');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Every skill directory: `skills/<category>/<slug>/` holding a SKILL.md. */
function skillDirs() {
  const dirs = [];
  for (const cat of readdirSync(skillsRoot)) {
    const catDir = join(skillsRoot, cat);
    if (!statSync(catDir).isDirectory()) continue;
    for (const slug of readdirSync(catDir)) {
      if (existsSync(join(catDir, slug, 'SKILL.md'))) dirs.push({ slug, dir: join(catDir, slug) });
    }
  }
  return dirs;
}

/** Other skills whose private `references/` this text reads, as `[otherSlug, excerpt]`. */
export function foreignReferenceReads(text, ownSlug) {
  const hits = [];
  // "`idea-loop:<other>` 的 `references/…`"
  const byName = /idea-loop:([a-z][a-z0-9-]*)`?\s*的\s*`?\[?`?references\/[\w./-]*/g;
  for (const m of text.matchAll(byName)) {
    if (m[1] !== ownSlug) hits.push([m[1], m[0]]);
  }
  // a path through another skill's directory
  const byPath = /skills\/[a-z]+\/([a-z][a-z0-9-]*)\/references\//g;
  for (const m of text.matchAll(byPath)) {
    if (m[1] !== ownSlug) hits.push([m[1], m[0]]);
  }
  return hits;
}

test('foreignReferenceReads: names a skill reading another skill\'s references', () => {
  const text = '做法见 `idea-loop:uiux-refine` 的 `references/freeze.md` 的「冻结之后的设计变更」。';
  assert.deepEqual(foreignReferenceReads(text, 'implement').map(([slug]) => slug), ['uiux-refine']);
  assert.deepEqual(foreignReferenceReads(text, 'uiux-refine'), []);
});

test('foreignReferenceReads: a skill name in one sentence and references/ in the next is not a read', () => {
  const text = '用 Skill 工具调 `idea-loop:pr`。参考 `references/review-standards.md`。';
  assert.deepEqual(foreignReferenceReads(text, 'pr-review'), []);
});

test('foreignReferenceReads: a path into another skill\'s references', () => {
  const text = '${CLAUDE_PLUGIN_ROOT}/skills/design/uiux-refine/references/freeze.md';
  assert.deepEqual(foreignReferenceReads(text, 'implement').map(([slug]) => slug), ['uiux-refine']);
});

test('no skill reads another skill\'s private references', () => {
  const violations = [];
  for (const { slug, dir } of skillDirs()) {
    for (const file of walk(dir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(file, 'utf8');
      for (const [other, excerpt] of foreignReferenceReads(text, slug)) {
        violations.push(`${relative(pluginRoot, file)} reads ${other}'s references: ${excerpt}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
