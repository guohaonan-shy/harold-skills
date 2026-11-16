/**
 * Doc test — what the SessionStart injection changes in the documents agents read.
 *
 * Spec session-start-inject-rules, ticket 01. A main session starts with the body of `idea-loop:decision-rules`,
 * the body of `idea-loop:runtime` and the current runtime's reference already in context (the hook is tested in
 * session-start-inject.test.mjs), so:
 *   - no skill outside those two tells the session to fetch them with the Skill tool: it names them instead;
 *   - a sub-agent gets no injection, so every agent definition that reaches a runtime capability opens by
 *     calling `idea-loop:runtime` itself.
 * "Reaches a capability" is mechanical: the agent's own text, a skill it names as `idea-loop:<name>` (SKILL.md and every
 * reference of that skill), or a skill file it names by path (`skills/<category>/<name>/…`, a file or a directory) has
 * 『<capability>』 in it, the capability being a name in the first column of the runtime skill's list.
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

/** The two skills the hook injects; they are the source of the injection and keep saying what they say. */
const INJECTED = [join(skillsRoot, 'productivity', 'decision-rules'), join(skillsRoot, 'productivity', 'runtime')];

/** Does a sentence tell the reader to call a skill with the Skill tool and then name one of `names` (`idea-loop:<name>`)? A sentence ends at 。 */
export function callsSkill(text, names) {
  const re = new RegExp(`idea-loop:(${names.join('|')})\``);
  return text.split('。').filter((sentence) => {
    const call = sentence.indexOf('Skill 工具调');
    return call >= 0 && re.test(sentence.slice(call));
  });
}

/** `<file>:<line>  sentence` of every sentence in `root` that calls decision-rules or runtime with the Skill tool. */
export function fetchPointers(root, skip = INJECTED) {
  const hits = [];
  for (const file of mdUnder(root)) {
    if (skip.some((dir) => file.startsWith(`${dir}/`))) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const sentence of callsSkill(line, ['decision-rules', 'runtime'])) hits.push(`${relative(pluginRoot, file)}:${i + 1}  ${sentence.trim().slice(0, 80)}`);
    });
  }
  return hits;
}

/** The capability names: first column of the table under 「能力清单」 in the runtime skill. */
export function capabilities() {
  const text = readFileSync(join(INJECTED[1], 'SKILL.md'), 'utf8');
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
  for (const name of named) if (dirs[name] && name !== 'runtime') scan(textOf(mdUnder(dirs[name])), `skill ${name}`);
  const paths = new Set([...agentText.matchAll(/skills\/[a-z]+\/[a-z0-9-]+\/[A-Za-z0-9_./-]*/g)].map((m) => m[0]));
  for (const p of paths) scan(textOf(mdUnder(join(pluginRoot, p))), p);
  return [...found];
}

test('skills/ (the two injected skills aside) no longer tell the session to call decision-rules or runtime with the Skill tool', () => {
  assert.deepEqual(fetchPointers(skillsRoot), []);
});

test('the pointer check goes red on the old wording, and stays quiet on a name reference', () => {
  const both = ['decision-rules', 'runtime'];
  assert.equal(callsSkill('会话管理等能力，用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的『<能力>』。', both).length, 1);
  assert.equal(callsSkill('先用 Skill 工具调 `idea-loop:pr` 和 `idea-loop:decision-rules`。', both).length, 1);
  assert.equal(callsSkill('会话管理等能力，照『<能力>』（`idea-loop:runtime`）。', both).length, 0);
  assert.equal(callsSkill('先对 `idea-loop:decision-rules` 的「核心」。用 Skill 工具调 `idea-loop:pr`。', both).length, 0);
  assert.equal(callsSkill('用 Skill 工具调 `idea-loop:evidence`。要他定的事怎么写成一道题，照 `idea-loop:decision-rules`。', both).length, 0);
});

test('every agent definition that reaches a runtime capability calls idea-loop:runtime in its text', () => {
  const missing = [];
  for (const file of readdirSync(agentsRoot).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(agentsRoot, file), 'utf8');
    const reached = reachedBy(text);
    if (reached.length && !callsSkill(text, ['runtime']).length) missing.push(`${file}（${reached.map(([c, where]) => `『${c}』在${where}`).join('；')}）`);
  }
  assert.deepEqual(missing, []);
});

test('the reach rule finds a capability in the agent text, in a named skill, and in a named skill file', () => {
  const caps = ['浏览器', '推送'];
  const dirs = { browser: join(skillsRoot, 'engineering', 'browser') };
  assert.deepEqual(reachedBy('用『浏览器』截图。', caps, dirs).map(([c]) => c), ['浏览器']);
  assert.deepEqual(reachedBy('用 Skill 工具调 `idea-loop:browser`。', caps, dirs).map(([c]) => c), ['浏览器']);
  assert.deepEqual(reachedBy('读 skills/engineering/browser/SKILL.md', caps, dirs).map(([c]) => c), ['浏览器']);
  assert.deepEqual(reachedBy('什么也不碰。', caps, dirs), []);
  assert.ok(capabilities().includes('浏览器') && capabilities().length === 11);
});
