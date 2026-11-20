// The bridge between browser.test.mjs and dyna's Go code: every function answers from the helper binary
// testdata/sectionscli (SECTIONS_BIN), so the browser test exercises the code dyna ships, not a copy.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = process.env.SECTIONS_BIN;
const call = (args, input) => {
  try {
    return execFileSync(BIN, args, { input, encoding: 'utf8', maxBuffer: 1 << 29 });
  } catch (e) {
    throw new Error(String(e.stderr || '').trim() || e.message);
  }
};
const gen = (name, input) => call(['generate', name], JSON.stringify(input) ?? 'null');

export const buildTimeCode = (config) => gen('time', config);
export const buildStepCode = (ms) => gen('step', ms);
export const buildMeasureCode = (config) => gen('measure', config);
export const buildShootCode = (config) => gen('shoot', config);
export const buildPinnedCode = (config) => gen('pinned', config);
export const buildScreenCode = (config) => gen('screen', config);
export const buildCoverCode = (config) => gen('cover', config);
export const attribute = (measurement) => JSON.parse(gen('attribute', measurement));
export const shootTargets = (attribution, opts = {}) => JSON.parse(gen('shootTargets', { attribution, only: opts.only ?? null }));

/** { width, height, data: RGBA bytes }, decoded by dyna's PNG decoder. */
export const decodePng = (buffer) => {
  const { width, height, data } = JSON.parse(call(['png', 'decode'], buffer));
  return { width, height, data: Buffer.from(data, 'base64') };
};

/** { within, percent, threshold, antialias, reason }: `dyna ui compare` with its default tolerances. */
export const comparePngs = (a, b) => {
  const dir = mkdtempSync(join(tmpdir(), 'sections-png-'));
  writeFileSync(join(dir, 'a.png'), a);
  writeFileSync(join(dir, 'b.png'), b);
  return JSON.parse(call(['png', 'compare', join(dir, 'a.png'), join(dir, 'b.png')]));
};
