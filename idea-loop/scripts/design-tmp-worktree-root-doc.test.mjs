/**
 * Tripwire — the design process directory is located from the current worktree root.
 *
 * Spec design-tmp-worktree-root. `${CLAUDE_PROJECT_DIR}` in skill text becomes the main checkout in a
 * worktree session, and is empty in a Bash environment; neither is the worktree. imagine / refine must
 * say "worktree root = `git rev-parse --show-toplevel`" and build every path off it. The behaviour is
 * skill text, so this reads the text: it catches someone putting the variable back, or imagine / refine
 * dropping the sentence that defines the root. It cannot see whether an executor follows it.
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
  test(`${skill} defines the worktree root and puts the design tmp directory under it`, () => {
    const text = readFileSync(join(pluginRoot, 'skills', 'design', skill, 'SKILL.md'), 'utf8');
    assert.match(text, /worktree 根 = `git rev-parse --show-toplevel`/, 'worktree root must be defined by git rev-parse --show-toplevel');
    assert.match(text, /`imagine\/`、`canvas\/`、`research\/` 都在 worktree 根下的 `docs\/design\/tmp\/<spec-slug>\/`/);
    // every command that reads those files is prefixed with the worktree root, not a bare docs/ path
    const commands = text.split('\n').filter((l) => /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/(direction-note-check|critic-score|issues)\.mjs"/.test(l));
    assert.ok(commands.length > 0, 'no commands found to check');
    for (const line of commands) {
      assert.match(line, /<worktree 根>\/docs/, `command not anchored on the worktree root: ${line.trim()}`);
    }
  });
}
