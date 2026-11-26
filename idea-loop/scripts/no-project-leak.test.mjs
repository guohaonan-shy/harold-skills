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
// the command line lives next to the plugin, not in it, and ships with the same promise: nothing of a real project
const SCANNED = ['skills', 'agents', 'docs', 'README.md', 'AGENTS.md', 'bin', 'dyna-version', 'runtime', '../dyna'];

const TELLS = [
  /toeflair|tofelair|\btoefl\b/i,
  /备考|错题|练习次数|听力/,
  /electric blue/i,
  /#137fec|#0f6fd1/i,
  /retired-ink|tamed-aceternity/i,
  /\breal (product )?project\b/i,
  /\bthat project('s)?\b/i,
  /IntroTrialCTA|HomePage\.astro|btn-brand-inverse/,
  // the company's issue tracker: team prefix plus number, the team-name sample, the GitHub org and repo (shapes only, no real number or title)
  /\bFA-\d+/i,
  /Fish（key/,
  /fishaudio|fish-agent/i,
];

function files(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => {
    const p = join(path, name);
    if (statSync(p).isDirectory()) return name === 'dist' ? [] : files(p);
    return /\.(md|mjs|json|go|ya?ml|html)$|^dyna$/.test(name) ? [p] : [];
  });
}

test('skills, agents, docs, README, AGENTS.md and the command line carry no project-specific names or examples', () => {
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

// home's fixed text is written into every user's home verbatim, so it is held to the same promise by name: the scan above
// must reach the file (it lives under skills/), and it carries no issue or PR number of the project it was drawn from.
const HOME_RULES = 'skills/engineering/setup/references/home-rules.md';

test('the fixed text dyna writes into home is among the scanned files and names no project, issue or PR', () => {
  const scanned = SCANNED.flatMap((entry) => files(join(pluginRoot, entry))).map((f) => relative(pluginRoot, f));
  assert.ok(scanned.includes(HOME_RULES), `${HOME_RULES} is not under a scanned path`);
  const text = readFileSync(join(pluginRoot, HOME_RULES), 'utf8');
  assert.doesNotMatch(text, /#\d{2,}|\b(issue|PR)\s*#?\d+/i, 'an issue or PR number in the fixed text');
});
