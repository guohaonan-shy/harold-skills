import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAll, distFile, facts, parseUrls, verdict, waitLive } from './seo-live-check.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'seo-live-check.mjs');

const page = ({ title = 'Weeknight dinners in 20 minutes', description = 'Twelve dinners you can cook on a weeknight.', head = '' } = {}) =>
  `<!doctype html><html lang="en"><head><title>${title}</title><meta name="description" content="${description}">${head}</head><body><h1>x</h1></body></html>`;

/** A build output: `/` and `/blog/weeknight-dinners/` (the page the PR changed). */
function build(over = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'seo-live-dist-'));
  mkdirSync(join(dist, 'blog', 'weeknight-dinners'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), page({ title: 'Cookbook', description: 'Recipes.' }));
  writeFileSync(join(dist, 'blog', 'weeknight-dinners', 'index.html'), page(over));
  return dist;
}

/**
 * A local static server standing in for the live site. `pages` maps a path to { status, html, headers };
 * `files` maps a path to a raw body (sitemaps); `{base}` in a body is the server's own address.
 * `/sitemap.xml` lists `sitemap` (an array of paths) unless it is a string, which is served as it is.
 */
async function live({ pages = {}, sitemap = [], files = {} }) {
  const server = createServer((req, res) => {
    const base = `http://${req.headers.host}`;
    const raw = req.url === '/sitemap.xml' ? sitemap : files[req.url];
    if (raw !== undefined) {
      res.setHeader('content-type', 'application/xml');
      return res.end(typeof raw === 'string' ? raw.replaceAll('{base}', base) : `<urlset>${raw.map((p) => `<url><loc>${base}${p}</loc></url>`).join('')}</urlset>`);
    }
    const p = pages[req.url];
    if (!p) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.statusCode = p.status ?? 200;
    for (const [k, v] of Object.entries(p.headers ?? {})) res.setHeader(k, v);
    res.setHeader('content-type', 'text/html');
    res.end(p.html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

const PATH = '/blog/weeknight-dinners/';
const entry = (base) => [{ url: `${base}${PATH}`, keyword: 'weeknight dinner ideas' }];
const items = (r) => Object.fromEntries(['status', 'noindex', 'meta', 'sitemap'].map((k) => [k, r[k].ok]));

/** Runs the CLI without blocking this process: the "live site" is a server in this very process. */
function cli(args, input = '') {
  return new Promise((resolve) => {
    const p = spawn('node', [script, ...args]);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (code) => resolve({ code, stdout, stderr }));
    p.stdin.end(input);
  });
}

function seoMd(extra = '') {
  const dir = mkdtempSync(join(tmpdir(), 'seo-live-md-'));
  const md = join(dir, 'SEO.md');
  writeFileSync(md, `## 构建与检查\n- 产物目录：\`dist\`\n${extra}`);
  return md;
}

test('a live page that matches the build, is indexable and is in the sitemap passes all four items', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page() } }, sitemap: [PATH] });
  try {
    const r = await checkAll(entry(site.base), dist);
    assert.deepEqual(items(r.pages[0]), { status: true, noindex: true, meta: true, sitemap: true });
    assert.equal(verdict(r), 'pass');
    assert.deepEqual(r.failed, []);
  } finally {
    await site.close();
  }
});

test('a page given noindex in its meta robots fails the noindex item and only that one', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page({ head: '<meta content="noindex, follow" name="robots">' }) } }, sitemap: [PATH] });
  try {
    const r = await checkAll(entry(site.base), dist);
    assert.deepEqual(items(r.pages[0]), { status: true, noindex: false, meta: true, sitemap: true });
    assert.equal(verdict(r), 'fail');
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].item, 'noindex');
    assert.equal(r.failed[0].url, `${site.base}${PATH}`);
  } finally {
    await site.close();
  }
});

test('noindex in the X-Robots-Tag header fails the noindex item too, with a bot name in front or `none`; other directives do not', async () => {
  const dist = build();
  for (const [header, ok] of [['noindex', false], ['googlebot: noindex', false], ['none', false], ['max-snippet:50', true]]) {
    const site = await live({ pages: { [PATH]: { html: page(), headers: { 'x-robots-tag': header } } }, sitemap: [PATH] });
    try {
      assert.equal((await checkAll(entry(site.base), dist)).pages[0].noindex.ok, ok, header);
    } finally {
      await site.close();
    }
  }
});

test('a live title that differs from the build fails the meta item and names both titles', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page({ title: 'Old title' }) } }, sitemap: [PATH] });
  try {
    const r = await checkAll(entry(site.base), dist);
    assert.deepEqual(items(r.pages[0]), { status: true, noindex: true, meta: false, sitemap: true });
    assert.match(r.pages[0].meta.detail, /Old title/);
    assert.match(r.pages[0].meta.detail, /Weeknight dinners in 20 minutes/);
  } finally {
    await site.close();
  }
});

test('a live description that differs from the build fails the meta item', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page({ description: 'Something older.' }) } }, sitemap: [PATH] });
  try {
    const r = await checkAll(entry(site.base), dist);
    assert.equal(r.pages[0].meta.ok, false);
    assert.match(r.pages[0].meta.detail, /description/);
  } finally {
    await site.close();
  }
});

test('a page missing from the live sitemap fails the sitemap item; a sitemap that is not there fails it too', async () => {
  const dist = build();
  const a = await live({ pages: { [PATH]: { html: page() } }, sitemap: ['/'] });
  try {
    const r = await checkAll(entry(a.base), dist);
    assert.deepEqual(items(r.pages[0]), { status: true, noindex: true, meta: true, sitemap: false });
    assert.match(r.pages[0].sitemap.detail, /sitemap\.xml/);
  } finally {
    await a.close();
  }
  const b = await live({ pages: { [PATH]: { html: page() } }, sitemap: '<html>404</html>' });
  try {
    assert.equal((await checkAll(entry(b.base), dist)).pages[0].sitemap.ok, false);
  } finally {
    await b.close();
  }
});

test('a sitemap index is followed to its child sitemaps; a trailing slash is not a different page', async () => {
  const dist = build();
  const site = await live({
    pages: { [PATH]: { html: page() } },
    sitemap: '<sitemapindex><sitemap><loc>{base}/sitemap-0.xml</loc></sitemap></sitemapindex>',
    files: { '/sitemap-0.xml': ['/blog/weeknight-dinners'] },
  });
  try {
    assert.equal((await checkAll(entry(site.base), dist)).pages[0].sitemap.ok, true);
  } finally {
    await site.close();
  }
});

test('a 404 fails the status item; the items that need the page count as failed, not passed', async () => {
  const dist = build();
  const site = await live({ pages: {}, sitemap: [PATH] });
  try {
    const r = await checkAll(entry(site.base), dist);
    assert.equal(r.pages[0].status.ok, false);
    assert.match(r.pages[0].status.detail, /404/);
    assert.equal(r.pages[0].noindex.ok, false);
    assert.equal(r.pages[0].meta.ok, false);
    assert.equal(verdict(r), 'fail');
    assert.deepEqual(r.failed.map((f) => f.item), ['status', 'noindex', 'meta']);
  } finally {
    await site.close();
  }
});

test('a site that cannot be reached fails the status item with the reason', async () => {
  const dist = build();
  const site = await live({});
  await site.close();
  const r = await checkAll(entry(site.base), dist);
  assert.equal(r.pages[0].status.ok, false);
  assert.match(r.pages[0].status.detail, /连不上/);
});

test('every URL is checked: one passing page does not hide the failing one', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page() }, '/': { html: page({ title: 'Stale', description: 'Recipes.' }) } }, sitemap: [PATH, '/'] });
  try {
    const r = await checkAll([...entry(site.base), { url: `${site.base}/`, keyword: null }], dist);
    assert.equal(r.pages.length, 2);
    assert.equal(r.pages[0].meta.ok, true);
    assert.equal(r.pages[1].meta.ok, false);
    assert.deepEqual(r.failed.map((f) => [f.url, f.item]), [[`${site.base}/`, 'meta']]);
  } finally {
    await site.close();
  }
});

test('a URL with no page in the build is an input error, not a failed check', () => {
  const dist = build();
  assert.throws(() => distFile(dist, 'https://cookbook.example/blog/nothing-here/'), /产物/);
  assert.ok(distFile(dist, 'https://cookbook.example/').endsWith('index.html'));
  assert.ok(distFile(dist, 'https://cookbook.example/blog/weeknight-dinners'), 'no trailing slash finds the same page');
  assert.ok(distFile(dist, 'https://cookbook.example/blog/weeknight-dinners/?utm=x#top'), 'query and hash are not part of the route');
});

test('parseUrls reads one URL and its 目标词 per line, whatever bullet or brackets the writer used', () => {
  const text = `
https://cookbook.example/blog/a/ 目标词：weeknight dinner ideas
- https://cookbook.example/blog/b/ 目标词: easy lunches
* <https://cookbook.example/blog/c/> 目标词：meal prep for two
- [ ] https://cookbook.example/blog/d/
这行不是网址
`;
  assert.deepEqual(parseUrls(text), [
    { url: 'https://cookbook.example/blog/a/', keyword: 'weeknight dinner ideas' },
    { url: 'https://cookbook.example/blog/b/', keyword: 'easy lunches' },
    { url: 'https://cookbook.example/blog/c/', keyword: 'meal prep for two' },
    { url: 'https://cookbook.example/blog/d/', keyword: null },
  ]);
  assert.deepEqual(parseUrls(''), []);
});

test('facts reads title, description and robots whatever the attribute order and quote style', () => {
  const f = facts(`<title> A &amp; B </title><meta content='Desc &quot;x&quot;' name='description'><meta content="noindex" name="robots">`);
  assert.deepEqual(f, { title: 'A & B', description: 'Desc "x"', noindex: true });
  assert.deepEqual(facts('<html></html>'), { title: null, description: null, noindex: false });
});

const served = (html) => async () => ({ status: 200, headers: new Headers(), text: async () => html() });

test('waitLive: not live until every page serves the build; live as soon as they all do', async () => {
  const dist = build();
  let polls = 0;
  let t = 0;
  const r = await waitLive(entry('https://cookbook.example'), dist, {
    fetch: served(() => (++polls > 2 ? page() : page({ title: 'Old title' }))),
    intervalMs: 60_000,
    maxMs: 30 * 60_000,
    sleep: async (ms) => { t += ms; },
    now: () => t,
  });
  assert.equal(r.live, true);
  assert.equal(r.waitedMs, 120_000, 'polled at 0, 1 and 2 minutes; the third poll matched');
});

test('waitLive: after the wait the pages still not serving the build are listed', async () => {
  const dist = build();
  let t = 0;
  let sleeps = 0;
  const r = await waitLive(entry('https://cookbook.example'), dist, {
    fetch: served(() => page({ title: 'Old title' })),
    intervalMs: 60_000,
    maxMs: 5 * 60_000,
    sleep: async (ms) => { sleeps++; t += ms; },
    now: () => t,
  });
  assert.equal(r.live, false);
  assert.deepEqual(r.pending, ['https://cookbook.example/blog/weeknight-dinners/']);
  assert.equal(r.waitedMs, 5 * 60_000);
  assert.equal(sleeps, 5, 'once a minute, five minutes');
});

test('waitLive: a title that matches while the description is still the old one is not live yet', async () => {
  const dist = build();
  let t = 0;
  const r = await waitLive(entry('https://cookbook.example'), dist, {
    fetch: served(() => page({ description: 'Something older.' })),
    intervalMs: 60_000,
    maxMs: 60_000,
    sleep: async (ms) => { t += ms; },
    now: () => t,
  });
  assert.equal(r.live, false);
});

test('CLI: SEO.md + build + URL list on stdin → JSON verdict; the failing item is named', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page({ head: '<meta name="robots" content="noindex">' }) } }, sitemap: [PATH] });
  try {
    const p = await cli([seoMd(), dist, '--urls=-'], `${site.base}${PATH} 目标词：weeknight dinner ideas\n`);
    assert.equal(p.code, 0, p.stderr);
    const out = JSON.parse(p.stdout);
    assert.equal(out.verdict, 'fail');
    assert.deepEqual(out.failed.map((f) => f.item), ['noindex']);
    assert.equal(out.pages[0].keyword, 'weeknight dinner ideas');
  } finally {
    await site.close();
  }
});

test('CLI: --wait on a site that already serves the build checks at once and says how long it waited', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page() } }, sitemap: [PATH] });
  try {
    const p = await cli([seoMd(), dist, '--urls=-', '--wait', '--interval=0.05'], `${site.base}${PATH} 目标词：weeknight dinner ideas\n`);
    assert.equal(p.code, 0, p.stderr);
    const out = JSON.parse(p.stdout);
    assert.equal(out.verdict, 'pass');
    assert.equal(out.waitedMinutes, 0);
  } finally {
    await site.close();
  }
});

test('CLI: --wait on a site that never serves the build gives up after 上线等待 and says not-live, not fail', async () => {
  const dist = build();
  const site = await live({ pages: { [PATH]: { html: page({ title: 'Old title' }) } }, sitemap: [PATH] });
  try {
    const p = await cli([seoMd('- 上线等待：1\n'), dist, '--urls=-', '--wait', '--interval=0.05', '--max-wait=0.3'], `${site.base}${PATH} 目标词：x\n`);
    assert.equal(p.code, 0, p.stderr);
    const out = JSON.parse(p.stdout);
    assert.equal(out.verdict, 'not-live');
    assert.deepEqual(out.pending, [`${site.base}${PATH}`]);
    assert.equal(out.limitMinutes, 1, 'the limit comes from 上线等待 when --max-wait is a test override of the clock only');
  } finally {
    await site.close();
  }
});

test('CLI: no URLs, an unreadable SEO.md or a URL without a page in the build exit 1 with the reason', async () => {
  const dist = build();
  const md = seoMd();
  const none = await cli([md, dist, '--urls=-'], '没有网址\n');
  assert.equal(none.code, 1);
  assert.match(none.stderr, /网址/);
  const missing = await cli([md, dist, '--urls=-'], 'https://cookbook.example/blog/nothing-here/ 目标词：x\n');
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /产物/);
  assert.equal((await cli([join(dirname(md), 'nope.md'), dist, '--urls=-'])).code, 1);
  assert.equal((await cli([md, dist])).code, 1, '--urls is required');
  assert.equal(spawnSync('node', [script]).status, 1);
});
