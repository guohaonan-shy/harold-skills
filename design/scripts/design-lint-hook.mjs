#!/usr/bin/env node
/**
 * PostToolUse hook — the automatic trigger for design-lint.mjs.
 *
 * The daemon-side lint of open-design, ported to a Claude Code hook: every Write/Edit
 * that lands in a design canvas gets linted without
 * anyone remembering to check, and findings are fed back to the model (stderr + exit 2).
 * Fully self-contained — no external detector is chained in; every rule (including
 * bounce-easing and layout-transition) lives natively in design-lint.mjs.
 *
 * Silent (exit 0) for non-preview files — this hook must never slow down normal work.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Canvases live in docs/design/tmp/<spec-slug>/canvas/ (uiux-refine's home; they stay there until
// the requirement is archived). The two scratch dirs stay recognized for protocols run outside
// refine and for older projects. Only HTML directly inside canvas/ counts: canvas/assets/ holds
// captures, and imagine/ holds throwaway comparison pages, not canvases.
const CANVAS = /(?:(?:^|\/)(?:design-preview|design-motion-preview)\/[^/]*|(?:^|\/)docs\/design\/tmp\/[^/]+\/canvas\/[^/]*)\.html?$/;

/** Does this path name a design canvas the hook should lint? */
export function isCanvas(filePath) {
  return typeof filePath === 'string' && CANVAS.test(filePath);
}

async function main() {
  // --- read hook payload from stdin ---
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const filePath = payload?.tool_input?.file_path || '';
  if (!isCanvas(filePath)) process.exit(0);
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
    '\nFix P0 before continuing (design-core.md, section Close-out protocol); P1 should be fixed or consciously justified in the review list.',
  ]
    .filter(Boolean)
    .join('\n');

  console.error(report);
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
