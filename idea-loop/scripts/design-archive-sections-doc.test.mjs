/**
 * Tripwire — every command line the docs show for the sections script is one the script accepts.
 *
 * The sections script has three subcommands, each with its own options (`COMMAND_FLAGS` in the script is
 * the single list the parser also uses). The agents and references quote the commands; a renamed option or
 * a made-up subcommand would send an agent into a usage error in the middle of a long shot. This greps the
 * skills and agents for lines that run the script and checks the subcommand and every `--option`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND_FLAGS } from './design-archive-sections.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED = ['skills', 'agents'];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

test('every doc line that runs design-archive-sections names a real subcommand and only its own options', () => {
  const bad = [];
  const seen = new Set();
  for (const dir of SCANNED) {
    for (const file of files(join(pluginRoot, dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(/design-archive-sections\.mjs"?\s+(\S+)/);
        if (!m || m[1].startsWith('`') || m[1].startsWith('的')) return;
        const where = `${relative(pluginRoot, file)}:${i + 1}  ${line.trim().slice(0, 110)}`;
        const command = m[1];
        if (!Object.hasOwn(COMMAND_FLAGS, command)) return bad.push(`${where}  ← 没有子命令 ${command}`);
        seen.add(command);
        const after = line.slice(line.indexOf(m[0]) + m[0].length).replace(/`.*$/, '');
        for (const flag of after.match(/--[a-z][a-z-]*/g) ?? []) {
          if (!COMMAND_FLAGS[command].includes(flag)) bad.push(`${where}  ← ${command} 没有选项 ${flag}`);
        }
      });
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(COMMAND_FLAGS).sort(), 'the docs should show every subcommand');
  assert.deepEqual(bad, [], `these command lines do not match the script:\n${bad.join('\n')}`);
});

test('the places that shoot the design archive send a single-screen state to the sections script\'s `screen` command, and no longer put a no-animation style into the page', () => {
  const bad = [];
  for (const rel of ['skills/design/design-archive/references/review-archive.md', 'skills/design/design-archive/references/review-reconcile.md', 'skills/productivity/dreaming/references/initial-scan.md', 'skills/design/design-archive/references/shooting.md']) {
    const text = readFileSync(join(pluginRoot, rel), 'utf8');
    if (!/design-archive-sections\.mjs"?\s+screen\b/.test(text)) bad.push(`${rel}: 没有指向 screen 子命令的命令行`);
    if (/animation:\s*none/.test(text)) bad.push(`${rel}: 还在教注入「animation: none」的关动画样式`);
    if (/照\s*`idea-loop:ui-measure`\s*的「三条环境约定」/.test(text)) bad.push(`${rel}: 还在叫人照 ui-measure 的「三条环境约定」拍（那三条只留给 UI 实现环）`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ui-measure says its three environment conventions are for the UI implementation loop, and that the design archive\'s shots do not use them', () => {
  const text = readFileSync(join(pluginRoot, 'skills/engineering/ui-measure/SKILL.md'), 'utf8');
  assert.match(text, /设计档案的拍图不用/);
});

// ---------- scroll-driven sections: every step is a state, only a whole-screen pin makes a section scroll-driven ----------

const sectionOf = (text, heading) => {
  const from = text.indexOf(`\n## ${heading}`);
  assert.notEqual(from, -1, `no section ${heading}`);
  const next = text.indexOf('\n## ', from + 1);
  return text.slice(from, next === -1 ? undefined : next);
};
const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');

test('shooting.md: the scroll-driven section builds a state and a shot for every step — it no longer keeps only the first of steps that look alike', () => {
  const text = sectionOf(read('skills/design/design-archive/references/shooting.md'), '滚动驱动的段');
  assert.doesNotMatch(text, /结构相同的步骤只记第一个/);
  assert.match(text, /每一步(都)?(建|一个)[^。\n]*状态/);
  assert.match(text, /步骤不算重复项|不按结构相同合并/);
});

test('shooting.md: the known limits no longer list the narrow sidebar that writes the chapter it is at', () => {
  const text = sectionOf(read('skills/design/design-archive/references/shooting.md'), '已知限制');
  assert.doesNotMatch(text, /阅读进度|当前章节/);
  assert.match(text, /滚动容器/, 'the other limit stays');
});

test('writing.md: the steps of a scroll-driven section are not repeated items — the one-representative rule has that exception', () => {
  const text = sectionOf(read('skills/design/design-archive/references/writing.md'), '建模的取舍');
  const rule = text.split('\n').find((l) => l.includes('结构相同的多项只记一个代表'));
  assert.ok(rule, 'the rule is there');
  assert.match(rule, /滚动驱动的段的步骤不算重复项/);
});

test('dreaming initial-scan.md: the sentence that points at the modelling trade-offs carries the same exception', () => {
  const text = read('skills/productivity/dreaming/references/initial-scan.md');
  const line = text.split('\n').find((l) => l.includes('取舍照档案的「建模的取舍」'));
  assert.ok(line, 'the sentence is there');
  assert.match(line, /滚动驱动的段的步骤不算重复项/);
});

test('README: the sections script is described as taking only a whole-screen pin for scroll-driven — no narrower column taken by its text', () => {
  const text = read('README.md');
  assert.doesNotMatch(text, /pinned column smaller than a screen/);
  assert.match(text, /design-archive-sections\.mjs.*only a pin at least half the viewport wide and half of it tall counts/);
});
