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
 * Usage:  node ui-measure.mjs <matrix.json> [<matrix.json> …] [--json] [--concurrency N]
 * Exit:   0 = green (or only human-review cells left), 2 = findings.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareMeasurements, comparePixels, pixelFinding, sortFindings, renderFindings,
  DEFAULT_TOLERANCE, DEFAULT_ANTIALIAS_TOLERANCE, DEFAULT_PIXEL_THRESHOLD,
} from './ui-compare.mjs';
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

      const [canvasShot, localShot] = await Promise.all([canvasTab.screenshot(), localTab.screenshot()]);
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
    runs = await mapLimit(matrices, concurrency, (matrix) => runMatrix(browser, matrix));
  } finally {
    await browser.close();
  }

  const reports = runs.map(({ findings, humanCells }, i) => {
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
    const strip = ({ matrix, ...rest }) => rest;
    console.log(JSON.stringify(single ? strip(reports[0]) : { matrices: reports }, null, 2));
  } else {
    for (const r of reports) {
      if (!single) console.log(`\n== ${r.matrix}`);
      console.log(renderFindings(r.findings));
      if (r.瓶颈) console.log('\n瓶颈：同一批 finding 连续两轮不变。停下，交给人。');
      if (r.humanReviewCells.length) console.log(`\nHUMAN REVIEW (not green, not checked): ${r.humanReviewCells.join(', ')}`);
    }
  }
  process.exit(reports.some((r) => r.findings.length) ? 2 : 0);
}

main();
