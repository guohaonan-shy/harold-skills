#!/usr/bin/env node
/**
 * UI implementation loop — the measurement script.
 *
 * The judge of the loop is this script, not an agent. It opens ONE browser with
 * TWO tabs (the design canvas, the ported local route), walks the acceptance
 * matrix cell by cell, puts both tabs in the same viewport / DPR / color scheme /
 * state, and feeds the two comparators in `ui-compare.mjs`. Everything it prints
 * is derived from numbers it measured; nothing here is an opinion.
 *
 * Everything deterministic lives in ui-compare.mjs and is unit-tested. This file
 * is the browser boundary: driving playwright, navigating, measuring the DOM,
 * screenshotting. It has no unit tests on purpose — mocking a browser would test
 * the mock. It is covered by actually running it.
 *
 * Usage:  node ui-measure.mjs <matrix.json> [--json] [--keep-open]
 * Exit:   0 = green (or only human-review cells left), 2 = findings.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareMeasurements, comparePixels, pixelFinding, sortFindings, renderFindings,
  DEFAULT_TOLERANCE, DEFAULT_ANTIALIAS_TOLERANCE, DEFAULT_PIXEL_THRESHOLD,
} from './ui-compare.mjs';

/**
 * Resolve playwright from the TARGET PROJECT, not from this plugin.
 * The plugin directory is read-only (a marketplace upgrade swaps its path), so it
 * carries no node_modules. The project being verified already runs a browser.
 */
async function loadPlaywright() {
  const requireFromCwd = createRequire(pathToFileURL(join(process.cwd(), 'noop.js')));
  // playwright ships CommonJS: a dynamic import hands back a namespace whose
  // `default` is the real module, so unwrap before reaching for `chromium`.
  const unwrap = (mod) => (mod.chromium ? mod : mod.default);
  try {
    return unwrap(await import(pathToFileURL(requireFromCwd.resolve('playwright')).href));
  } catch {
    try {
      return unwrap(await import(pathToFileURL(requireFromCwd.resolve('playwright-core')).href));
    } catch {
      console.error(
        'ui-measure: playwright is not resolvable from this project.\n' +
        '  Install it where the project lives:  npm i -D playwright && npx playwright install chromium',
      );
      process.exit(1);
    }
  }
}

/** Properties pulled off every anchored element. Order is the reference's order. */
const MEASURED_STYLES = [
  'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
  'letterSpacing', 'textTransform', 'borderRadius', 'borderWidth', 'borderColor',
  'boxShadow', 'opacity',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gap', 'rowGap', 'columnGap',
];

/** Runs in the page. Returns { <anchor>: { …measurements } }. */
function measureInPage(styleProps) {
  const px = (v) => (/^-?[\d.]+px$/.test(v) ? Number.parseFloat(v) : v);
  const out = {};
  for (const el of document.querySelectorAll('[data-anchor]')) {
    const anchor = el.getAttribute('data-anchor');
    if (out[anchor]) continue; // first wins; duplicate anchors are a canvas bug
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const m = {
      top: Math.round((rect.top + window.scrollY) * 100) / 100,
      left: Math.round((rect.left + window.scrollX) * 100) / 100,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
    };
    for (const p of styleProps) m[p] = px(cs[p]);
    out[anchor] = m;
  }
  return out;
}

/** Kill motion so a screenshot is a function of the DOM, not of when it was taken. */
const FREEZE_CSS = `*, *::before, *::after {
  animation: none !important; transition: none !important;
  caret-color: transparent !important; scroll-behavior: auto !important;
}`;

function withState(url, state) {
  if (!state) return url;
  const u = new URL(url);
  u.searchParams.set('state', state);
  return u.toString();
}

async function prepare(page, url, cell) {
  await page.setViewportSize(cell.viewport);
  await page.emulateMedia({ colorScheme: cell.colorScheme ?? 'light' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.evaluate(() => document.fonts.ready);
}

/** PNG buffer → RGBA, decoded by the browser that produced it (no npm decoder). */
async function toRgba(scratch, buffer) {
  return scratch.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const img = canvas.getContext('2d').getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: img.width, height: img.height, data: Array.from(img.data) };
  }, buffer.toString('base64'));
}

/** Identity of a finding for plateau detection — the defect, not its numbers. */
const fingerprint = (f) => `${f.cell}|${f.id}|${f.anchor}|${f.property}`;

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const matrixPath = args.find((a) => !a.startsWith('--'));
  if (!matrixPath) {
    console.error('usage: ui-measure.mjs <matrix.json> [--json]');
    process.exit(1);
  }

  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const base = {
    position: DEFAULT_TOLERANCE.position,
    antialias: DEFAULT_ANTIALIAS_TOLERANCE,
    pixel: DEFAULT_PIXEL_THRESHOLD,
    ...(matrix.tolerance ?? {}),
  };

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: matrix.dpr ?? 1 });
  const canvasTab = await context.newPage();
  const localTab = await context.newPage();
  const scratch = await context.newPage();
  await scratch.goto('about:blank');

  const findings = [];
  const humanCells = [];

  try {
    for (const cell of matrix.cells) {
      if (cell.review === 'human') { humanCells.push(cell.name); continue; }

      const tol = { ...base, ...(cell.tolerance ?? {}) };
      await prepare(canvasTab, withState(matrix.canvas, cell.state), cell);
      await prepare(localTab, withState(matrix.local, cell.state), cell);

      const canvasM = await canvasTab.evaluate(measureInPage, MEASURED_STYLES);
      const localM = await localTab.evaluate(measureInPage, MEASURED_STYLES);
      findings.push(...compareMeasurements(
        canvasM, localM,
        { position: tol.position, byAnchor: cell.byAnchor ?? {} },
        { cell: cell.name },
      ));

      const canvasPng = await toRgba(scratch, await canvasTab.screenshot());
      const localPng = await toRgba(scratch, await localTab.screenshot());
      const percent = comparePixels(canvasPng, localPng, { antialias: tol.antialias });
      const pf = pixelFinding(percent, { cell: cell.name, threshold: tol.pixel });
      if (pf) findings.push(pf);
    }
  } finally {
    await browser.close();
  }

  const sorted = sortFindings(findings);

  // Plateau is mechanical: the same defects, cell for cell, two runs running.
  const memo = resolve(dirname(matrixPath), '.ui-measure-last.json');
  const previous = existsSync(memo) ? JSON.parse(readFileSync(memo, 'utf8')) : null;
  const current = sorted.map(fingerprint);
  const plateau = previous !== null && sorted.length > 0
    && previous.length === current.length && previous.every((f, i) => f === current[i]);
  writeFileSync(memo, JSON.stringify(current, null, 2));

  if (asJson) {
    console.log(JSON.stringify({ findings: sorted, plateau, humanReviewCells: humanCells }, null, 2));
  } else {
    console.log(renderFindings(sorted));
    if (plateau) console.log('\nPLATEAU — identical findings two runs running. Stop and hand it to a human.');
    if (humanCells.length) console.log(`\nHUMAN REVIEW (not green, not checked): ${humanCells.join(', ')}`);
  }
  process.exit(sorted.length ? 2 : 0);
}

main();
