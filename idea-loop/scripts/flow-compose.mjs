#!/usr/bin/env node
/**
 * Interaction flow composer — UI screenshots + arrows + short text, stitched into one PNG.
 *
 * A spec shows a problem or a new interaction as a screen flow: one row per path, screenshots
 * left to right, the trigger written on the arrow, one line under each step, branches dropping
 * down from the step they fork at, red rings on what to look at. excalidrawer has no image node
 * yet, so this script is THE way those figures get made — one recipe, so every figure in a spec
 * (and in the next spec) looks the same. Rules and placement: references/spec-figures.md §4.
 *
 * The input is one JSON per figure. Its shape is deliberately the same as a flow in the future
 * docs/ui/ archive, so figures can move there unchanged.
 *
 * Deterministic core (checkFlow, renderHtml) is pure and unit-tested. The CLI at the bottom is
 * the file + browser boundary: it inlines the screenshots, writes a self-contained HTML, and
 * screenshots it with the target project's playwright when that resolves.
 *
 * Usage:  node flow-compose.mjs <flow.json> <out.png>
 * Exit:   0 = written, 1 = usage / io error, 2 = the flow is invalid (problems listed).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Validate one flow.
 *
 * @param flow    the parsed JSON
 * @param exists  (relativeImagePath) => boolean — injected so the core stays pure
 * @returns { valid, errors }
 */
export function checkFlow(flow, exists = () => true) {
  const errors = [];
  if (!flow || typeof flow !== 'object') return { valid: false, errors: ['flow 不是一个对象'] };
  if (!isText(flow.title)) errors.push('缺 title（这张图讲的是哪个场景）');
  if (flow.scale !== undefined && !(isNum(flow.scale) && flow.scale > 0 && flow.scale <= 2)) {
    errors.push('scale 必须是 (0, 2] 之间的数（2 倍像素密度的截图填 0.5）');
  }
  if (!Array.isArray(flow.rows) || flow.rows.length === 0) {
    errors.push('rows 至少一行');
    return { valid: false, errors };
  }

  flow.rows.forEach((row, r) => {
    const at = `第 ${r + 1} 行`;
    if (!Array.isArray(row.steps) || row.steps.length === 0) {
      errors.push(`${at}没有 steps`);
      return;
    }
    if (row.connected === false && !isText(row.label)) {
      errors.push(`${at}是不画箭头的行（connected: false），必须带 label，比如「同一规则 · ……」`);
    }
    if (row.branchFrom !== undefined) {
      if (r === 0) errors.push('第 1 行不能是分支（branchFrom 只能指向它上面的行）');
      const { row: br, step: bs } = row.branchFrom ?? {};
      if (!Number.isInteger(br) || br < 0 || br >= r) {
        errors.push(`${at}的 branchFrom.row 必须指向它上面的某一行（0 起数）`);
      } else if (!Number.isInteger(bs) || bs < 0 || bs >= (flow.rows[br].steps?.length ?? 0)) {
        errors.push(`${at}的 branchFrom.step 超出第 ${br + 1} 行的步数`);
      }
      if (row.connected === false) errors.push(`${at}既是分支又不画箭头——二选一`);
      if (!isText(row.steps[0]?.trigger)) errors.push(`${at}是分支，第一步要写 trigger（箭头上的触发条件）`);
    }

    row.steps.forEach((step, s) => {
      const where = `${at}第 ${s + 1} 步`;
      if (!isText(step.image)) errors.push(`${where}缺 image`);
      else if (!exists(step.image)) errors.push(`${where}的截图不存在：${step.image}`);
      if (!isText(step.caption)) errors.push(`${where}缺 caption（截图下那一句）`);
      const arrowIn = row.connected !== false && (s > 0 || row.branchFrom !== undefined);
      if (arrowIn && !isText(step.trigger)) errors.push(`${where}有箭头指进来，要写 trigger`);
      if (!arrowIn && step.trigger !== undefined && s === 0) {
        errors.push(`${where}是一行的起点、没有箭头指进来，trigger 写了也画不出来`);
      }
      for (const [i, c] of (step.circles ?? []).entries()) {
        if (!(isNum(c?.x) && isNum(c?.y) && isNum(c?.r) && c.r > 0)) {
          errors.push(`${where}的第 ${i + 1} 个光圈要有数字 x / y / r（截图原始像素）`);
        }
      }
    });
  });

  return { valid: errors.length === 0, errors };
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/**
 * Grid placement. Each row occupies one grid row; a branch row starts one column right of the
 * step it forks from, so its first screenshot sits diagonally below-right of the fork.
 * A labelled row gets an extra grid row above it for the label.
 */
export function layout(flow) {
  const placed = [];
  const startCol = [];
  let gridRow = 1;
  flow.rows.forEach((row, r) => {
    const start = row.branchFrom ? startCol[row.branchFrom.row] + row.branchFrom.step + 1 : 0;
    startCol[r] = start;
    const labelRow = isText(row.label) ? gridRow++ : null;
    placed.push({ r, start, gridRow: gridRow++, labelRow });
  });
  const cols = Math.max(...flow.rows.map((row, r) => startCol[r] + row.steps.length));
  return { placed, cols };
}

/**
 * Render a self-contained HTML page for one flow.
 *
 * @param flow  a flow that passed checkFlow
 * @param src   (relativeImagePath) => string usable as <img src> (a data: URI from the CLI)
 */
export function renderHtml(flow, src = (p) => p) {
  const scale = flow.scale ?? 0.5;
  const { placed, cols } = layout(flow);
  const cells = [];
  for (const { r, start, gridRow, labelRow } of placed) {
    const row = flow.rows[r];
    if (labelRow !== null) {
      cells.push(`<div class="label${start === 0 ? ' first' : ''}" style="grid-row:${labelRow};grid-column:${start + 1} / span ${cols - start}">${esc(row.label)}</div>`);
    }
    row.steps.forEach((step, s) => {
      const arrowIn = row.connected !== false && (s > 0 || row.branchFrom !== undefined);
      const id = `s-${r}-${s}`;
      const from = s > 0 ? `s-${r}-${s - 1}` : row.branchFrom ? `s-${row.branchFrom.row}-${row.branchFrom.step}` : '';
      const rings = (step.circles ?? [])
        .map((c) => `<span class="ring" style="left:${(c.x - c.r) * scale}px;top:${(c.y - c.r) * scale}px;width:${2 * c.r * scale}px;height:${2 * c.r * scale}px"></span>`)
        .join('');
      const first = start + s === 0 ? ' first' : '';
      cells.push(
        `<div class="cell${first}" style="grid-row:${gridRow};grid-column:${start + s + 1}">` +
          `<div class="gutter">${arrowIn ? `<span class="trigger" data-from="${from}" data-to="${id}" data-branch="${s === 0 ? 1 : 0}">${esc(step.trigger)}</span>` : ''}</div>` +
          `<figure id="${id}"><div class="shot"><img src="${esc(src(step.image))}" data-scale="${scale}">${rings}</div>` +
          `<figcaption>${esc(step.caption)}</figcaption></figure>` +
        `</div>`,
      );
    });
  }

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(flow.title)}</title>
<style>
  :root { --ink:#1f2937; --muted:#6b7280; --line:#9ca3af; --ring:#ef4444; --ground:#ffffff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--ground); color:var(--ink);
    font:14px/1.5 -apple-system,"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif; }
  #flow { display:inline-block; padding:28px 32px; position:relative; background:var(--ground); }
  h1 { font-size:16px; margin:0 0 20px; font-weight:600; }
  .grid { display:grid; grid-template-columns:repeat(${cols}, auto); column-gap:0; row-gap:28px; align-items:start; justify-content:start; }
  .cell { display:flex; align-items:flex-start; }
  .gutter { width:120px; flex:none; }
  .cell.first .gutter { width:0; }
  .trigger { position:absolute; z-index:1; font-size:12px; line-height:1.3; color:var(--ink); background:var(--ground);
    padding:0 4px; text-align:center; width:104px; transform:translate(-50%, -100%); }
  figure { margin:0; display:flex; flex-direction:column; align-items:flex-start; }
  .shot { position:relative; line-height:0; border:1px solid #e5e7eb; border-radius:6px; }
  .shot img { display:block; border-radius:6px; }
  .ring { position:absolute; border:3px solid var(--ring); border-radius:50%; box-shadow:0 0 0 3px rgba(239,68,68,.18); pointer-events:none; }
  figcaption { margin-top:8px; font-size:12px; color:var(--muted); max-width:260px; line-height:1.45; }
  .label { font-size:12px; color:var(--muted); padding-left:120px; margin-bottom:-16px; }
  .label.first { padding-left:0; }
  .note { margin-top:24px; font-size:13px; color:var(--ink); max-width:720px; }
  svg#wires { position:absolute; left:0; top:0; pointer-events:none; overflow:visible; }
</style></head>
<body><div id="flow"><h1>${esc(flow.title)}</h1><div class="grid">${cells.join('')}</div>${isText(flow.note) ? `<p class="note">${esc(flow.note)}</p>` : ''}<svg id="wires"></svg></div>
<script>
(async () => {
  const imgs = [...document.querySelectorAll('.shot img')];
  await Promise.all(imgs.map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((ok) => { i.onload = i.onerror = ok; }))));
  for (const i of imgs) { const k = Number(i.dataset.scale); i.style.width = i.naturalWidth * k + 'px'; i.style.height = i.naturalHeight * k + 'px'; }
  await document.fonts.ready;
  const root = document.getElementById('flow');
  const box = root.getBoundingClientRect();
  const svg = document.getElementById('wires');
  svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
  const rel = (el) => { const b = el.getBoundingClientRect(); return { l: b.left - box.left, r: b.right - box.left, t: b.top - box.top, b: b.bottom - box.top, cx: (b.left + b.right) / 2 - box.left, cy: (b.top + b.bottom) / 2 - box.top }; };
  const NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9ca3af"/></marker></defs>';
  for (const t of document.querySelectorAll('.trigger')) {
    const to = rel(document.querySelector('#' + t.dataset.to + ' .shot'));
    const from = rel(document.querySelector('#' + t.dataset.from + ' .shot'));
    const branch = t.dataset.branch === '1';
    // Shots in one row are top-aligned, so half the shorter one's height lies inside both.
    const y = branch ? to.cy : to.t + Math.min(from.b - from.t, to.b - to.t) / 2;
    const x0 = branch ? from.cx : from.r + 6;
    const d = branch
      ? 'M' + x0 + ',' + (from.b + 4) + ' L' + x0 + ',' + y + ' L' + (to.l - 6) + ',' + y
      : 'M' + x0 + ',' + y + ' L' + (to.l - 6) + ',' + y;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#9ca3af'); p.setAttribute('stroke-width', '2'); p.setAttribute('marker-end', 'url(#head)');
    svg.appendChild(p);
    root.appendChild(t);
    t.style.left = (to.l - 60) + 'px';
    t.style.top = (y - 4) + 'px';
  }
  document.body.dataset.ready = '1';
})();
</script></body></html>
`;
}

/** Human-readable render of a failed check, same grouping as the other scripts. */
export function renderReport(result, file) {
  if (result.valid) return `flow-compose: green ✓${file ? ` (${file})` : ''}`;
  return [`flow-compose: 这张图的描述不合规${file ? ` (${file})` : ''}：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
}

/** Resolve playwright from the TARGET PROJECT (the plugin dir is read-only and has no node_modules). */
async function loadPlaywright() {
  const req = createRequire(pathToFileURL(join(process.cwd(), 'noop.js')));
  const unwrap = (mod) => (mod.chromium ? mod : mod.default);
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return unwrap(await import(pathToFileURL(req.resolve(name)).href));
    } catch { /* try the next one */ }
  }
  return null;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!file || !out) {
    console.error('usage: flow-compose.mjs <flow.json> <out.png>');
    process.exit(1);
  }
  const base = dirname(resolve(file));
  let flow;
  try {
    flow = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`flow-compose: 读不了 ${file}：${e.message}`);
    process.exit(1);
  }
  const result = checkFlow(flow, (p) => existsSync(join(base, p)));
  if (!result.valid) {
    console.error(renderReport(result, file));
    process.exit(2);
  }
  const dataUri = (p) => {
    const mime = MIME[extname(p).toLowerCase()] ?? 'image/png';
    return `data:${mime};base64,${readFileSync(join(base, p)).toString('base64')}`;
  };
  const htmlPath = out.replace(/\.png$/i, '') + '.html';
  writeFileSync(htmlPath, renderHtml(flow, dataUri));

  const pw = await loadPlaywright();
  if (!pw) {
    console.log(
      `flow-compose: 已写出 ${htmlPath}，但目标项目里解析不到 playwright，没法自己截图。\n` +
      `  Playwright MCP 不开 file: 地址：在它所在目录起一个静态服务器（python3 -m http.server <port>），\n` +
      `  用 MCP 打开 http://127.0.0.1:<port>/<文件名>，等 document.body.dataset.ready === "1"，对 #flow 截图存成 ${out}，\n` +
      `  截完关掉服务器。MCP 只能往工作区里写文件，先存到工作区再挪过去。`,
    );
    process.exit(0);
  }
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 900 } });
    await page.goto(pathToFileURL(resolve(htmlPath)).href);
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.locator('#flow').screenshot({ path: out });
  } finally {
    await browser.close();
  }
  console.log(`flow-compose: ${out}（HTML 留在 ${htmlPath}，可以删）`);
}
