/**
 * The seam is the command line: hand `ui-png-compare.mjs` two PNG files, read back the exit code and
 * the verdict. The PNGs are built in the test with node's own zlib (an encoder that applies every
 * scanline filter), so the decoder is exercised on the filter types real screenshots use.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { DEFAULT_ANTIALIAS_TOLERANCE, DEFAULT_PIXEL_THRESHOLD } from './ui-compare.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ui-png-compare.mjs');
const dir = mkdtempSync(join(tmpdir(), 'ui-png-compare-'));

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Encode RGBA pixels (a function (x, y) -> [r, g, b, a]) as a PNG, one filter type per row. */
function png({ width, height, pixel, colorType = 6, filters = [0] }) {
  const bpp = colorType === 6 ? 4 : 3;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const raw = Buffer.alloc(width * bpp);
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      raw[x * bpp] = r; raw[x * bpp + 1] = g; raw[x * bpp + 2] = b;
      if (bpp === 4) raw[x * bpp + 3] = a;
    }
    rows.push(raw);
  }
  const out = [];
  rows.forEach((raw, y) => {
    const f = filters[y % filters.length];
    const prev = y > 0 ? rows[y - 1] : Buffer.alloc(raw.length);
    const line = Buffer.alloc(raw.length + 1);
    line[0] = f;
    for (let i = 0; i < raw.length; i += 1) {
      const a = i >= bpp ? raw[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      line[i + 1] = (raw[i] - pred) & 0xff;
    }
    out.push(line);
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(out))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let n = 0;
const write = (buf) => { const f = join(dir, `${n += 1}.png`); writeFileSync(f, buf); return f; };
const run = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr, json: () => JSON.parse(r.stdout) };
};

/** A 20x20 image: white page with a coloured block whose colour/size the tests bend. */
const page = (block = [19, 127, 236, 255], size = 10) => (x, y) => (x < size && y < size ? block : [255, 255, 255, 255]);
const base = { width: 20, height: 20 };

test('two identical screenshots are within tolerance and exit 0', () => {
  const a = write(png({ ...base, pixel: page() }));
  const b = write(png({ ...base, pixel: page() }));
  const r = run(a, b);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /一致/);
});

test('every scanline filter type decodes to the same pixels (same picture, different encodings)', () => {
  const a = write(png({ ...base, pixel: page(), filters: [0] }));
  const b = write(png({ ...base, pixel: page(), filters: [1, 2, 3, 4] }));
  assert.equal(run(a, b).status, 0);
  const rgb = write(png({ ...base, pixel: page(), colorType: 2, filters: [4, 3] }));
  assert.equal(run(a, rgb).status, 0, 'an RGB (no alpha) screenshot of the same picture is the same picture');
});

test('a difference above the pixel budget exits 1 and reports the percentage', () => {
  // 100 of 400 pixels are a different colour = 25%
  const a = write(png({ ...base, pixel: page() }));
  const b = write(png({ ...base, pixel: page([200, 30, 30, 255]) }));
  const r = run(a, b, '--json');
  assert.equal(r.status, 1, r.out);
  const j = r.json();
  assert.equal(j.within, false);
  assert.equal(Math.round(j.percent), 25);
  assert.equal(j.threshold, DEFAULT_PIXEL_THRESHOLD);
  assert.equal(j.antialias, DEFAULT_ANTIALIAS_TOLERANCE);
});

test('a difference at or under the budget is within tolerance (1 pixel of 400 = 0.25%)', () => {
  const a = write(png({ ...base, pixel: page() }));
  const b = write(png({ ...base, pixel: (x, y) => (x === 15 && y === 15 ? [0, 0, 0, 255] : page()(x, y)) }));
  const r = run(a, b, '--json');
  assert.equal(r.status, 0, r.out);
  assert.equal(r.json().within, true);
});

test('a colour that differs by less than the anti-alias tolerance is the same colour', () => {
  const a = write(png({ ...base, pixel: page([19, 127, 236, 255]) }));
  const b = write(png({ ...base, pixel: page([20, 127, 236, 255]) }));
  assert.equal(run(a, b).status, 0);
});

test('--pixel and --antialias override the defaults, like a matrix cell may', () => {
  const a = write(png({ ...base, pixel: page() }));
  const b = write(png({ ...base, pixel: page([200, 30, 30, 255]) }));
  assert.equal(run(a, b, '--pixel', '30').status, 0);
  assert.equal(run(a, b, '--antialias', '0.9').status, 0);
});

test('screenshots of different sizes are out of tolerance (exit 1) and the reason says so', () => {
  const a = write(png({ width: 20, height: 20, pixel: page() }));
  const b = write(png({ width: 20, height: 24, pixel: page() }));
  const r = run(a, b);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /尺寸不同/);
  assert.match(r.out, /20×20/);
  assert.match(r.out, /20×24/);
});

test('usage errors, a missing file, a non-PNG and an unsmudged Git LFS pointer exit 2 with the reason', () => {
  assert.equal(run().status, 2);
  assert.equal(run(join(dir, 'nope.png'), join(dir, 'nope2.png')).status, 2);
  const text = join(dir, 'not-a-png.png');
  writeFileSync(text, 'hello');
  const ok = write(png({ ...base, pixel: page() }));
  const notPng = run(text, ok);
  assert.equal(notPng.status, 2);
  assert.match(notPng.out, /不是 PNG/);
  const lfs = join(dir, 'pointer.png');
  writeFileSync(lfs, 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n');
  const pointer = run(lfs, ok);
  assert.equal(pointer.status, 2);
  assert.match(pointer.out, /LFS/);
});
