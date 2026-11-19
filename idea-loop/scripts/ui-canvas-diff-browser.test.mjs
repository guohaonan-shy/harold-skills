/**
 * Two versions of one canvas, compared in a real browser by the real `ui-measure.mjs`: the new version adds a
 * block below the old version's last pixel, and the changed-anchor list must carry two same-size area
 * screenshots for it (the old one blank) — not "no screenshot", not a thin strip. Playwright is looked up where
 * this machine has it (the project's own node_modules, then the npx cache); with no working one the test is
 * skipped, not failed.
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './ui-png-compare.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ui-measure.mjs');
const STYLE = 'body{margin:0;font:16px sans-serif}.hero{height:700px;background:#eef}.cta{display:block;margin:20px;height:60px;background:#36c}'
  + '.more{margin:60px 20px 20px;height:120px;background:#f60}';
const OLD = `<!doctype html><meta charset="utf-8"><style>${STYLE}</style><div class="hero" data-anchor="hero"></div><button class="cta" data-anchor="cta"></button>`;
// the new block starts below the old page's end (700 + 100 = 800 < 844, the viewport; the block is at 860+)
const NEW = `${OLD}<div class="more" data-anchor="more"></div>`;

const dirs = (p) => (existsSync(p) && statSync(p).isDirectory() ? readdirSync(p).map((n) => join(p, n)) : []);
/** Directories from which `playwright` / `playwright-core` resolves (ui-measure resolves from its cwd). */
const candidates = () => [
  process.cwd(),
  ...dirs(join(homedir(), '.npm', '_npx')),
].filter((d) => existsSync(join(d, 'node_modules', 'playwright')) || existsSync(join(d, 'node_modules', 'playwright-core')));

let server;
let port;
let work;
before(async () => {
  work = mkdtempSync(join(tmpdir(), 'canvas-diff-'));
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(req.url.startsWith('/old') ? OLD : NEW);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => { server.closeAllConnections(); server.close(); });

// async on purpose: a blocking spawn would stop this process answering the browser's requests
const run = (cwd, args) => new Promise((resolve) => {
  execFile(process.execPath, args, { cwd, encoding: 'utf8' }, (err, stdout) => resolve({ status: err ? err.code : 0, stdout }));
});

test('a block the new version adds below the old version\'s page end has a before shot (blank) and an after shot of the same size', async (t) => {
  writeFileSync(join(work, 'matrix.json'), JSON.stringify({
    mode: 'canvas-diff',
    before: `http://127.0.0.1:${port}/old.html`,
    after: `http://127.0.0.1:${port}/new.html`,
    shotsDir: 'shots',
    cells: [{ name: 'mobile', viewport: { width: 390, height: 844 } }],
  }));
  let out;
  for (const cwd of candidates()) {
    const r = await run(cwd, [SCRIPT, join(work, 'matrix.json'), '--json']);
    if (r.status === 0 || r.status === 2) { out = JSON.parse(r.stdout); break; }
  }
  if (!out) return t.skip('no working Playwright on this machine');

  const more = out.changed.find((c) => c.anchor === 'more');
  assert.ok(more, 'the added anchor is listed');
  assert.ok(more.shots, 'it has area screenshots');
  const before_ = decodePng(readFileSync(more.shots.before), 'before');
  const after_ = decodePng(readFileSync(more.shots.after), 'after');
  assert.equal(before_.width, after_.width);
  assert.equal(before_.height, after_.height);
  assert.ok(after_.height >= 120, `the whole block is cut, not a strip (got ${after_.height}px)`);
  // old side blank (white page), new side shows the orange block
  const px = (img, i) => [...img.data.slice(i * 4, i * 4 + 3)];
  const mid = Math.floor((after_.width * after_.height) / 2);
  assert.deepEqual(px(before_, mid), [255, 255, 255]);
  assert.deepEqual(px(after_, mid), [255, 102, 0]);
});
