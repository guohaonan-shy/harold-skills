#!/usr/bin/env node
/**
 * PostToolUse hook — the automatic trigger for glossary-check.mjs.
 *
 * Every Write/Edit that lands on a file named GLOSSARY.md gets linted without anyone remembering
 * to run it; violations are fed back to the model (stderr + exit 2) so it fixes them in the same
 * turn. The target repo's CI runs the same check for edits that never went through this hook.
 *
 * Silent (exit 0) for every other file — this hook must never slow down normal work.
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const filePath = payload?.tool_input?.file_path || '';
if (basename(filePath) !== 'GLOSSARY.md') process.exit(0);
if (!existsSync(filePath)) process.exit(0);

const { checkGlossary, renderReport } = await import(join(here, 'glossary-check.mjs'));
const result = checkGlossary(readFileSync(filePath, 'utf8'));
if (result.valid) process.exit(0);

console.error(
  `${renderReport(result, filePath)}\n\n改到通过再继续。格式规则见 idea-loop 的 references/glossary.md §3；` +
    '挪出去的内容按 §2「不收的东西去哪」放。',
);
process.exit(2);
