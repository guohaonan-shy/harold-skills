#!/usr/bin/env node
/**
 * Fills one of pr-review's fixed Codex prompt templates, so the reviewer passes only what changes per run.
 *
 * The templates (skills/engineering/pr-review/references/codex-<axis>.md) hold everything that stays the
 * same: the axis's one question, the read-only constraint, which sections of review-standards and
 * decision-rules to read, the JSON to return. What changes per run comes in as `key=value`: the worktree,
 * the merge-base, the spec and tickets (Spec axis), the rule sources and the mechanical-check results
 * (Standards axis), the items the human already marked 不修. The paths of review-standards and
 * decision-rules are filled in here, from the plugin's own layout. A placeholder left unfilled, or a key
 * the template does not use, is refused, so a prompt never goes out half-written.
 *
 * A third template, `integration`, is the Spec axis of a release root's integration PR: it takes several
 * specs (`specs=`) and asks only about clashes between them.
 *
 * Usage:
 *   node codex-prompt.mjs <spec|standards|integration> <out-file> key=value...
 * Exit: 0 = written, 1 = refused (the reason on stderr).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const BUILTIN = {
  standards: join(ROOT, 'skills/engineering/pr-review/references/review-standards.md'),
  decision_rules: join(ROOT, 'skills/productivity/decision-rules/SKILL.md'),
};

export const templatePath = (axis) => join(ROOT, `skills/engineering/pr-review/references/codex-${axis}.md`);

/** Fills `{{key}}` from `values`; throws naming every placeholder left empty and every key the template does not use. */
export function render(template, values) {
  const used = new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
  const missing = [...used].filter((k) => values[k] === undefined || values[k] === '');
  const unknown = Object.keys(values).filter((k) => !used.has(k) && !(k in BUILTIN));
  if (missing.length || unknown.length) {
    const why = [missing.length && `没给：${missing.join(', ')}`, unknown.length && `模板里没有：${unknown.join(', ')}`].filter(Boolean);
    throw new Error(`拒绝：${why.join('；')}`);
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]);
}

function main() {
  const [axis, out, ...pairs] = process.argv.slice(2);
  if (!['spec', 'standards', 'integration'].includes(axis) || !out) throw new Error('usage: codex-prompt.mjs <spec|standards|integration> <out-file> key=value...');
  const values = { ...BUILTIN };
  for (const p of pairs) {
    const i = p.indexOf('=');
    if (i < 1) throw new Error(`「${p}」不是 key=value`);
    values[p.slice(0, i)] = p.slice(i + 1);
  }
  writeFileSync(out, render(readFileSync(templatePath(axis), 'utf8'), values));
  console.log(out);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
