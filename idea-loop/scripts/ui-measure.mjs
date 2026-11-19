#!/usr/bin/env node
/**
 * UI implementation loop — the measurement script.
 *
 * The judge of the loop is this script, not an agent. It opens ONE browser and,
 * per matrix, ONE context with TWO tabs (the design canvas, the ported local
 * route), walks the acceptance matrix cell by cell, puts both tabs in the same
 * viewport / DPR / color scheme / state, and feeds the two comparators in
 * `ui-compare.mjs`. Everything it prints is derived from numbers it measured;
 * nothing here is an opinion.
 *
 * Several matrices (e.g. language × color scheme) go to ONE invocation: they share
 * the browser, each in its own context. How many run at once is picked from the
 * machine's free memory and idle cores, at most 4 (`ui-measure-concurrency.mjs`);
 * --concurrency N overrides it, still capped at 4.
 * Do not start one process per matrix — every process is another browser.
 *
 * Screenshots are decoded here in node (`decodePng`, zlib) and compared by the
 * unit-tested `comparePixels`. They never travel back into a page: up to 0.1.25 each
 * frame went into a blank tab and came back through `evaluate` as a plain JS array,
 * ~11 s per 1200×900 frame with the node process near 1 GiB — 95% of the run.
 *
 * Everything deterministic lives in ui-compare.mjs and is unit-tested. This file
 * is the browser boundary: driving playwright, navigating, measuring the DOM,
 * screenshotting. It has no unit tests on purpose — mocking a browser would test
 * the mock. It is covered by actually running it.
 *
 * Two kinds of matrix, picked by the matrix itself (several of either kind can go
 * to one invocation):
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
 * Usage:  node ui-measure.mjs <matrix.json> [<matrix.json> …] [--json] [--concurrency N]
 * Exit:   0 = green (or only human-review cells left), 2 = findings. A canvas-diff
 *         matrix counts as green when there is nothing for a human to look at (no
 *         change, or only changes the change set declared).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareMeasurements, comparePixels, pixelFinding, sortFindings, renderFindings,
  DEFAULT_TOLERANCE, DEFAULT_ANTIALIAS_TOLERANCE, DEFAULT_PIXEL_THRESHOLD,
} from './ui-compare.mjs';
import {
  regionBox, padSize, diffAnchors, parseChangeSet, classifyChanges, shotFileName, renderCanvasDiff, hasAttention,
} from './ui-canvas-diff.mjs';
import { decodePng } from './ui-png-compare.mjs';
import { pickConcurrency, sampleIdleCores } from './ui-measure-concurrency.mjs';
import { availableParallelism, cpus, freemem } from 'node:os';


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

/** Size of the whole page (CSS px) — the limit a region is cut down to. */
const pageSize = (page) => page.evaluate(() => ({
  width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
}));

/**
 * Make the page at least `size` big without moving anything on it: one invisible,
 * absolutely positioned box. The page's own background fills the added area, so a
 * crop of it is the blank the page really has there.
 */
function padPage(page, size) {
  return page.evaluate(({ width, height }) => {
    const pad = document.createElement('div');
    pad.setAttribute('aria-hidden', 'true');
    pad.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;visibility:hidden;pointer-events:none`;
    document.documentElement.appendChild(pad);
  }, size);
}

/**
 * Cut the same region out of both tabs. Page coordinates, so an anchor below the
 * fold is cut like any other (hence fullPage). Returns null when there is no
 * region (see regionBox).
 *
 * `union`: the two tabs are two versions of one canvas. The region is cut from the
 * longer page's extent and the shorter page is padded to it, so a block the new
 * version added past the old page's end gets two same-size crops (the old one blank).
 */
async function regionShots(tabA, tabB, rectA, rectB, { union = false } = {}) {
  const box = regionBox(rectA, rectB, await pageSize(tabA), await pageSize(tabB), { union });
  if (!box) return null;
  if (union) await Promise.all([padPage(tabA, padSize(box)), padPage(tabB, padSize(box))]);
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
  const [a, b] = await Promise.all([tabA.screenshot({ clip, fullPage: true }), tabB.screenshot({ clip, fullPage: true })]);
  return { box, a, b };
}

/** Identity of a finding for 瓶颈 (bottleneck) detection — the defect, not its numbers. */
const fingerprint = (f) => `${f.cell}|${f.id}|${f.anchor}|${f.property}`;

/**
 * Where a matrix remembers last round's fingerprints. `matrix.json` keeps the
 * historical `.ui-measure-last.json`; any other name gets its own file so two
 * matrices in one directory never read each other's round.
 */
function memoPath(matrixPath) {
  const name = basename(matrixPath);
  const stem = name.replace(/\.json$/i, '');
  return resolve(dirname(matrixPath), name === 'matrix.json' ? '.ui-measure-last.json' : `.ui-measure-last.${stem}.json`);
}

/** Walk one matrix in its own context (two tabs) of the shared browser. */
async function runMatrix(browser, matrix) {
  const base = {
    position: DEFAULT_TOLERANCE.position,
    antialias: DEFAULT_ANTIALIAS_TOLERANCE,
    pixel: DEFAULT_PIXEL_THRESHOLD,
    ...(matrix.tolerance ?? {}),
  };
  const context = await browser.newContext({ deviceScaleFactor: matrix.dpr ?? 1 });
  const canvasTab = await context.newPage();
  const localTab = await context.newPage();

  const findings = [];
  const humanCells = [];
  try {
    for (const cell of matrix.cells) {
      if (cell.review === 'human') { humanCells.push(cell.name); continue; }

      const tol = { ...base, ...(cell.tolerance ?? {}) };
      // One tab after the other, on purpose: loading both at once changed a
      // measured top by 1px on a real port (a layout that depends on load timing),
      // so the verdict would no longer match the serial walk's.
      await prepare(canvasTab, withState(matrix.canvas, cell.state), cell);
      await prepare(localTab, withState(matrix.local, cell.state), cell);

      const [canvasM, localM] = await Promise.all([
        canvasTab.evaluate(measureInPage, MEASURED_STYLES),
        localTab.evaluate(measureInPage, MEASURED_STYLES),
      ]);
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
          throw new Error(`cell "${cell.name}": shotAnchor "${cell.shotAnchor}" is on neither page`);
        }
        const shots = await regionShots(canvasTab, localTab, canvasM[cell.shotAnchor], localM[cell.shotAnchor]);
        if (!shots) continue; // no area to look at; a missing anchor is already a finding above
        canvasShot = shots.a;
        localShot = shots.b;
      } else {
        [canvasShot, localShot] = await Promise.all([canvasTab.screenshot(), localTab.screenshot()]);
      }
      const percent = comparePixels(
        decodePng(canvasShot, `${cell.name} canvas`),
        decodePng(localShot, `${cell.name} local`),
        { antialias: tol.antialias },
      );
      const pf = pixelFinding(percent, { cell: cell.name, threshold: tol.pixel });
      if (pf) findings.push(pf);
    }
  } finally {
    await context.close();
  }
  return { findings: sortFindings(findings), humanCells };
}

/** A canvas-diff matrix's input errors, found before any browser starts. Returns its change set or null. */
function checkCanvasDiff(matrix) {
  if (!matrix.before || !matrix.after) {
    throw new Error('a canvas-diff matrix needs "before" and "after" (the two canvas addresses)');
  }
  return matrix.changeSet === undefined ? null : parseChangeSet(matrix.changeSet);
}

/**
 * Canvas-diff matrix: `before` and `after` are two versions of one canvas, in one
 * context (two tabs) of the shared browser like any matrix. Per cell, per anchor:
 * measure both, compare, cut the anchor's area out of both and compare the pixels;
 * anything that differs is a changed anchor and gets its two area screenshots
 * written to disk. The change set (optional) splits the changes into declared /
 * undeclared.
 */
async function runCanvasDiff(browser, matrix, matrixPath, changeSet) {
  const base = {
    position: DEFAULT_TOLERANCE.position,
    antialias: DEFAULT_ANTIALIAS_TOLERANCE,
    ...(matrix.tolerance ?? {}),
    // Two versions of a canvas: any pixel that visibly differs is a change, unless the matrix says otherwise.
    pixel: matrix.tolerance?.pixel ?? 0,
  };
  const shotsDir = resolve(dirname(matrixPath), matrix.shotsDir ?? 'ui-measure-shots');
  const context = await browser.newContext({ deviceScaleFactor: matrix.dpr ?? 1 });
  const beforeTab = await context.newPage();
  const afterTab = await context.newPage();

  const changed = [];
  const states = new Set();
  const humanCells = [];
  try {
    for (const cell of matrix.cells) {
      if (cell.review === 'human') { humanCells.push(cell.name); continue; }
      const state = cell.state ?? cell.name;
      states.add(state);
      const tol = { ...base, ...(cell.tolerance ?? {}) };
      // One tab after the other, as in runMatrix: loading both at once can move a measured box.
      await prepare(beforeTab, withState(matrix.before, cell.state), cell);
      await prepare(afterTab, withState(matrix.after, cell.state), cell);
      const [beforeM, afterM] = await Promise.all([
        beforeTab.evaluate(measureInPage, MEASURED_STYLES),
        afterTab.evaluate(measureInPage, MEASURED_STYLES),
      ]);

      const byAnchor = new Map(
        diffAnchors(beforeM, afterM, { position: tol.position, byAnchor: cell.byAnchor ?? {} }).map((c) => [c.anchor, c]),
      );

      for (const anchor of new Set([...Object.keys(beforeM), ...Object.keys(afterM)])) {
        const shots = await regionShots(beforeTab, afterTab, beforeM[anchor], afterM[anchor], { union: true });
        const pixelPercent = shots
          ? comparePixels(
            decodePng(shots.a, `${cell.name} ${anchor} before`),
            decodePng(shots.b, `${cell.name} ${anchor} after`),
            { antialias: tol.antialias },
          )
          : null;
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
    await context.close();
  }

  const classified = changeSet
    ? classifyChanges(changed, changeSet, [...states])
    : { declared: [], undeclared: [], declaredUnchanged: [], unchecked: [] };
  return { changed, ...classified, shotsDir, humanCells };
}

/** Run `task` over `items`, at most `limit` at a time, results in input order. */
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parseArgs(argv) {
  const asJson = argv.includes('--json');
  const ci = argv.indexOf('--concurrency');
  const requested = ci >= 0 ? Number(argv[ci + 1]) : undefined;
  const paths = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--concurrency');
  return { asJson, requested, paths };
}

async function main() {
  const { asJson, requested, paths } = parseArgs(process.argv.slice(2));
  const usage = 'usage: ui-measure.mjs <matrix.json> [<matrix.json> …] [--json] [--concurrency N]';
  if (!paths.length || (requested !== undefined && (!Number.isInteger(requested) || requested < 1))) {
    console.error(usage);
    process.exit(1);
  }
  const memos = paths.map(memoPath);
  if (new Set(memos).size !== memos.length) {
    console.error('ui-measure: the same matrix was given twice');
    process.exit(1);
  }
  const matrices = paths.map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const isDiff = (m) => m.mode === 'canvas-diff';
  let changeSets;
  try {
    changeSets = matrices.map((m) => (isDiff(m) ? checkCanvasDiff(m) : null));
  } catch (e) {
    console.error(`ui-measure: ${e.message}`);
    process.exit(1);
  }

  const { concurrency, reason } = pickConcurrency({
    matrices: matrices.length,
    requested,
    cpus: availableParallelism(),
    idleCores: await sampleIdleCores(cpus),
    // freemem() on macOS counts only never-used pages; availableMemory() adds what
    // the OS can reclaim, which is what a new browser context will actually get.
    availableBytes: process.availableMemory?.() ?? freemem(),
  });
  console.error(`ui-measure: 同时跑 ${concurrency} 份矩阵（${reason}）`);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  let runs;
  try {
    runs = await mapLimit(matrices, concurrency, (matrix, i) => (isDiff(matrix)
      ? runCanvasDiff(browser, matrix, paths[i], changeSets[i])
      : runMatrix(browser, matrix)));
  } catch (e) {
    console.error(`ui-measure: ${e.message}`);
  } finally {
    await browser.close();
  }
  if (!runs) process.exit(1);

  const reports = runs.map((run, i) => {
    if (isDiff(matrices[i])) {
      // No 瓶颈 here: two canvas versions are compared once per change, not iterated to green.
      const { humanCells, shotsDir, ...report } = run;
      const classified = changeSets[i] !== null;
      return {
        matrix: paths[i], mode: 'canvas-diff', classified, ...report, humanReviewCells: humanCells,
        shotsDir, attention: hasAttention(report, classified),
      };
    }
    const { findings, humanCells } = run;
    // Plateau is mechanical: the same defects, cell for cell, two runs running.
    const memo = memos[i];
    const previous = existsSync(memo) ? JSON.parse(readFileSync(memo, 'utf8')) : null;
    const current = findings.map(fingerprint);
    const bottleneck = previous !== null && findings.length > 0
      && previous.length === current.length && previous.every((f, j) => f === current[j]);
    writeFileSync(memo, JSON.stringify(current, null, 2));
    return { matrix: paths[i], findings, 瓶颈: bottleneck, humanReviewCells: humanCells };
  });

  const single = reports.length === 1;
  if (asJson) {
    // One matrix keeps the historical shape; several are wrapped, one entry per matrix.
    const internal = ({ shotsDir, attention, ...rest }) => rest;
    const strip = ({ matrix, ...rest }) => internal(rest);
    console.log(JSON.stringify(single ? strip(reports[0]) : { matrices: reports.map(internal) }, null, 2));
  } else {
    for (const r of reports) {
      if (!single) console.log(`\n== ${r.matrix}`);
      if (r.mode === 'canvas-diff') {
        console.log(renderCanvasDiff(r, r.classified));
        if (r.changed.some((c) => c.shots)) console.log(`\n区域截图（两版各一张）在 ${r.shotsDir}`);
        if (r.humanReviewCells.length) console.log(`\nHUMAN REVIEW (not green, not checked): ${r.humanReviewCells.join(', ')}`);
        continue;
      }
      console.log(renderFindings(r.findings));
      if (r.瓶颈) console.log('\n瓶颈：同一批 finding 连续两轮不变。停下，交给人。');
      if (r.humanReviewCells.length) console.log(`\nHUMAN REVIEW (not green, not checked): ${r.humanReviewCells.join(', ')}`);
    }
  }
  process.exit(reports.some((r) => (r.mode === 'canvas-diff' ? r.attention : r.findings.length)) ? 2 : 0);
}

main();
