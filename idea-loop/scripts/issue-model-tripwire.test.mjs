/**
 * Tripwire — the old issue model must not come back (spec issue-model, ticket 05).
 *
 * Before: a spec carried its own `status` (草稿 … 完成) written by `spec-status.mjs`, an issue carried one of
 * eight Chinese `status:*` labels, and a cloud scheduled task ("整合") hung issues that touched the same place
 * under a root issue. Now an issue's status is the only state (backlog / triage / todo / in-progress /
 * in-review / done / canceled), a spec is a document read by `spec.mjs`, and nothing groups issues.
 *
 * 1. Every text file of the plugin is scanned: no `spec-status`, none of the eight old state names, no
 *    "整合" / consolidation, and the consolidation prompt file is gone. Exempt: `*.test.mjs` (they assert
 *    the absence), `scripts/issues.mjs` (its `migrate` table is the one place that maps old labels to new),
 *    and the `prompt` field of a retro replay case (it records what a human typed back then).
 * 2. setup no longer installs the consolidation task, and asks whether the team uses triage.
 * 3. dreaming / adr-reconciler judge "spec is done" by its issues being closed, not by a spec status.
 * 4. wiki-conventions has no spec row in the `status` closed set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const OLD_STATES = ['待验证', '验证中', '审核中', '待设计', '设计中', '待实现', '实现中', '搁置'];
// Ordinary words that merely contain a state name.
const NOT_A_STATE = ['实现中途', '无，待验证', '风险与待验证'];

const SKIP_DIRS = new Set(['node_modules', '.git']);
const TEXT = /\.(md|mjs|js|json|ya?ml|txt|html|sh|excalidraw|svg)$/;

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (TEXT.test(name)) out.push(p);
  }
  return out;
}

/** The text of a file to scan; undefined when the file is exempt. */
function scanned(f) {
  const rel = relative(pluginRoot, f).split('\\').join('/');
  if (f.endsWith('.test.mjs') || rel === 'scripts/issues.mjs') return undefined;
  const text = readFileSync(f, 'utf8');
  if (/^evals\/retro\/cases\/[^/]+\/case\.json$/.test(rel)) {
    const { prompt, ...rest } = JSON.parse(text); // the prompt is what a human typed back then
    return JSON.stringify(rest);
  }
  return text;
}

const all = files(pluginRoot)
  .map((f) => ({ f, rel: relative(pluginRoot, f), text: scanned(f) }))
  .filter((x) => x.text !== undefined);

const hits = (re) => all.filter((x) => re.test(x.text)).map((x) => x.rel);

test('no file of the plugin mentions spec-status', () => {
  assert.deepEqual(hits(/spec-status/), []);
  assert.ok(!existsSync(join(pluginRoot, 'scripts', 'spec-status.mjs')));
  assert.ok(!existsSync(join(pluginRoot, 'skills', 'engineering', 'spec-status')));
});

test('no file of the plugin names one of the eight old states', () => {
  const found = [];
  for (const x of all) {
    let t = x.text;
    for (const w of NOT_A_STATE) t = t.split(w).join('');
    for (const old of OLD_STATES) if (t.includes(old)) found.push(`${x.rel}: ${old}`);
  }
  assert.deepEqual(found, []);
});

test('no file of the plugin groups issues any more (整合 / consolidation) and the prompt file is gone', () => {
  assert.deepEqual(hits(/整合|[Cc]onsolidat/), []);
  assert.deepEqual(files(pluginRoot).filter((f) => /consolidation-prompt/.test(basename(f))), []);
});

// ---------- setup ----------

const setupDir = join(pluginRoot, 'skills', 'engineering', 'setup');
const skill = readFileSync(join(setupDir, 'SKILL.md'), 'utf8');
const body = skill.split(/^---\s*$/m).slice(2).join('---');

test('setup SKILL.md body is under 5000 characters', () => {
  assert.ok([...body].length < 5000, `body is ${[...body].length} characters`);
});

test('every references/ link in setup SKILL.md exists', () => {
  const links = [...skill.matchAll(/\]\((references\/[^)#]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length > 0);
  for (const l of links) assert.ok(existsSync(join(setupDir, l)), `${l} is linked but missing`);
});

test('setup installs no cloud scheduled task', () => {
  assert.doesNotMatch(skill, /RemoteTrigger|7 \*\/6 \* \* \*|apps\/claude\/installations/);
});

test('setup asks whether the team uses triage and writes the answer into ISSUE_TRACKER.md', () => {
  const questions = readFileSync(join(setupDir, 'references', 'questions.md'), 'utf8');
  assert.match(questions, /triage/, 'questions.md has no triage question');
  assert.match(questions, /跳过/, 'the question says what skipping means');
  assert.match(body, /triage/, 'SKILL.md 写 does not say where the answer goes');
  assert.match(body, /ISSUE_TRACKER\.md/);
  const tpl = readFileSync(join(setupDir, 'references', 'issue-tracker.md'), 'utf8');
  assert.match(tpl, /^triage：用 \/ 跳过$/m, 'the template line the answer replaces');
});

test('setup reads specs through spec.mjs and migrates old labels through issues.mjs migrate', () => {
  const survey = readFileSync(join(setupDir, 'references', 'survey.md'), 'utf8');
  assert.match(survey, /spec\.mjs" check docs/);
  assert.match(body, /issues\.mjs" migrate docs/);
  assert.match(body, /--apply/);
});

// ---------- dreaming / adr-reconciler ----------

test('dreaming and adr-reconciler judge a spec done by its issues being closed', () => {
  const dir = join('skills', 'productivity', 'dreaming', 'references');
  const reconcile = read(dir, 'docs-reconcile.md');
  const missed = read(dir, 'missed-archive.md');
  const agent = read('agents', 'adr-reconciler.md');
  assert.match(reconcile, /issues:/, 'docs-reconcile.md reads the issues a spec lists');
  assert.match(reconcile, /全(都)?关/);
  assert.doesNotMatch(reconcile, /frontmatter[^\n]*`?status`?|spec 的 `?status`?/);
  assert.match(missed, /issues:/);
  assert.match(missed, /全(都)?关/);
  assert.doesNotMatch(missed, /`status`/);
  assert.match(agent, /idea-loop:issues|spec\.mjs/);
});

// ---------- wiki-conventions ----------

test('wiki-conventions: the status closed set has no spec row, and a spec is judged by its issues', () => {
  const md = read('skills', 'productivity', 'wiki-conventions', 'SKILL.md');
  const closedSet = md.slice(md.indexOf('`status` 是闭集'));
  const table = closedSet.split('\n').filter((l) => l.startsWith('|'));
  assert.ok(table.length > 2);
  assert.ok(!table.some((l) => /^\|\s*`spec`/.test(l)), 'the spec row is still in the status table');
  assert.match(md, /spec\.mjs/);
  assert.match(md, /issues:/);
});
