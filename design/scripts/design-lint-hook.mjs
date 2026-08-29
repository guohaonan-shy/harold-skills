#!/usr/bin/env node
/**
 * PostToolUse hook — the automatic trigger for design-lint.mjs.
 *
 * The daemon-side lint of open-design, ported to a Claude Code hook: every Write/Edit
 * that lands in design-preview/ or design-motion-preview/ HTML gets linted without
 * anyone remembering to check, and findings are fed back to the model (stderr + exit 2).
 * Additionally chains impeccable's bundled deterministic detector (detect.mjs) when it
 * is installed, so its 36 AI-slop rules run alongside our brand rules.
 *
 * Silent (exit 0) for non-preview files — this hook must never slow down normal work.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
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

// --- chain impeccable's deterministic detector when installed ---
let detectReport = '';
const detectCandidates = [
  join(homedir(), '.claude/plugins/marketplaces/impeccable/.cursor/skills/impeccable/scripts/detect.mjs'),
  join(homedir(), '.claude/plugins/marketplaces/impeccable/.claude/skills/impeccable/scripts/detect.mjs'),
];
const detect = detectCandidates.find((p) => existsSync(p));
if (detect) {
  try {
    execFileSync('node', [detect, '--json', filePath], { encoding: 'utf8', timeout: 20000 });
    detectReport = 'impeccable detect: clean ✓';
  } catch (e) {
    // exit code 2 = findings; anything on stdout is the JSON report
    const out = (e.stdout || '').trim();
    if (out) {
      try {
        const parsed = JSON.parse(out);
        // Brand overrides (design-core §4): rules that contradict a locked DESIGN.md decision.
        const BRAND_IGNORED = new Set(['overused-font']); // Inter / Plus Jakarta Sans ARE the brand fonts
        const list = (Array.isArray(parsed) ? parsed : parsed.findings || []).filter(
          (f) => !BRAND_IGNORED.has(f.antipattern),
        );
        detectReport = list
          .slice(0, 10)
          .map((f) => `  [detect:${f.antipattern || '?'}] ${f.severity || ''} ${f.name || ''}${f.snippet ? ` — ${String(f.snippet).slice(0, 50)}` : ''}${f.line ? ` (line ${f.line})` : ''}`.trim())
          .join('\n');
        if (list.length > 10) detectReport += `\n  …and ${list.length - 10} more`;
        if (list.length === 0) detectReport = 'impeccable detect: clean ✓ (brand-overridden rules filtered)';
      } catch {
        detectReport = out.slice(0, 800);
      }
    } else {
      detectReport = `impeccable detect: skipped (${(e.message || '').split('\n')[0]})`;
    }
  }
} else {
  detectReport = 'impeccable detect: not installed, skipped';
}

const hasBlocking = findings.some((f) => f.severity === 'P0' || f.severity === 'P1');
const detectHasFindings = detectReport.includes('[detect:');

if (!hasBlocking && !detectHasFindings) process.exit(0); // clean — stay silent

const report = [
  `design-lint on ${filePath}:`,
  renderFindings(findings),
  detectReport ? `\n${detectReport}` : '',
  '\nFix P0 before continuing (design-core.md §6.1); P1 should be fixed or consciously justified in the review list.',
]
  .filter(Boolean)
  .join('\n');

console.error(report);
process.exit(2);
