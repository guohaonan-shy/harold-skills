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

test('the shooting reference offers a case for a state taller than the main viewport with no sections, and every place that shoots single-screen states runs `cover` for it', () => {
  const bad = [];
  const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');
  const shooting = read('skills/design/design-archive/references/shooting.md');
  const choose = shooting.split('\n').find((line) => line.startsWith('**情形怎么选**')) ?? '';
  if (!choose.includes('比主视口高、不分段的状态')) bad.push('shooting.md:「情形怎么选」里没有「比主视口高、不分段的状态」');
  if (!/^## 比主视口高、不分段的状态$/m.test(shooting)) bad.push('shooting.md: 没有「## 比主视口高、不分段的状态」这一节');
  for (const rel of ['skills/design/design-archive/references/shooting.md', 'skills/design/design-archive/references/review-reconcile.md', 'skills/design/design-archive/references/review-archive.md', 'skills/productivity/dreaming/references/initial-scan.md']) {
    if (!/design-archive-sections\.mjs"?\s+cover\b/.test(read(rel))) bad.push(`${rel}: 拍单屏 / 不分段状态的地方没有指向 cover 子命令的命令行`);
  }
  const route = read('skills/design/design-archive/SKILL.md').split('\n').find((line) => line.includes('references/shooting.md')) ?? '';
  if (!route.includes('比主视口高')) bad.push('SKILL.md: 「按需读」表里拍档案截图那一行没有列这种情形');
  const step7 = read('skills/productivity/dreaming/references/initial-scan.md').split('\n').find((line) => line.startsWith('7. **只拍精简矩阵**')) ?? '';
  if (!step7.includes('比主视口高、不分段的状态')) bad.push('initial-scan.md: 第 7 步的情形列表里没有「比主视口高、不分段的状态」');
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('the reconcile reference compares the cover pictures one by one with the same-named pictures in prod/, and calls a changed grouping a stale archive whose `shot` is rewritten', () => {
  const text = readFileSync(join(pluginRoot, 'skills/design/design-archive/references/review-reconcile.md'), 'utf8');
  const bad = [];
  if (!/补拍图逐张/.test(text)) bad.push('没有写补拍图逐张跟 prod/ 里同名的图比');
  if (!/分组[^。]*档案过期[^。]*shot|分组[^。]*shot[^。]*档案过期/.test(text)) bad.push('没有写 cover 的分组跟 prod/ 里的 shot 不一样时判档案过期、按新分组重写 shot');
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ui-measure says its three environment conventions are for the UI implementation loop, and that the design archive\'s shots do not use them', () => {
  const text = readFileSync(join(pluginRoot, 'skills/engineering/ui-measure/SKILL.md'), 'utf8');
  assert.match(text, /设计档案的拍图不用/);
});
