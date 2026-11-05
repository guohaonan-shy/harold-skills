// The knowledge base lives in the business root, not in the code repo, and its changes land without a PR
// (docs/spec/business-knowledge-base). The rule is written once, in wiki-conventions' knowledge-base
// reference; every place that used to say "a docs-only PR is merged into main" points at it instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}
const docs = [...files(join(root, 'skills')), ...files(join(root, 'agents')), join(root, 'README.md')];

test('no skill, agent or the README still lands knowledge-base changes through a PR', () => {
  const banned = [/只改 ?`?docs\/?`? ?的 ?PR/, /设计 PR/, /spec PR/, /docs-only/, /经 ?PR 合进主分支/];
  const hits = [];
  for (const f of docs) {
    const text = readFileSync(f, 'utf8');
    for (const re of banned) if (re.test(text)) hits.push(`${relative(root, f)}: ${re}`);
  }
  assert.deepEqual(hits, []);
});

test('the places that land knowledge-base changes point at wiki-conventions「知识库落地」', () => {
  const entries = [
    'skills/engineering/to-spec/references/land-on-main.md',
    'skills/engineering/issue-verify/SKILL.md',
    'skills/engineering/issue-session/SKILL.md',
    'skills/engineering/to-ticket/SKILL.md',
    'skills/engineering/pr-review/references/merge.md',
    'skills/design/uiux-refine/SKILL.md',
    'skills/productivity/decision-rules/SKILL.md',
    'skills/productivity/retro/SKILL.md',
    'skills/productivity/dreaming/SKILL.md',
    'skills/seo/seo-outreach/SKILL.md',
  ];
  for (const f of entries) assert.match(read(f), /知识库落地/, `${f} does not point at 知识库落地`);
});

test('when a knowledge-base branch lands is written only in the wiki-conventions reference', () => {
  const ref = 'skills/productivity/wiki-conventions/references/knowledge-base.md';
  const rule = /拆完子 issue（spec 与设计定稿）就合/;
  assert.match(read(ref), rule);
  const elsewhere = docs.filter((f) => !f.endsWith(ref) && rule.test(readFileSync(f, 'utf8')));
  assert.deepEqual(elsewhere.map((f) => relative(root, f)), []);
  assert.match(read('skills/productivity/wiki-conventions/SKILL.md'), /## 知识库落地[\s\S]*references\/knowledge-base\.md/);
});

test('merging a code PR is followed by landing its knowledge-base branch', () => {
  const merge = read('skills/engineering/pr-review/references/merge.md');
  const step = merge.split('\n').findIndex((l) => /gh pr merge/.test(l));
  assert.ok(step >= 0);
  assert.match(merge.split('\n')[step + 1], /business\.mjs land issue-<号>/);
});

test('the「两份都读」switch is handed to the human as a user setting, never a project one', () => {
  const ref = read('skills/engineering/setup/references/business-root.md');
  assert.match(ref, /"cc-plugin-agents-md@builtin": \{ "options": \{ "instructionFiles": "claude-md-and-agents-md" \} \}/);
  assert.match(ref, /`~\/\.claude\/settings\.json`/);
  assert.match(ref, /仓库的 `\.claude\/settings\.json` 里不生效/);
});
