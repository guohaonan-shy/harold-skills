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
  assert.deepEqual([...seen].sort(), Object.keys(COMMAND_FLAGS).sort(), 'the docs should show all three subcommands');
  assert.deepEqual(bad, [], `these command lines do not match the script:\n${bad.join('\n')}`);
});
