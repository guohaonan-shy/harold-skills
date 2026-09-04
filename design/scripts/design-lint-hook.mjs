#!/usr/bin/env node
/**
 * PostToolUse hook — the automatic trigger for design-lint.mjs.
 *
 * The daemon-side lint of open-design, ported to a Claude Code hook: every Write/Edit
 * that lands in design-preview/ or design-motion-preview/ HTML gets linted without
 * anyone remembering to check, and findings are fed back to the model (stderr + exit 2).
 * Fully self-contained — no external detector is chained in; every rule (including
 * bounce-easing and layout-transition) lives natively in design-lint.mjs.
 *
 * Silent (exit 0) for non-preview files — this hook must never slow down normal work.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// --- read hook payload from stdin ---
let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const filePath = payload?.tool_input?.file_path || '';
if (!/(?:design-preview|design-motion-preview)\/[^/]*\.html?$/.test(filePath)) process.exit(0);
if (!existsSync(filePath)) process.exit(0);

// --- our brand + anti-slop lint ---
const { lintHtml, renderFindings } = await import(join(here, 'design-lint.mjs'));
const html = readFileSync(filePath, 'utf8');
const findings = lintHtml(html, filePath);

const hasBlocking = findings.some((f) => f.severity === 'P0' || f.severity === 'P1');

if (!hasBlocking) process.exit(0); // clean — stay silent

const report = [
  `design-lint on ${filePath}:`,
  renderFindings(findings),
  '\nFix P0 before continuing (design-core.md §6.1); P1 should be fixed or consciously justified in the review list.',
]
  .filter(Boolean)
  .join('\n');

console.error(report);
process.exit(2);
