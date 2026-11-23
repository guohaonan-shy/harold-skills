/**
 * Tripwire — seo-scan and its five direction agents follow the rewrite checklist (writing-for-agents,
 * references/rewrite-checklist.md): the gate's branch that only runs
 * when there are gaps sits in its own reference, no hand-written `gh` / `git` command is left (the triage worktree is
 * made and removed with `dyna worktree`), no decision history is left, and an agent's description says its job and
 * deliverable, not who starts it.
 *
 * Before: the SKILL.md body was 4776 characters with the whole gate inline, routing.md ran `git worktree add` /
 * `git worktree remove` / `git rev-parse`, and the five agent descriptions read "seo-scan 在一次扫描要跑 … 时起它".
 *
 * SEO_DOCS_ROOT points the test at another copy of the plugin (e.g. the text before the change), to see it fail there first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.SEO_DOCS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => (existsSync(join(root, ...p)) ? readFileSync(join(root, ...p), 'utf8') : '');
const body = (doc) => doc.split(/^---\s*$/m).slice(2).join('---');
const field = (doc, name) => doc.split(/^---\s*$/m)[1]?.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';

const AGENTS = ['backlink-analyst', 'geo-analyst', 'keyword-miner', 'page-optimizer', 'technical-auditor'];
const SCAN_DIR = join('skills', 'seo', 'seo-scan');
const refs = existsSync(join(root, SCAN_DIR, 'references')) ? readdirSync(join(root, SCAN_DIR, 'references')).filter((f) => f.endsWith('.md')) : [];
const FILES = [join(SCAN_DIR, 'SKILL.md'), ...refs.map((f) => join(SCAN_DIR, 'references', f)), ...AGENTS.map((a) => join('agents', `${a}.md`))];

test('the gate keeps its gaps call in SKILL.md and the branch that runs only with gaps in references/gap-gate.md', () => {
  const skill = body(read(SCAN_DIR, 'SKILL.md'));
  assert.match(skill, /references\/gap-gate\.md/);
  assert.ok(!skill.includes('find_serp_competitors'), 'the competitor guess is still inline in SKILL.md');
  assert.ok(!skill.includes('update_project_context`（'), 'the write-back is still inline in SKILL.md');
  const gate = read(SCAN_DIR, 'references', 'gap-gate.md');
  for (const k of ['find_serp_competitors', '『推送』', '一次最多三个问题', '不派任何方向 agent', '重新调 `get_project_context`']) {
    assert.ok(gate.includes(k), `gap-gate.md lacks ${k}`);
  }
});

test('no hand-written gh / git command is left in seo-scan or its direction agents; the triage worktree uses dyna worktree', () => {
  for (const f of FILES) assert.doesNotMatch(read(f), /`(gh|git) [a-z]/, `${f} still has an inline gh / git command`);
  const routing = read(SCAN_DIR, 'references', 'routing.md');
  assert.match(routing, /dyna worktree add [^\n]*--detach/);
  assert.match(routing, /dyna worktree remove /);
});

test('the decision-history search only hits the three places that state a rule or an example', () => {
  const hits = FILES.filter((f) => /20[0-9]{2}-[0-9]{2}-[0-9]{2}|人定|原话|依据：/.test(read(f))).sort();
  assert.deepEqual(hits, [
    join('agents', 'geo-analyst.md'), // 「原话」: copy the method skill's wording, a rule for the agent
    join(SCAN_DIR, 'references', 'budget.md'), // 「只由人定」: spending over the weekly quota is the human's call
    join(SCAN_DIR, 'references', 'findings.md'), // an example's `when` date
  ].sort());
});

test('an agent description says its job and deliverable, not which skill starts it', () => {
  for (const a of AGENTS) {
    const d = field(read('agents', `${a}.md`), 'description');
    assert.ok(d.length > 0, `${a}: no description`);
    assert.doesNotMatch(d, /seo-scan|起它/, `${a}: ${d}`);
    assert.match(d, /交回/, `${a}: the description names what it hands back`);
  }
});
