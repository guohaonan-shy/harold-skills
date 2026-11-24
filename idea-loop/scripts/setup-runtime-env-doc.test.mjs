/**
 * Tripwire — setup's two runtime steps: pick the device's default runtime, and generate a description for a
 * runtime that is not in the list from the capability template.
 *
 * - SKILL.md 「home」: a pointer to references/runtime-env.md plus the completion condition naming the runtime; it
 *   stays a pointer (the steps are in the reference).
 * - references/runtime-env.md: the two steps, each ending in a completion condition made of what can be checked
 *   (the name written to `<home>/runtime/selected` and committed; `dyna runtime check` passing, then committed).
 * - no file of setup names `handoff` or a runtime of the plugin's own (the preflight table included): the list of
 *   runtimes is whatever the descriptions say, not a list written into setup.
 * - the README says how a runtime is added (one more description, no dyna change), and mentions `runtime check`
 *   and `runtime record`, and no longer `handoff`, in the runtime row.
 *
 * `SETUP_DOCS_ROOT` points the test at another copy of skills/engineering/setup, `README_PATH` at another README
 * (the text before the change), to see that these checks fail on it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const setupDir = process.env.SETUP_DOCS_ROOT || join(pluginRoot, 'skills', 'engineering', 'setup');
const readIn = (...p) => readFileSync(join(setupDir, ...p), 'utf8');
const readme = readFileSync(process.env.README_PATH || join(pluginRoot, 'README.md'), 'utf8');
const skill = readIn('SKILL.md');
const body = skill.split(/^---\s*$/m).slice(2).join('---');
const ref = (() => { try { return readIn('references', 'runtime-env.md'); } catch { return ''; } })();

function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\s*$([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
}

function filesUnder(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

test('SKILL.md 「home」 points at runtime-env.md and its completion condition names the runtime, still a pointer', () => {
  const s = section(body, 'home');
  assert.ok(s, 'SKILL.md body has no 「home」 section');
  assert.ok(s.includes('references/runtime-env.md'), '「home」 does not point at references/runtime-env.md');
  assert.match(s, /完成条件：[^\n]*运行环境选过或人拒绝/);
  assert.ok([...s].length < 400, `「home」 section is ${[...s].length} characters: it is growing past a pointer`);
});

test('the SKILL.md body stays within the 4500-character line', () => {
  assert.ok([...body].length <= 4500, `body is ${[...body].length} characters`);
});

test('runtime-env.md has the two steps, each with a completion condition', () => {
  const pick = section(ref, '1\\. 选运行环境');
  const gen = section(ref, '2\\. 照模板生成新环境的说明');
  assert.ok(pick, 'no step 「1. 选运行环境」');
  assert.ok(gen, 'no step 「2. 照模板生成新环境的说明」');
  assert.match(pick, /^完成条件：/m);
  assert.match(gen, /^完成条件：/m);
});

test('step 1 lists the descriptions with their markers, says what is found now, asks, writes `runtime/selected` and commits it', () => {
  const s = section(ref, '1\\. 选运行环境');
  assert.match(s, /标记：/);
  assert.match(s, /dyna runtime name/);
  assert.match(s, /有标记的环境[^\n]*自己认得出/);
  assert.match(s, /人选的只在[^\n]*兜底/);
  assert.match(s, /『向人提问』/);
  assert.match(s, /~\/home\/runtime\/selected/);
  assert.match(s, /dyna home commit [^\n]*selected/);
});

test('step 2 reads the human\'s documentation, writes per capability from the template, has each section approved, checks, commits', () => {
  const s = section(ref, '2\\. 照模板生成新环境的说明');
  assert.match(s, /文档（链接或文件）/);
  assert.match(s, /「能力模板」/);
  assert.match(s, /标记行/);
  assert.match(s, /标记：没有/);
  assert.match(s, /「没有」/);
  assert.match(s, /逐节摆给人批/);
  assert.match(s, /~\/home\/runtime\/<名>\.md/);
  assert.match(s, /dyna runtime check ~\/home\/runtime\/<名>\.md/);
  assert.match(s, /dyna home commit [^\n]*<名>\.md/);
  assert.match(s, /完成条件：[^\n]*dyna runtime check[^\n]*dyna home commit/);
});

test('no file of setup mentions handoff or a runtime of the plugin\'s own', () => {
  for (const f of filesUnder(setupDir).filter((p) => p.endsWith('.md'))) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /handoff/i, `${f} mentions handoff`);
    assert.doesNotMatch(t, /\bmagi\b|claude-desktop/, `${f} names a runtime of the plugin's own`);
  }
});

test('the README says how setup picks and adds a runtime, and mentions runtime check and runtime record', () => {
  assert.match(readme, /`references\/runtime-env\.md`/);
  assert.match(readme, /<home>\/runtime\/selected/);
  assert.match(readme, /`dyna runtime check` has to pass before `dyna home commit`/);
  assert.match(readme, /`dyna runtime check \[<file>\]` checks a description/);
  assert.match(readme, /`dyna runtime record`/);
});

test('the README\'s runtime row no longer mentions handoff', () => {
  const row = readme.split('\n').find((l) => l.startsWith('| `dyna runtime`'));
  assert.ok(row, 'no runtime row in the README');
  assert.doesNotMatch(row, /handoff/i);
});
