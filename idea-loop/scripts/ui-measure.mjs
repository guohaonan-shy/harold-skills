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
 * Two kinds of run, picked by the matrix:
 *   - default: `canvas` vs `local`, cell by cell, findings with severities. Either
 *     side may be an implementation route or a canvas address (a version of a
 *     canvas), so two canvases compare the same way. A cell may carry
 *     `shotAnchor: "<anchor>"` to compare only that anchor's area instead of the
 *     viewport.
 *   - `"mode": "canvas-diff"`: `before` vs `after` (two versions of one canvas),
 *     the list of anchors that changed, each with the two area screenshots, and —
 *     if the matrix has a `changeSet` — split into declared / undeclared.
 *     The decisions live in ui-canvas-diff.mjs.
 *
 * Usage:  node ui-measure.mjs <matrix.json> [--json] [--keep-open]
 * Exit:   0 = green (or only human-review cells left), 2 = findings. In
 *         canvas-diff mode: 0 = nothing for a human to look at (no change, or only
 *         changes the change set declared), 2 = otherwise.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareMeasurements, comparePixels, pixelFinding, sortFindings, renderFindings,
  DEFAULT_TOLERANCE, DEFAULT_ANTIALIAS_TOLERANCE, DEFAULT_PIXEL_THRESHOLD,
} from './ui-compare.mjs';
import {
  regionBox, diffAnchors, parseChangeSet, classifyChanges, shotFileName, renderCanvasDiff, hasAttention,
} from './ui-canvas-diff.mjs';

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

/** Size of the whole page (CSS px) — the limit a region is cut down to. */
const pageSize = (page) => page.evaluate(() => ({
  width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
}));

/**
 * Cut the same region out of both tabs. Page coordinates, so an anchor below the
 * fold is cut like any other (hence fullPage). Returns null when there is no
 * region (see regionBox).
 */
async function regionShots(tabA, tabB, rectA, rectB) {
  const box = regionBox(rectA, rectB, await pageSize(tabA), await pageSize(tabB));
  if (!box) return null;
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
  return { box, a: await tabA.screenshot({ clip, fullPage: true }), b: await tabB.screenshot({ clip, fullPage: true }) };
}

/** Identity of a finding for 瓶颈 (bottleneck) detection — the defect, not its numbers. */
const fingerprint = (f) => `${f.cell}|${f.id}|${f.anchor}|${f.property}`;

/**
 * Canvas-diff run: `before` and `after` are two versions of one canvas. Per cell,
 * per anchor: measure both, compare, cut the anchor's area out of both and compare
 * the pixels; anything that differs is a changed anchor and gets its two area
 * screenshots written to disk. The change set (optional) splits the changes into
 * declared / undeclared.
 */
async function runCanvasDiff({ matrix, matrixPath, base, browser, beforeTab, afterTab, scratch, asJson }) {
  if (!matrix.before || !matrix.after) {
    console.error('ui-measure: a canvas-diff matrix needs "before" and "after" (the two canvas addresses)');
    process.exit(1);
  }
  let changeSet = null;
  if (matrix.changeSet !== undefined) {
    try {
      changeSet = parseChangeSet(matrix.changeSet);
    } catch (e) {
      console.error(`ui-measure: ${e.message}`);
      process.exit(1);
    }
  }
  const shotsDir = resolve(dirname(matrixPath), matrix.shotsDir ?? 'ui-measure-shots');
  const changed = [];
  const states = new Set();
  const humanCells = [];

  try {
    for (const cell of matrix.cells) {
      if (cell.review === 'human') { humanCells.push(cell.name); continue; }
      const state = cell.state ?? cell.name;
      states.add(state);
      // Two versions of a canvas: any pixel that visibly differs is a change, unless the matrix says otherwise.
      const tol = { ...base, pixel: matrix.tolerance?.pixel ?? 0, ...(cell.tolerance ?? {}) };
      await prepare(beforeTab, withState(matrix.before, cell.state), cell);
      await prepare(afterTab, withState(matrix.after, cell.state), cell);
      const beforeM = await beforeTab.evaluate(measureInPage, MEASURED_STYLES);
      const afterM = await afterTab.evaluate(measureInPage, MEASURED_STYLES);

      const byAnchor = new Map(
        diffAnchors(beforeM, afterM, { position: tol.position, byAnchor: cell.byAnchor ?? {} }).map((c) => [c.anchor, c]),
      );

      for (const anchor of new Set([...Object.keys(beforeM), ...Object.keys(afterM)])) {
        const shots = await regionShots(beforeTab, afterTab, beforeM[anchor], afterM[anchor]);
        let pixelPercent = null;
        if (shots) {
          pixelPercent = comparePixels(
            await toRgba(scratch, shots.a), await toRgba(scratch, shots.b), { antialias: tol.antialias },
          );
        }
        const entry = byAnchor.get(anchor)
          ?? (pixelPercent !== null && pixelPercent > tol.pixel ? { anchor, kind: 'changed', changes: [] } : null);
        if (!entry) continue;
        const item = { cell: cell.name, state, ...entry, pixelPercent, shots: null };
        if (shots) {
          mkdirSync(shotsDir, { recursive: true });
          const before = resolve(shotsDir, shotFileName(cell.name, anchor, 'before'));
          const after = resolve(shotsDir, shotFileName(cell.name, anchor, 'after'));
          writeFileSync(before, shots.a);
          writeFileSync(after, shots.b);
          item.shots = { before, after };
        }
        changed.push(item);
      }
    }
  } finally {
    await browser.close();
  }

  const classified = changeSet
    ? classifyChanges(changed, changeSet, [...states])
    : { declared: [], undeclared: [], declaredUnchanged: [], unchecked: [] };
  const report = { changed, ...classified };
  if (asJson) {
    console.log(JSON.stringify({ mode: 'canvas-diff', classified: changeSet !== null, ...report, humanReviewCells: humanCells }, null, 2));
  } else {
    console.log(renderCanvasDiff(report, changeSet !== null));
    if (changed.some((c) => c.shots)) console.log(`\n区域截图（两版各一张）在 ${shotsDir}`);
    if (humanCells.length) console.log(`\nHUMAN REVIEW (not green, not checked): ${humanCells.join(', ')}`);
  }
  process.exit(hasAttention(report, changeSet !== null) ? 2 : 0);
}

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

  if (matrix.mode === 'canvas-diff') {
    await runCanvasDiff({ matrix, matrixPath, base, browser, beforeTab: canvasTab, afterTab: localTab, scratch, asJson });
    return;
  }

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

      // Default: the viewport frame. A cell with `shotAnchor` compares only that
      // anchor's area (the same box cut from both tabs, so the sizes agree).
      let canvasShot;
      let localShot;
      if (cell.shotAnchor) {
        if (!canvasM[cell.shotAnchor] && !localM[cell.shotAnchor]) {
          console.error(`ui-measure: cell "${cell.name}": shotAnchor "${cell.shotAnchor}" is on neither page`);
          process.exit(1);
        }
        const shots = await regionShots(canvasTab, localTab, canvasM[cell.shotAnchor], localM[cell.shotAnchor]);
        if (!shots) continue; // no area to look at; a missing anchor is already a finding above
        canvasShot = shots.a;
        localShot = shots.b;
      } else {
        canvasShot = await canvasTab.screenshot();
        localShot = await localTab.screenshot();
      }
      const canvasPng = await toRgba(scratch, canvasShot);
      const localPng = await toRgba(scratch, localShot);
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
  const bottleneck = previous !== null && sorted.length > 0
    && previous.length === current.length && previous.every((f, i) => f === current[i]);
  writeFileSync(memo, JSON.stringify(current, null, 2));

  if (asJson) {
    console.log(JSON.stringify({ findings: sorted, 瓶颈: bottleneck, humanReviewCells: humanCells }, null, 2));
  } else {
    console.log(renderFindings(sorted));
    if (bottleneck) console.log('\n瓶颈：同一批 finding 连续两轮不变。停下，交给人。');
    if (humanCells.length) console.log(`\nHUMAN REVIEW (not green, not checked): ${humanCells.join(', ')}`);
  }
  process.exit(sorted.length ? 2 : 0);
}

main();
