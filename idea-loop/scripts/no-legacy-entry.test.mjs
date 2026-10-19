/**
 * Tripwire — there is no third DESIGN.md write entry.
 *
 * The project's DESIGN.md is written from exactly two places (uiux-imagine when the project has none,
 * dreaming); both read references/design-md.md. The old `design-modeling` skill was a third,
 * separately-ruled entry and has been deleted. This test greps every skill, agent, reference, hook
 * and script for the retired name, so a stale pointer to it cannot slip back in.
 *
 * docs/ holds history (the superseded design record) and evals/ holds pinned baselines; neither is
 * scanned. This file is skipped because it has to spell the name it forbids.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['skills', 'agents', 'references', 'hooks', 'scripts'];
const RETIRED = /design-modeling/i;
const SELF = basename(fileURLToPath(import.meta.url));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(md|mjs|json|ya?ml)$/.test(name) && name !== SELF ? [p] : [];
  });
}

test('skills, agents, references, hooks and scripts never name the retired design-modeling entry', () => {
  const hits = [];
  for (const dir of SCANNED) {
    for (const file of files(join(pluginRoot, dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (RETIRED.test(line)) hits.push(`${relative(pluginRoot, file)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
  }
  assert.deepEqual(hits, [], `the retired design-modeling entry is still referenced:\n${hits.join('\n')}`);
});

test('the skill directory itself is gone', () => {
  assert.throws(() => statSync(join(pluginRoot, 'skills', 'design-modeling')), { code: 'ENOENT' });
});
