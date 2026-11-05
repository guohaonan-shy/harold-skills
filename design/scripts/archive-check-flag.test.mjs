/**
 * Tripwire — every instruction that tells an agent to run the archive check over a `delta/` also
 * tells it to pass `--no-used-by`.
 *
 * Before the archive script has regenerated `usedBy`, a delta that adds a page reusing an existing
 * component is always inconsistent on rule 6 (the component's `usedBy` does not list the new page yet),
 * and `usedBy` is only ever written by the archive script. A check command without the flag therefore
 * fails a correct delta and sends the agent to hand-edit `usedBy`. This greps the skills, agents and
 * references for the command so a copy without the flag cannot slip back in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['skills', 'agents'];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

test('every doc line that runs design-archive-check over a --delta also passes --no-used-by', () => {
  const hits = [];
  let seen = 0;
  for (const dir of SCANNED) {
    for (const file of files(join(pluginRoot, dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!/design-archive-check\.mjs/.test(line) || !/--delta/.test(line)) return;
        seen += 1;
        if (!/--no-used-by/.test(line)) hits.push(`${relative(pluginRoot, file)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
  }
  // The floor only proves the scan still finds the commands. It was 6 while uiux-refine's freeze also ran the check over
  // a delta it wrote; freezing no longer writes one, so the remaining places are the implementer, ui-reviewer and design-archive.
  assert.ok(seen >= 4, `expected to find the check commands in the agent and skill docs, found ${seen}`);
  assert.deepEqual(hits, [], `these check commands lack --no-used-by:\n${hits.join('\n')}`);
});
