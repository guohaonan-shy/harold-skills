/**
 * Doc test — what the SessionStart injection changes in the documents agents read.
 *
 * Spec session-start-inject-rules, ticket 01 (the runtime half reworded when the runtime skill became the `dyna
 * runtime` data, ticket 18). A main session starts with the body of `idea-loop:decision-rules`, the capability list
 * and the current runtime's data already in context (the hook is tested in session-start-inject.test.mjs), so:
 *   - no skill other than decision-rules tells the session to fetch decision-rules with the Skill tool: it names it
 *     instead (the runtime skill is gone: there is nothing to fetch with the Skill tool, the how is `dyna runtime show`);
 *   - a sub-agent gets no injection, so every agent definition that reaches a runtime capability says to fetch it
 *     itself with `dyna runtime show <能力>`.
 * "Reaches a capability" is mechanical: the agent's own text, a skill it names as `idea-loop:<name>` (SKILL.md and every
 * reference of that skill), or a skill file it names by path (`skills/<category>/<name>/…`, a file or a directory) has
 * 『<capability>』 in it, the capability being a name in the first column of runtime/capabilities.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = join(pluginRoot, 'skills');
const agentsRoot = join(pluginRoot, 'agents');

const walk = (path) => (!existsSync(path) ? [] : statSync(path).isDirectory() ? readdirSync(path).flatMap((n) => walk(join(path, n))) : [path]);
const mdUnder = (path) => walk(path).filter((f) => f.endsWith('.md'));
const textOf = (files) => files.map((f) => readFileSync(f, 'utf8')).join('\n');

/** The skill the hook injects; it is the source of the injection and keeps saying what it says. */
const INJECTED = [join(skillsRoot, 'productivity', 'decision-rules')];

/** Does a sentence tell the reader to call a skill with the Skill tool and then name one of `names` (`idea-loop:<name>`)? A sentence ends at 。 */
export function callsSkill(text, names) {
  const re = new RegExp(`idea-loop:(${names.join('|')})\``);
  return text.split('。').filter((sentence) => {
    const call = sentence.indexOf('Skill 工具调');
    return call >= 0 && re.test(sentence.slice(call));
  });
}

/** `<file>:<line>  sentence` of every sentence in `root` that calls decision-rules with the Skill tool. */
export function fetchPointers(root, skip = INJECTED) {
  const hits = [];
  for (const file of mdUnder(root)) {
    if (skip.some((dir) => file.startsWith(`${dir}/`))) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const sentence of callsSkill(line, ['decision-rules'])) hits.push(`${relative(pluginRoot, file)}:${i + 1}  ${sentence.trim().slice(0, 80)}`);
    });
  }
  return hits;
}

/** The capability names: first column of the table under 「能力清单」 in runtime/capabilities.md. */
export function capabilities() {
  const text = readFileSync(join(pluginRoot, 'runtime', 'capabilities.md'), 'utf8');
  const section = text.slice(text.indexOf('## 能力清单')).split(/\n## /)[0];
  return section.split('\n').filter((l) => l.startsWith('|')).slice(2).map((l) => l.split('|')[1].trim());
}

/** The skill directories by name, from every SKILL.md under skills/. */
function skillDirs() {
  const dirs = {};
  for (const f of walk(skillsRoot)) if (f.endsWith('/SKILL.md')) dirs[dirname(f).split('/').pop()] = dirname(f);
  return dirs;
}

/** The capabilities an agent definition reaches: [capability, where it showed up]. */
export function reachedBy(agentText, caps = capabilities(), dirs = skillDirs()) {
  const found = new Map();
  const scan = (text, where) => {
    for (const c of caps) if (text.includes(`『${c}`) && !found.has(c)) found.set(c, where);
  };
  scan(agentText, '正文');
  const named = new Set([...agentText.matchAll(/idea-loop:([a-z0-9-]+)/g)].map((m) => m[1]));
  for (const name of named) if (dirs[name]) scan(textOf(mdUnder(dirs[name])), `skill ${name}`);
  const paths = new Set([...agentText.matchAll(/skills\/[a-z]+\/[a-z0-9-]+\/[A-Za-z0-9_./-]*/g)].map((m) => m[0]));
  for (const p of paths) scan(textOf(mdUnder(join(pluginRoot, p))), p);
  return [...found];
}

test('skills/ (decision-rules itself aside) no longer tell the session to call decision-rules with the Skill tool', () => {
  assert.deepEqual(fetchPointers(skillsRoot), []);
});

test('the pointer check goes red on the old wording, and stays quiet on a name reference', () => {
  const both = ['decision-rules'];
  assert.equal(callsSkill('先用 Skill 工具调 `idea-loop:pr` 和 `idea-loop:decision-rules`。', both).length, 1);
  assert.equal(callsSkill('会话管理等能力，照『<能力>』（`dyna runtime show <能力>`）。', both).length, 0);
  assert.equal(callsSkill('先对 `idea-loop:decision-rules` 的「核心」。用 Skill 工具调 `idea-loop:pr`。', both).length, 0);
  assert.equal(callsSkill('用 Skill 工具调 `idea-loop:evidence`。要他定的事怎么写成一道题，照 `idea-loop:decision-rules`。', both).length, 0);
});

/** Does the text say how to fetch a capability's how-to: `dyna runtime show`? */
export const fetchesCapabilities = (text) => /dyna runtime show/.test(text);

test('every agent definition that reaches a runtime capability says to fetch it with dyna runtime show', () => {
  const missing = [];
  for (const file of readdirSync(agentsRoot).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(agentsRoot, file), 'utf8');
    const reached = reachedBy(text);
    if (reached.length && !fetchesCapabilities(text)) missing.push(`${file}（${reached.map(([c, where]) => `『${c}』在${where}`).join('；')}）`);
  }
  assert.deepEqual(missing, []);
});

test('the reach rule finds a capability in the agent text, in a named skill, and in a named skill file', () => {
  const caps = ['浏览器', '推送'];
  const dirs = { 'issue-dispatch': join(skillsRoot, 'engineering', 'issue-dispatch') };
  assert.deepEqual(reachedBy('用『浏览器』截图。', caps, dirs).map(([c]) => c), ['浏览器']);
  assert.deepEqual(reachedBy('用 Skill 工具调 `idea-loop:issue-dispatch`。', ['推送'], dirs).map(([c]) => c), ['推送']);
  assert.deepEqual(reachedBy('读 skills/engineering/issue-dispatch/SKILL.md', ['推送'], dirs).map(([c]) => c), ['推送']);
  assert.deepEqual(reachedBy('什么也不碰。', caps, dirs), []);
  assert.ok(capabilities().includes('浏览器') && capabilities().length === 11);
  assert.ok(fetchesCapabilities('用 `dyna runtime show <能力>` 取。') && !fetchesCapabilities('用 Skill 工具调 `idea-loop:decision-rules`。'));
});
