#!/usr/bin/env node
/**
 * Compare two screenshots of the same state under the UI loop's own tolerances.
 *
 * `ui-measure.mjs` compares a design canvas with a ported route inside one browser session. The
 * archive reconcile (ui-reviewer, 对账 mode) has a different pair: the picture the archive holds in
 * `prod/` and a fresh one taken from the running app. Both are files, so no browser is needed here —
 * the PNGs are decoded with node's zlib and fed to the same pixel layer (`comparePixels` in
 * `ui-compare.mjs`) with the same defaults (anti-alias 0.1, pixel budget 1%). The tolerance is not
 * re-stated: it is imported, so the two judges cannot drift apart.
 *
 * Within tolerance means "same state, do not re-shoot" — the main way the archive's Git LFS growth
 * is kept down. A different size is out of tolerance (the viewport changed or the page got taller),
 * never an error.
 *
 *   node ui-png-compare.mjs <archive.png> <fresh.png> [--antialias 0.1] [--pixel 1] [--json]
 *
 * Exit: 0 = within tolerance, 1 = beyond it, 2 = usage error / unreadable / not a supported PNG /
 * an unsmudged Git LFS pointer.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { comparePixels, DEFAULT_ANTIALIAS_TOLERANCE, DEFAULT_PIXEL_THRESHOLD } from './ui-compare.mjs';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class PngError extends Error {}

/** PNG bytes → { width, height, data: RGBA } for 8-bit RGB / RGBA, non-interlaced (what screenshots are). */
export function decodePng(buffer, name = 'PNG') {
  if (buffer.subarray(0, 40).toString('latin1').startsWith('version https://git-lfs')) {
    throw new PngError(`${name} 是 Git LFS 指针，不是图：先 git lfs pull 把档案里的素材取下来`);
  }
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new PngError(`${name} 不是 PNG`);
  let pos = 8;
  let header = null;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('latin1', pos + 4, pos + 8);
    const body = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] };
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!header) throw new PngError(`${name} 没有 IHDR`);
  const { width, height, depth, colorType, interlace } = header;
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new PngError(`${name} 的格式不支持（只支持 8 位 RGB / RGBA、不隔行）：位深 ${depth}、颜色类型 ${colorType}、隔行 ${interlace}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new PngError(`${name} 的像素数据长度不对`);

  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const b = y > 0 ? px[dst - stride + i] : 0;
      const c = y > 0 && i >= bpp ? px[dst - stride + i - bpp] : 0;
      let pred = 0;
      if (f === 1) pred = a;
      else if (f === 2) pred = b;
      else if (f === 3) pred = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new PngError(`${name} 有不认识的行滤波类型 ${f}`);
      px[dst + i] = (raw[src + i] + pred) & 0xff;
    }
  }
  if (bpp === 4) return { width, height, data: px };
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    data[j] = px[i]; data[j + 1] = px[i + 1]; data[j + 2] = px[i + 2]; data[j + 3] = 255;
  }
  return { width, height, data };
}

/**
 * @returns { within, percent, threshold, antialias, reason }
 */
export function comparePngs(archivePng, freshPng, { antialias = DEFAULT_ANTIALIAS_TOLERANCE, pixel = DEFAULT_PIXEL_THRESHOLD } = {}) {
  const a = decodePng(archivePng, '档案里的图');
  const b = decodePng(freshPng, '新拍的图');
  if (a.width !== b.width || a.height !== b.height) {
    return {
      within: false, percent: null, threshold: pixel, antialias,
      reason: `尺寸不同：档案里 ${a.width}×${a.height}，新拍的 ${b.width}×${b.height}（视口或页面高度变了）`,
    };
  }
  const percent = comparePixels(a, b, { antialias });
  const within = percent <= pixel;
  return {
    within, percent, threshold: pixel, antialias,
    reason: within ? `一致：像素差 ${percent.toFixed(2)}%，在 ${pixel}% 以内` : `超出容差：像素差 ${percent.toFixed(2)}%，上限 ${pixel}%`,
  };
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const opt = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? Number(args[i + 1]) : undefined;
  };
  const options = {};
  const aa = opt('--antialias');
  const px = opt('--pixel');
  if (aa !== undefined) options.antialias = aa;
  if (px !== undefined) options.pixel = px;
  const files = args.filter((a, i) => !a.startsWith('--') && !['--antialias', '--pixel'].includes(args[i - 1]));
  if (files.length !== 2 || Object.values(options).some(Number.isNaN)) {
    console.error('usage: ui-png-compare.mjs <archive.png> <fresh.png> [--antialias 0.1] [--pixel 1] [--json]');
    return 2;
  }
  let result;
  try {
    result = comparePngs(readFileSync(files[0]), readFileSync(files[1]), options);
  } catch (e) {
    console.error(`ui-png-compare: ${e instanceof PngError || e.code === 'ENOENT' ? e.message : e.stack}`);
    return 2;
  }
  console.log(json ? JSON.stringify(result, null, 2) : `ui-png-compare: ${result.reason}`);
  return result.within ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv));
