#!/usr/bin/env node
/**
 * PostToolUse hook — runs the official DESIGN.md linter on every agent write to a DESIGN.md.
 *
 * Format and structure checks belong entirely to Google's CLI (`@google/design.md`), always at
 * @latest so the check tracks the newest spec; this file only decides whether a write is a
 * DESIGN.md, calls the CLI, and turns its JSON into feedback for the model.
 *
 * - Not a DESIGN.md, or the file is gone → silent exit 0 (must never slow normal work).
 * - Lint errors → findings on stderr + exit 2, which Claude Code feeds back to the model.
 * - Warnings only → silent; design-modeling's closing `diff` step judges regressions.
 * - CLI unreachable (offline, registry down, non-JSON output) → note on stderr, exit 0.
 *   A lint we could not run is not a lint failure; blocking every write while offline would be.
 *
 * DESIGN_MD_CLI overrides the command (tests point it at a fake CLI instead of the network).
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function isDesignMd(filePath) {
  return typeof filePath === 'string' && basename(filePath) === 'DESIGN.md';
}

// The CLI's lint report: { findings: [{ severity, path?, message, rule }], summary: { errors, ... } }.
export function renderErrors(report, filePath) {
  const errors = (report?.findings || []).filter((f) => f.severity === 'error');
  if (errors.length === 0) return null;
  const lines = errors.map((f) => `- [${f.rule}]${f.path ? ` ${f.path}:` : ''} ${f.message}`);
  return [
    `@google/design.md lint found ${errors.length} error(s) in ${filePath}:`,
    ...lines,
    '\nFix these before continuing. Format and structure follow the official spec (`npx -y @google/design.md@latest spec`).',
  ].join('\n');
}

function runCli(filePath) {
  const [cmd, ...args] = process.env.DESIGN_MD_CLI
    ? [process.execPath, process.env.DESIGN_MD_CLI]
    : ['npx', '-y', '@google/design.md@latest'];
  const res = spawnSync(cmd, [...args, 'lint', filePath], { encoding: 'utf8', timeout: 120_000 });
  try {
    return { report: JSON.parse(res.stdout) };
  } catch {
    return { unreachable: (res.error?.message || res.stderr || 'no JSON output').trim() };
  }
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }
  const filePath = payload?.tool_input?.file_path || '';
  if (!isDesignMd(filePath) || !existsSync(filePath)) return 0;

  const { report, unreachable } = runCli(filePath);
  if (unreachable) {
    console.error(`design-md-hook: could not run @google/design.md lint (${unreachable.split('\n')[0]}); skipped.`);
    return 0;
  }
  const message = renderErrors(report, filePath);
  if (!message) return 0;
  console.error(message);
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
