/**
 * Tripwire — the design process directory is located from the project directory (docs/spec/skills-read-home, ticket 06).
 *
 * `${CLAUDE_PROJECT_DIR}` in skill text becomes the main checkout in a worktree session, and is empty in a Bash
 * environment; neither is where the design files are. imagine / refine say the project directory is taken as
 * wiki-conventions「项目目录」defines it and build every path off `<项目目录>/docs/design/tmp/<spec-slug>/`. The behaviour
 * is skill text, so this reads the text: it catches someone putting the variable back, or imagine / refine dropping the
 * sentence that defines the root. It cannot see whether an executor follows it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function markdownUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...markdownUnder(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

test('no skill or agent text builds a path from CLAUDE_PROJECT_DIR', () => {
  const hits = [];
  for (const top of ['skills', 'agents']) {
    for (const file of markdownUnder(join(pluginRoot, top))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('CLAUDE_PROJECT_DIR')) hits.push(`${relative(pluginRoot, file)}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(hits, [], `CLAUDE_PROJECT_DIR is the main checkout in a worktree session and empty in Bash: ${hits.join(', ')}`);
});

for (const skill of ['uiux-imagine', 'uiux-refine']) {
  test(`${skill} puts the design tmp directory under the project directory, and every command is anchored on it`, () => {
    const text = readFileSync(join(pluginRoot, 'skills', 'design', skill, 'SKILL.md'), 'utf8');
    assert.match(text, /项目目录照那里的「项目目录」拿/);
    assert.match(text, /`imagine\/`、`canvas\/`、`research\/` 都在 `<项目目录>\/docs\/design\/tmp\/<spec-slug>\/`/);
    assert.doesNotMatch(text, /worktree 根/, 'the project directory is in home; the worktree root is no longer where the design files are');
    // every command that reads those files is prefixed with the project directory, not a bare docs/ path
    const commands = text.split('\n').filter((l) => /dyna (design note submit|design critic round|issues set) "/.test(l));
    assert.ok(commands.length > 0, 'no commands found to check');
    for (const line of commands) {
      assert.match(line, /<项目目录>\/docs/, `command not anchored on the project directory: ${line.trim()}`);
    }
  });
}
