/**
 * Guard — the repo's AGENTS.md carries the deliberate exception for annotated samples. It lives at the repo root (not in the
 * plugin) because the file it reads is the repo's own and does not ship with the plugin. The samples themselves are checked by
 * idea-loop/scripts/evidence-samples.test.mjs.
 *
 * ROOT_AGENTS_MD points the test at another copy of the file (e.g. the text before the change).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.ROOT_AGENTS_MD ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'AGENTS.md');
const agents = readFileSync(file, 'utf8');

const FIRST_GROUP = [
  'example-from-real-material',
  'option-current-state-shown',
  'review-current-state-verified',
  'review-term-defined',
  'spec-option-goal-figure',
];

test('AGENTS.md has the deliberate exception for annotated samples, naming the first group and where #451 and #452 add theirs', () => {
  const start = agents.indexOf('**有意例外：`idea-loop` 的「标注样本」');
  assert.ok(start > 0, 'AGENTS.md has no 标注样本 exception');
  const section = agents.slice(start, agents.indexOf('### 6.', start));
  assert.match(section, /标注样本/);
  assert.match(section, /idea-loop\/evals\/<skill>\/cases\//);
  assert.match(section, /retro-replay\.mjs/);
  assert.match(section, /--cases-root/);
  assert.match(section, /annotations\.md/);
  assert.match(section, /不打分/);
  for (const name of FIRST_GROUP) assert.ok(section.includes(name), `the exception does not list ${name}`);
  assert.match(section, /#451/);
  assert.match(section, /#452/);
});
