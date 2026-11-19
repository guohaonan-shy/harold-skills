/**
 * Tripwire — ai-eval stays project-agnostic.
 *
 * ai-eval was generalized out of one real product, and everything it needs to know about a project
 * (commands, paths, where samples live) is supposed to come from that project's own EVAL.md. This
 * test greps everything in the plugin that an agent or a person reads — skills/, references/,
 * scripts/ and README.md — for the known tells of the source project: its name, its paths, and the
 * domain words its examples used. It is a tripwire, not a classifier: it catches the names we know,
 * and a new example drawn from a real project should be rewritten on a generic product before it
 * lands.
 *
 * scripts/ is scanned too, test fixtures included, because a fixture that quotes a real product is
 * still a leak; only this file is left out, since it holds the word list.
 *
 * 跑：`node --test ai-eval/scripts/no-project-leak.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const pluginRoot = join(dirname(here), '..');
const SCANNED = ['skills', 'references', 'scripts', 'README.md'];

const TELLS = [
  /toeflair|tofelair|\btoefl\b/i,
  /托福|作文|学生/,
  /t11-live-config|ai_tasks\.yaml/,
  /\bacademic_discussion_report\b/,
];

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => {
    const p = join(path, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(md|mjs|json|ya?ml)$/.test(name) ? [p] : [];
  });
}

test('skills, references, scripts and README carry no project-specific names or examples', () => {
  const hits = [];
  for (const entry of SCANNED) {
    for (const file of files(join(pluginRoot, entry))) {
      if (file === here) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const tell = TELLS.find((re) => re.test(line));
        if (tell) hits.push(`${relative(pluginRoot, file)}:${i + 1}  ${tell}  ${line.trim().slice(0, 100)}`);
      });
    }
  }
  assert.deepEqual(hits, [], `project-specific content leaked into the plugin:\n${hits.join('\n')}`);
});
