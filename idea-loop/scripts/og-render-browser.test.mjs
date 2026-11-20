/**
 * Browser-level proof for the og layouts: every layout, with a long and a short title in English and in Chinese,
 * fits its box (nothing clipped, nothing overflowing), and the check can go red — a title no size can hold is
 * reported as overflow. Skipped when no playwright / chromium resolves on this machine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listLayouts, renderHtml, shoot } from './og-render.mjs';

const TITLES = {
  'short en': 'Sourdough 101',
  'long en': 'Why your sourdough starter stops rising after the first week, and the five fixes that actually work for home bakers',
  'short zh': '发酵面团入门',
  'long zh': '为什么酵种在第一周之后就不再发起来，以及真正对家庭烘焙者有效的五种补救办法',
  'one long word': 'Supercalifragilisticexpialidocious-fermentation-microbiology',
};
const SUB = { en: 'Why the first week matters, and what to feed it.', zh: '第一周为什么重要，以及该喂它什么。' };
const dir = mkdtempSync(join(tmpdir(), 'og-browser-'));

const probe = await shoot(renderHtml({ layout: 'poster', title: 'probe', brand: 'Acme' }).html, null).catch(() => null);
const skip = probe ? false : 'no playwright / chromium on this machine';

for (const layout of listLayouts()) {
  for (const [name, title] of Object.entries(TITLES)) {
    test(`${layout}: ${name} title fits, with kicker, sub and site`, { skip }, async () => {
      const zh = /[一-鿿]/.test(title);
      const { html } = renderHtml({
        layout,
        title,
        kicker: zh ? '烘焙科学' : 'Baking science',
        sub: SUB[zh ? 'zh' : 'en'],
        brand: 'Acme Bakery',
        site: 'acmebakery.example',
      });
      const out = join(dir, `${layout}-${name.replace(/ /g, '-')}.png`);
      const v = await shoot(html, out);
      assert.equal(v.fit, 'ok', `${layout} / ${name} overflows: ${v.overflow} (${JSON.stringify(v.sizes)})`);
      const png = readFileSync(out);
      assert.equal(png.readUInt32BE(16), 1200, 'width');
      assert.equal(png.readUInt32BE(20), 630, 'height');
    });
  }
}

test('split: a stat panel and a subject image panel both fit', { skip }, async () => {
  const px = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(join(dir, 'subject.png'), px);
  const base = { layout: 'split', title: TITLES['long en'], brand: 'Acme Bakery', sub: SUB.en };
  const stat = await shoot(renderHtml({ ...base, stat: { value: '87%', label: 'of starters recover within three feeds' } }).html, null);
  assert.equal(stat.fit, 'ok', stat.overflow);
  const bigStat = await shoot(renderHtml({ ...base, stat: { value: '1,284,000', label: 'starters fed' } }).html, null);
  assert.equal(bigStat.fit, 'ok', bigStat.overflow);
  const image = await shoot(renderHtml({ ...base, image: 'subject.png' }, { baseDir: dir }).html, null);
  assert.equal(image.fit, 'ok', image.overflow);
});

test('a title no size can hold is reported as overflow, not clipped silently', { skip }, async () => {
  for (const layout of listLayouts()) {
    const v = await shoot(renderHtml({ layout, title: 'word '.repeat(120), brand: 'Acme' }).html, null);
    assert.equal(v.fit, 'overflow', layout);
    assert.match(v.overflow, /title/, layout);
  }
});

test('a kicker too long for its line is reported too', { skip }, async () => {
  const v = await shoot(renderHtml({ layout: 'poster', title: 'Short', brand: 'Acme', kicker: 'a kicker that goes on and on and on and on and on and on and on and on and on' }).html, null);
  assert.equal(v.fit, 'overflow');
  assert.match(v.overflow, /kicker/);
});

test('the same params render to the same bytes, so an md5 compare means something', { skip }, async () => {
  const { html } = renderHtml({ layout: 'block', title: TITLES['long en'], brand: 'Acme Bakery' });
  const a = join(dir, 'a.png');
  const b = join(dir, 'b.png');
  await shoot(html, a);
  await shoot(html, b);
  assert.ok(readFileSync(a).equals(readFileSync(b)));
});
