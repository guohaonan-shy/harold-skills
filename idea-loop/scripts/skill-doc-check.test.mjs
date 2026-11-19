/**
 * The dangling-section-pointer check covers the whole plugin: every `.md` and every script under it, not only
 * `skills/` and `agents/` (docs/spec/wiki-conventions-slim, review round 1). Built on a throwaway plugin tree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { danglingSectionPointers } from './skill-doc-check.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'skill-doc-check-'));
  const skillDir = join(root, 'skills', 'productivity', 'demo');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: demo\n---\n\n## 有的一节\n');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return { root, skillDir };
}

test('a dangling pointer is caught in files outside skills/ and agents/ (README, scripts, evals, references of other skills)', () => {
  const dangling = '见 `idea-loop:demo` 的「不存在的一节」。\n';
  const { root, skillDir } = fixture({
    'README.md': dangling,
    'scripts/x.mjs': `// ${dangling}`,
    'evals/retro/cases/a/annotations.md': dangling,
    'skills/design/other/references/y.md': dangling,
  });
  try {
    const { seen, bad } = danglingSectionPointers({ pluginRoot: root, skillDir, skillName: 'demo' });
    assert.equal(seen, 4);
    assert.deepEqual(
      bad.map((b) => b.split(':')[0]).sort(),
      ['README.md', 'evals/retro/cases/a/annotations.md', 'scripts/x.mjs', 'skills/design/other/references/y.md'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a pointer to an existing section passes', () => {
  const { root, skillDir } = fixture({ 'README.md': '见 `idea-loop:demo` 的「有的一节」。\n' });
  try {
    assert.deepEqual(danglingSectionPointers({ pluginRoot: root, skillDir, skillName: 'demo' }), { seen: 1, bad: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
