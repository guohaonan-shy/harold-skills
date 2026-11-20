#!/usr/bin/env node
/**
 * OG share card renderer — one JSON of the card's words and the project's brand values in, a 1200x630 PNG out.
 *
 * The `og` skill (skills/seo/og/) ships a few layouts as HTML templates (skills/seo/og/assets/<layout>.html).
 * The templates know nothing about any project: every color, the font, the logo and the words are placeholders.
 * This script fills them (escaping the text, falling back to neutral defaults for what the project did not give),
 * then screenshots the page in a browser. The page fits its own text: every block shrinks from its largest size
 * to its smallest until it fits, and whatever still does not fit is reported, never clipped silently.
 *
 * Deterministic core (listLayouts, normalizeParams, detectLang, renderHtml) is pure and unit-tested. The CLI at the
 * bottom is the file + browser boundary; it resolves playwright from the target project, then from the npx cache.
 *
 * Usage:
 *   node og-render.mjs layouts                              one layout name per line
 *   node og-render.mjs html   <params.json> <out.html>      fill the template, no browser
 *   node og-render.mjs render <params.json> <out.png> [--html <out.html>]
 *   node og-render.mjs md5    <file> [--url <served url>]   digest of the file; with --url, of what the server serves
 * Exit:   0 ok, 1 usage / io / no browser, 2 params invalid, 3 (md5 --url) the server serves other bytes than the
 *         disk, 4 (render) the text does not fit at its smallest size (the PNG is written so it can be looked at,
 *         but must not ship).
 *
 * params.json (paths are relative to the params file):
 *   layout  one of `layouts`          title   the headline        brand  the name shown when there is no logo
 *   kicker  small label (optional)    sub     one or two lines (optional)    site  domain or tagline (optional)
 *   logo    image file (optional)     image   subject image for `split` (optional)
 *   stat    { value, label } for `split` (optional)
 *   colors  { bg, surface, ink, muted, accent, accentInk }  (any subset)
 *   font    { family, link }  family is a CSS font-family list; link is a stylesheet URL that loads it (optional)
 *   titleSize { max, min }  the largest and smallest title size in px; each layout has its own range when left out
 *   lang    html lang; read from the title when left out
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ASSETS = join(HERE, '..', 'skills', 'seo', 'og', 'assets');

/** Neutral graphite-on-paper values, used for every color the project did not give. */
export const DEFAULT_COLORS = {
  bg: '#f6f5f2',
  surface: '#ffffff',
  ink: '#16181d',
  muted: '#59606b',
  accent: '#2b3440',
  accentInk: '#ffffff',
};
const CJK_FALLBACK = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei"';
export const DEFAULT_FONT = `ui-sans-serif,system-ui,-apple-system,"Segoe UI",${CJK_FALLBACK},sans-serif`;

/** The title's [largest, smallest] size per layout: the page shrinks the title from the first to the second until it fits. */
const TITLE_SIZE = { poster: [108, 44], split: [72, 34], block: [78, 36] };

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab)\([0-9a-z.,%\s/+-]+\))$/i;
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const CJK_RE = /[぀-ヿ㐀-鿿가-힯]/;

/** The layout names: every template in the skill's assets, except the shared parts (leading underscore). */
export function listLayouts(dir = ASSETS) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.html') && !f.startsWith('_'))
    .map((f) => f.slice(0, -'.html'.length))
    .sort();
}

export const detectLang = (title) => (CJK_RE.test(title ?? '') ? 'zh' : 'en');

/** Validate the params. @returns { ok, errors, value } — value has the language filled in. */
export function normalizeParams(params, layouts = listLayouts()) {
  const errors = [];
  const p = params && typeof params === 'object' ? params : {};
  if (!layouts.includes(p.layout)) errors.push(`layout 必须是 ${layouts.join(' / ')} 之一，收到 ${JSON.stringify(p.layout)}`);
  if (!isText(p.title)) errors.push('缺 title（卡片的大标题）');
  if (!isText(p.brand)) errors.push('缺 brand（没有 logo 时显示的名字）');
  for (const k of ['kicker', 'sub', 'site', 'logo', 'image']) {
    if (p[k] !== undefined && typeof p[k] !== 'string') errors.push(`${k} 必须是字符串`);
  }
  if (p.stat !== undefined && !(p.stat && isText(p.stat.value) && isText(p.stat.label))) {
    errors.push('stat 要同时有 value 和 label');
  }
  for (const [k, v] of Object.entries(p.colors ?? {})) {
    if (!(k in DEFAULT_COLORS)) errors.push(`colors.${k} 不认识，可用：${Object.keys(DEFAULT_COLORS).join(' / ')}`);
    else if (typeof v !== 'string' || !COLOR_RE.test(v.trim())) errors.push(`colors.${k} 不是颜色值：${JSON.stringify(v)}`);
  }
  if (p.titleSize !== undefined) {
    const { max, min } = p.titleSize ?? {};
    const ok = Number.isInteger(max) && Number.isInteger(min) && min >= 20 && max <= 160 && min <= max;
    if (!ok) errors.push('titleSize 要 { max, min } 两个整数，20 <= min <= max <= 160');
  }
  if (p.font?.family !== undefined && !(isText(p.font.family) && !/[;{}<>]/.test(p.font.family))) errors.push('font.family 不是一个 font-family 列表');
  if (p.font?.link !== undefined && !(typeof p.font.link === 'string' && /^https:\/\/[^\s"'<>]+$/.test(p.font.link))) errors.push('font.link 必须是 https 地址');
  if (errors.length) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value: { ...p, lang: isText(p.lang) ? p.lang.trim() : detectLang(p.title) } };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function dataUri(file) {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`不认识的图片格式：${file}（可用 ${Object.keys(MIME).join(' ')}）`);
  if (!existsSync(file)) throw new Error(`图片不存在：${file}`);
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

const RINGS = `<svg viewBox="0 0 400 518" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="var(--accent)">
<circle cx="300" cy="140" r="250" stroke-width="2" opacity="0.18"/><circle cx="300" cy="140" r="190" stroke-width="2" opacity="0.28"/>
<circle cx="300" cy="140" r="130" stroke-width="2" opacity="0.4"/></g><circle cx="300" cy="140" r="64" fill="var(--accent)"/>
<rect x="48" y="400" width="110" height="12" fill="var(--accent)"/><rect x="48" y="428" width="70" height="12" fill="var(--accent)" opacity="0.4"/></svg>`;

function visualFor(p, baseDir) {
  if (p.image) return `<div class="visual"><img src="${dataUri(resolve(baseDir, p.image))}" alt=""></div>`;
  if (p.stat) {
    return `<div class="visual stat"><div class="value" data-fit="132:56">${esc(p.stat.value)}</div><div class="rulebar"></div>` +
      `<div class="labelbox"><div class="label" data-fit="26:18">${esc(p.stat.label)}</div></div></div>`;
  }
  return `<div class="visual rings">${RINGS}</div>`;
}

/**
 * Fill one layout.
 * @param baseDir  where relative logo / image paths start
 * @returns { html, defaults, layout } — defaults names what fell back to neutral values: colors (any of the six),
 *          font, logo
 */
export function renderHtml(params, { baseDir = process.cwd(), assets = ASSETS } = {}) {
  const r = normalizeParams(params, listLayouts(assets));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  const p = r.value;
  const colors = { ...DEFAULT_COLORS };
  for (const [k, v] of Object.entries(p.colors ?? {})) colors[k] = v.trim();
  const defaults = [];
  if (Object.keys(DEFAULT_COLORS).some((k) => !(k in (p.colors ?? {})))) defaults.push('colors');
  if (!p.font?.family) defaults.push('font');
  if (!p.logo) defaults.push('logo');
  const family = p.font?.family ? `${p.font.family},${DEFAULT_FONT}` : DEFAULT_FONT;
  const vars =
    `--bg:${colors.bg};--surface:${colors.surface};--ink:${colors.ink};--muted:${colors.muted};` +
    `--accent:${colors.accent};--accent-ink:${colors.accentInk};--font:${family};` +
    `--accent-soft:color-mix(in srgb,var(--accent) 14%,var(--bg));--line:color-mix(in srgb,var(--ink) 16%,transparent);`;
  const brandHtml = p.logo
    ? `<div class="brand"><img src="${dataUri(resolve(baseDir, p.logo))}" alt="${esc(p.brand)}"></div>`
    : `<div class="brand"><span class="word" data-fit="28:18">${esc(p.brand)}</span></div>`;
  const fill = {
    lang: esc(p.lang),
    fontLink: p.font?.link ? `<link rel="stylesheet" href="${esc(p.font.link)}">` : '',
    vars,
    css: readFileSync(join(assets, '_shared.css'), 'utf8'),
    js: readFileSync(join(assets, '_shared.js'), 'utf8'),
    title: esc(p.title),
    titleFit: p.titleSize ? `${p.titleSize.max}:${p.titleSize.min}` : (TITLE_SIZE[p.layout] ?? [96, 40]).join(':'),
    kicker: esc(p.kicker ?? ''),
    sub: esc(p.sub ?? ''),
    site: esc(p.site ?? ''),
    brandHtml,
    visual: p.layout === 'split' ? visualFor(p, baseDir) : '',
  };
  const html = readFileSync(join(assets, `${p.layout}.html`), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
  return { html, defaults, layout: p.layout };
}

// ---- the file + browser boundary ----

const md5 = (buf) => createHash('md5').update(buf).digest('hex');
const dirs = (p) => (existsSync(p) && statSync(p).isDirectory() ? readdirSync(p).map((n) => join(p, n)) : []);

/** playwright from the TARGET PROJECT first (the plugin dir is read-only, has no node_modules), then the npx cache. */
async function loadChromium() {
  const req = createRequire(pathToFileURL(join(process.cwd(), 'noop.js')));
  const found = [];
  for (const name of ['playwright', 'playwright-core']) {
    try {
      found.push(req.resolve(name));
    } catch {
      // not installed in the project
    }
  }
  for (const d of dirs(join(homedir(), '.npm', '_npx'))) {
    for (const name of ['playwright', 'playwright-core']) {
      const f = join(d, 'node_modules', name);
      if (existsSync(f)) found.push(f);
    }
  }
  const caches = [join(homedir(), 'Library', 'Caches', 'ms-playwright'), join(homedir(), '.cache', 'ms-playwright')];
  const exes = caches.flatMap(dirs)
    .filter((d) => /chromium_headless_shell-/.test(d))
    .sort()
    .reverse()
    .flatMap((d) => dirs(d))
    .flatMap((d) => dirs(d).filter((f) => /chrome-headless-shell$/.test(f)));
  for (const entry of found) {
    let pw;
    try {
      pw = createRequire(import.meta.url)(entry);
    } catch {
      continue;
    }
    if (!pw?.chromium) continue;
    try {
      return await pw.chromium.launch();
    } catch {
      for (const executablePath of exes) {
        try {
          return await pw.chromium.launch({ executablePath });
        } catch {
          // try the next browser build
        }
      }
    }
  }
  return null;
}

/** Open the filled page, let it fit its text, and read the verdict the page wrote on <html>. */
export async function shoot(html, out) {
  const browser = await loadChromium();
  if (!browser) return null;
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-fit'), null, { timeout: 15000 });
    const verdict = await page.evaluate(() => ({
      fit: document.documentElement.getAttribute('data-fit'),
      overflow: document.documentElement.getAttribute('data-overflow'),
      sizes: JSON.parse(document.documentElement.getAttribute('data-sizes') || '{}'),
    }));
    if (out) await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    return verdict;
  } finally {
    await browser.close();
  }
}

function readParams(file) {
  if (!existsSync(file)) {
    console.error(`og-render: 找不到 ${file}`);
    process.exit(1);
  }
  let params;
  try {
    params = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`og-render: ${file} 不是合法 JSON：${e.message}`);
    process.exit(1);
  }
  const r = normalizeParams(params);
  if (!r.ok) {
    console.error(`og-render: params 有问题：\n- ${r.errors.join('\n- ')}`);
    process.exit(2);
  }
  return params;
}

function build(paramsFile) {
  const params = readParams(paramsFile);
  try {
    return renderHtml(params, { baseDir: dirname(resolve(paramsFile)) });
  } catch (e) {
    console.error(`og-render: ${e.message}`);
    process.exit(2);
  }
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i === -1 ? null : rest[i + 1];
  };
  if (cmd === 'layouts') {
    console.log(listLayouts().join('\n'));
    return;
  }
  if (cmd === 'html' && rest.length >= 2) {
    const { html, defaults, layout } = build(rest[0]);
    writeFileSync(rest[1], html);
    console.log(JSON.stringify({ html: rest[1], layout, defaults }));
    return;
  }
  if (cmd === 'render' && rest.length >= 2) {
    const { html, defaults, layout } = build(rest[0]);
    const htmlOut = flag('--html');
    if (htmlOut) writeFileSync(htmlOut, html);
    const verdict = await shoot(html, rest[1]);
    if (!verdict) {
      const keep = htmlOut ?? rest[1].replace(/\.png$/i, '') + '.html';
      writeFileSync(keep, html);
      console.error(`og-render: 找不到可用的 playwright 或 chromium，没法自己截图。\n已写出 ${keep}：用「浏览器」能力（idea-loop:browser）打开它，等 <html data-fit="ok">，再截 1200x630。`);
      process.exit(1);
    }
    console.log(JSON.stringify({ png: rest[1], layout, defaults, md5: md5(readFileSync(rest[1])), ...verdict }));
    if (verdict.fit !== 'ok') {
      console.error(`og-render: 放不下：${verdict.overflow}（已经缩到最小字号）。缩短这几段文字，或换一个版式。`);
      process.exit(4);
    }
    return;
  }
  if (cmd === 'md5' && rest.length >= 1) {
    if (!existsSync(rest[0])) {
      console.error(`og-render: 找不到 ${rest[0]}`);
      process.exit(1);
    }
    const disk = md5(readFileSync(rest[0]));
    const url = flag('--url');
    if (!url) {
      console.log(JSON.stringify({ file: rest[0], md5: disk }));
      return;
    }
    let served;
    try {
      served = md5(Buffer.from(await (await fetch(url, { cache: 'no-store' })).arrayBuffer()));
    } catch (e) {
      console.error(`og-render: 取不到 url ${url}：${e.message}`);
      process.exit(1);
    }
    console.log(JSON.stringify({ file: rest[0], md5: disk, url, served }));
    if (served !== disk) {
      console.error('og-render: 服务器返回的字节和磁盘上的不一致（缓存或旧服务）。重启服务或换一个文件名再比。');
      process.exit(3);
    }
    return;
  }
  console.error('用法：node og-render.mjs layouts | html <params.json> <out.html> | render <params.json> <out.png> [--html <out.html>] | md5 <file> [--url <url>]');
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main(process.argv.slice(2));
