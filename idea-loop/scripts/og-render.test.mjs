import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_COLORS, detectLang, listLayouts, normalizeParams, renderHtml } from './og-render.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'og-render.mjs');
const run = (...args) => spawnSync('node', [script, ...args], { encoding: 'utf8' });
const runAsync = (...args) => new Promise((ok) => execFile('node', [script, ...args], (e, stdout, stderr) => ok({ status: e ? e.code : 0, stdout, stderr })));
const tmp = () => mkdtempSync(join(tmpdir(), 'og-render-'));

const BASE = { layout: 'poster', title: 'How a sourdough starter really works', brand: 'Acme Bakery' };

test('the layouts are the template files in the skill, and none are the shared parts', () => {
  const layouts = listLayouts();
  assert.deepEqual(layouts, [...layouts].sort());
  assert.ok(layouts.length >= 2 && layouts.length <= 3, `2-3 layouts shipped, got ${layouts.join(', ')}`);
  for (const l of layouts) assert.ok(!l.startsWith('_'), l);
});

test('a card needs a known layout, a title and a brand name; the errors say which and list the layouts', () => {
  const r = normalizeParams({ layout: 'nope', brand: '' });
  assert.equal(r.ok, false);
  const text = r.errors.join('\n');
  assert.match(text, /layout/);
  assert.match(text, /title/);
  assert.match(text, /brand/);
  for (const l of listLayouts()) assert.ok(text.includes(l), `lists ${l}`);
});

test('every layout renders without a leftover placeholder, and only with the card size the OG spec asks for', () => {
  for (const layout of listLayouts()) {
    const { html } = renderHtml({ ...BASE, layout });
    assert.doesNotMatch(html, /\{\{/, `${layout} has an unfilled placeholder`);
    assert.match(html, /1200px/);
    assert.match(html, /630px/);
    assert.ok(html.includes('How a sourdough starter really works'), layout);
  }
});

test('text is escaped, so a title with markup cannot break the card', () => {
  const { html } = renderHtml({ ...BASE, title: '<b>5 & 6</b> "quoted"' });
  assert.ok(html.includes('&lt;b&gt;5 &amp; 6&lt;/b&gt; &quot;quoted&quot;'));
  assert.ok(!html.includes('<b>5'));
});

test('no colors given: neutral defaults are used and reported as defaults', () => {
  const { html, defaults } = renderHtml(BASE);
  assert.ok(defaults.includes('colors'));
  assert.ok(defaults.includes('logo'));
  assert.ok(defaults.includes('font'));
  assert.ok(html.includes(`--accent:${DEFAULT_COLORS.accent}`));
});

test('project colors and font replace the defaults; a partial color set keeps the rest of the defaults', () => {
  const { html, defaults } = renderHtml({ ...BASE, colors: { accent: '#c2410c', accentInk: '#ffffff' }, font: { family: 'Source Serif 4, serif' } });
  assert.ok(html.includes('--accent:#c2410c'));
  assert.ok(html.includes(`--bg:${DEFAULT_COLORS.bg}`));
  assert.ok(html.includes('Source Serif 4, serif'));
  assert.ok(!defaults.includes('font'));
  assert.ok(defaults.includes('colors'), 'colors not fully given still counts as partly default');
});

test('a bad color value is an error, not a style injection', () => {
  const r = normalizeParams({ ...BASE, colors: { accent: 'red;}</style><script>x()</script>' } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /accent/);
});

test('titleSize sets the largest and smallest title size; without it each layout keeps its own range; a bad range is an error', () => {
  const custom = renderHtml({ ...BASE, titleSize: { max: 90, min: 40 } }).html;
  assert.ok(custom.includes('data-fit="90:40"'));
  const own = renderHtml(BASE).html;
  assert.match(own, /<h1 class="title" data-fit="\d+:\d+">/);
  assert.ok(!own.includes('data-fit="90:40"'));
  for (const bad of [{ max: 30, min: 40 }, { max: 400, min: 40 }, { max: 'big', min: 20 }, { max: 80 }]) {
    const r = normalizeParams({ ...BASE, titleSize: bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.errors.join('\n'), /titleSize/);
  }
});

test('language is read from the title: Chinese, Japanese and Korean titles get a CJK language, others en', () => {
  assert.equal(detectLang('发酵面团到底是怎么回事'), 'zh');
  assert.equal(detectLang('パンの発酵'), 'zh');
  assert.equal(detectLang('Sourdough 101'), 'en');
  assert.equal(normalizeParams({ ...BASE, lang: 'fr' }).value.lang, 'fr');
});

test('the CLI html command writes the card, inlines a logo file as a data URI and says what fell back to defaults', () => {
  const d = tmp();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(join(d, 'logo.png'), png);
  writeFileSync(join(d, 'params.json'), JSON.stringify({ ...BASE, logo: 'logo.png' }));
  const r = run('html', join(d, 'params.json'), join(d, 'out.html'));
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.layout, 'poster');
  assert.ok(out.defaults.includes('colors'));
  assert.ok(!out.defaults.includes('logo'));
  const html = readFileSync(join(d, 'out.html'), 'utf8');
  assert.match(html, /src="data:image\/png;base64,/);
});

test('the CLI exits 2 and lists the problems on a bad params file, and 1 on a missing one', () => {
  const d = tmp();
  writeFileSync(join(d, 'params.json'), JSON.stringify({ layout: 'poster' }));
  const bad = run('html', join(d, 'params.json'), join(d, 'out.html'));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /title/);
  const missing = run('html', join(d, 'none.json'), join(d, 'out.html'));
  assert.equal(missing.status, 1);
});

test('layouts command prints the names', () => {
  const r = run('layouts');
  assert.equal(r.status, 0);
  assert.deepEqual(r.stdout.trim().split('\n'), listLayouts());
});

test('md5 prints the digest of the file on disk, and with --url says whether a server hands back the same bytes', async () => {
  const d = tmp();
  writeFileSync(join(d, 'a.png'), 'first render');
  const sum = createHash('md5').update('first render').digest('hex');
  const r = run('md5', join(d, 'a.png'));
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).md5, sum);

  let body = 'first render';
  const server = createServer((_, res) => res.end(body)).listen(0);
  await new Promise((ok) => server.once('listening', ok));
  const url = `http://127.0.0.1:${server.address().port}/a.png`;
  const same = await runAsync('md5', join(d, 'a.png'), '--url', url);
  assert.equal(same.status, 0);
  assert.equal(JSON.parse(same.stdout).served, sum);

  body = 'stale render';
  const stale = await runAsync('md5', join(d, 'a.png'), '--url', url);
  server.close();
  assert.equal(stale.status, 3, 'a server that still hands back old bytes is exit 3');
  assert.match(stale.stderr, /缓存|stale|不一致/);
});
