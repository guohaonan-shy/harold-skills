/**
 * Tripwire — the plugin's skills and references stay project-agnostic.
 *
 * idea-loop was generalized out of one real product, and its references kept quoting that
 * product's decisions as if they were law (its accent color, its retired identity, its motion
 * whitelist). A product's visual language belongs in that product's own DESIGN.md, written through
 * the single write path in skills/design/design-modeling/SKILL.md; the skills' references hold only principles that would survive a change of product.
 *
 * This test greps everything in the plugin that an agent or a person reads — skills/, agents/,
 * docs/, README.md and the plugin AGENTS.md — for the known tells of the source project. It is a
 * tripwire, not a classifier: it catches the names we know, and a new example drawn from a real
 * project should be rewritten on a generic product before it lands. Two places are left out on
 * purpose: evals/ (replay cases are taken from real sessions) and scripts/ (test fixtures are test
 * data, not rules an agent reads).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['skills', 'agents', 'docs', 'README.md', 'AGENTS.md'];

const TELLS = [
  /toeflair|tofelair|\btoefl\b/i,
  /备考|错题|练习次数|听力/,
  /electric blue/i,
  /#137fec|#0f6fd1/i,
  /retired-ink|tamed-aceternity/i,
  /\breal (product )?project\b/i,
  /\bthat project('s)?\b/i,
];

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => {
    const p = join(path, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(md|mjs|json|ya?ml)$/.test(name) ? [p] : [];
  });
}

test('skills, agents, docs, README and AGENTS.md carry no project-specific names or examples', () => {
  const hits = [];
  for (const entry of SCANNED) {
    for (const file of files(join(pluginRoot, entry))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const tell = TELLS.find((re) => re.test(line));
        if (tell) hits.push(`${relative(pluginRoot, file)}:${i + 1}  ${tell}  ${line.trim().slice(0, 100)}`);
      });
    }
  }
  assert.deepEqual(hits, [], `project-specific content leaked into the plugin:\n${hits.join('\n')}`);
});
