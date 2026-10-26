import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, parseArgs, render, visualWidth } from './seo-check.mjs';
import { errorsOnly, touchedSince } from './seo-check-hook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'seo-check.mjs');
const hook = join(here, 'seo-check-hook.mjs');

const EN_TITLE = 'Weeknight dinner ideas that take thirty minutes or less';
const EN_DESC = 'Thirty quick weeknight dinners with a shopping list for each, tested in a small kitchen, plus what to swap when an ingredient is missing from the shelf.';

function html({ lang = 'en', title = EN_TITLE, desc = EN_DESC, canonical = 'https://cookbook.example/', extra = '' } = {}) {
  return `<!doctype html><html lang="${lang}"><head><title>${title}</title><meta name="description" content="${desc}"><link rel="canonical" href="${canonical}">${extra}</head><body><h1>${title}</h1></body></html>`;
}

function site(pages) {
  const root = mkdtempSync(join(tmpdir(), 'seo-check-'));
  for (const [route, text] of Object.entries(pages)) {
    const dir = join(root, route);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), text);
  }
  return root;
}

const sevs = (findings) => findings.map((f) => f.sev);

test('width counts CJK double', () => {
  assert.equal(visualWidth('abc'), 3);
  assert.equal(visualWidth('菜谱'), 4);
});

test('a clean English page has no warnings or errors', () => {
  const dist = site({ '': html() });
  const { report } = check(dist);
  assert.deepEqual(sevs(report[0].findings).filter((s) => s === 'error' || s === 'warn'), []);
});

test('a Chinese title whose width is fine only gets the Bing false-positive info', () => {
  const zhTitle = '三十分钟以内就能做好的工作日晚餐菜谱合集与采购清单';
  const zhDesc = '三十道工作日快手晚餐，每道附采购清单，都在小厨房里实测过；缺了某样食材时用什么替换也写清楚，照着做当晚就能开饭，不用再跑一趟超市，周末也能提前备好。';
  const dist = site({ zh: html({ lang: 'zh-CN', title: zhTitle, desc: zhDesc, canonical: 'https://cookbook.example/zh' }) });
  const f = check(dist).report[0].findings;
  assert.ok(!f.some((x) => x.sev === 'warn' && /Title/.test(x.msg)));
  assert.ok(f.some((x) => x.sev === 'info' && x.platform === 'Bing' && /title too short/.test(x.msg)));
});

test('an over-wide description is an error, and an argument can raise the limit', () => {
  const long = `${EN_DESC} And one more sentence that pushes it well past the limit.`;
  const dist = site({ '': html({ desc: long }) });
  assert.ok(check(dist).report[0].findings.some((x) => x.sev === 'error' && /Description wide/.test(x.msg)));
  const raised = parseArgs([dist, '--desc-max=400']);
  assert.ok(!check(dist, raised).report[0].findings.some((x) => x.sev === 'error'));
});

test('duplicate canonicals and malformed JSON-LD are errors; FAQPage is only info', () => {
  const dist = site({
    a: html({ canonical: 'https://cookbook.example/a', extra: '<link rel="canonical" href="https://cookbook.example/b">' }),
    b: html({ canonical: 'https://cookbook.example/b', extra: '<script type="application/ld+json">{broken</script>' }),
    c: html({ canonical: 'https://cookbook.example/c', extra: '<script type="application/ld+json">{"@type":"FAQPage"}</script>' }),
  });
  const byRoute = Object.fromEntries(check(dist).report.map((r) => [r.routePath, r.findings]));
  assert.ok(byRoute['/a'].some((x) => x.sev === 'error' && /Multiple rel=canonical/.test(x.msg)));
  assert.ok(byRoute['/b'].some((x) => x.sev === 'error' && /Malformed JSON-LD/.test(x.msg)));
  assert.ok(byRoute['/c'].some((x) => x.sev === 'info' && /FAQPage/.test(x.msg)));
  assert.ok(!byRoute['/c'].some((x) => x.sev === 'error'));
});

test('hreflang must be reciprocal', () => {
  const dist = site({
    '': html({ canonical: 'https://cookbook.example', extra: '<link rel="alternate" hreflang="zh-CN" href="https://cookbook.example/zh">' }),
    zh: html({ lang: 'zh-CN', canonical: 'https://cookbook.example/zh' }),
  });
  const root = check(dist).report.find((r) => r.routePath === '/');
  assert.ok(root.findings.some((x) => x.sev === 'warn' && /not reciprocal/.test(x.msg)));
});

test('--filter narrows the report and the exit code, not the scan', () => {
  const dist = site({ ok: html({ canonical: 'https://cookbook.example/ok' }), bad: html({ canonical: 'https://cookbook.example/bad', title: '' }) });
  const filtered = parseArgs([dist, '--filter=ok']);
  const result = check(dist, filtered);
  assert.equal(result.pages.length, 2);
  assert.equal(render(dist, result, filtered).code, 0);
  assert.equal(render(dist, check(dist), { strict: false }).code, 1);
});

test('the CLI exits 1 on errors, 2 on a missing directory or an unknown flag', () => {
  const dist = site({ '': html({ title: '' }) });
  assert.equal(spawnSync(process.execPath, [script, dist], { encoding: 'utf8' }).status, 1);
  assert.equal(spawnSync(process.execPath, [script, join(dist, 'nope')], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [script, dist, '--lang=zh'], { encoding: 'utf8' }).status, 2);
});

// ── the post-build hook ────────────────────────────────────────────────────────

function repo({ seoMd = true, bad = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'seo-hook-'));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  if (seoMd) writeFileSync(join(root, 'SEO.md'), '# SEO\n\n## 构建与检查\n- 产物目录：`site/dist`\n');
  mkdirSync(join(root, 'site/dist'), { recursive: true });
  mkdirSync(join(root, 'app/dist'), { recursive: true });
  writeFileSync(join(root, 'site/dist/index.html'), html({ title: bad ? '' : EN_TITLE }));
  return root;
}

function runHook(event, cwd, id, env) {
  return spawnSync(process.execPath, [hook], { input: JSON.stringify({ hook_event_name: event, tool_name: 'Bash', tool_use_id: id, cwd, tool_input: { command: 'npm run build' } }), encoding: 'utf8', env: { ...process.env, ...env } });
}

const age = (file) => {
  const old = new Date(Date.now() - 60_000);
  utimesSync(file, old, old);
};

test('hook: the site build that left an error is reported back with exit 2', () => {
  const root = repo({ bad: true });
  const env = { IDEA_LOOP_SEO_HOOK_DIR: mkdtempSync(join(tmpdir(), 'seo-stamps-')) };
  age(join(root, 'site/dist/index.html'));
  assert.equal(runHook('PreToolUse', root, 't1', env).status, 0);
  writeFileSync(join(root, 'site/dist/index.html'), html({ title: '' }));
  const post = runHook('PostToolUse', root, 't1', env);
  assert.equal(post.status, 2);
  assert.match(post.stderr, /Missing <title>/);
});

test('hook: another build that did not touch the output dir passes', () => {
  const root = repo({ bad: true });
  const env = { IDEA_LOOP_SEO_HOOK_DIR: mkdtempSync(join(tmpdir(), 'seo-stamps-')) };
  age(join(root, 'site/dist/index.html'));
  runHook('PreToolUse', root, 't2', env);
  writeFileSync(join(root, 'app/dist/index.html'), 'student app build');
  assert.equal(runHook('PostToolUse', root, 't2', env).status, 0);
});

test('hook: without a PreToolUse record the start comes from duration_ms', () => {
  const root = repo({ bad: true });
  const env = { IDEA_LOOP_SEO_HOOK_DIR: mkdtempSync(join(tmpdir(), 'seo-stamps-')) };
  writeFileSync(join(root, 'site/dist/index.html'), html({ title: '' }));
  const run = (extra) => spawnSync(process.execPath, [hook], { input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_use_id: 'never-seen', cwd: root, ...extra }), encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(run({ duration_ms: 5000 }).status, 2);
  assert.equal(run({}).status, 0);
});

test('hook: no SEO.md, no check', () => {
  const root = repo({ seoMd: false, bad: true });
  const env = { IDEA_LOOP_SEO_HOOK_DIR: mkdtempSync(join(tmpdir(), 'seo-stamps-')) };
  runHook('PreToolUse', root, 't3', env);
  writeFileSync(join(root, 'site/dist/index.html'), html({ title: '' }));
  assert.equal(runHook('PostToolUse', root, 't3', env).status, 0);
});

test('hook helpers: touchedSince and errorsOnly', () => {
  const root = repo();
  const f = join(root, 'site/dist/index.html');
  age(f);
  assert.equal(touchedSince(join(root, 'site/dist'), Date.now() - 1000), false);
  assert.equal(touchedSince(join(root, 'missing'), 0), false);
  const report = '  /a\n    [WARN ] [Bing] Title thin\n  /b\n    [ERROR] [Both] Missing <title>.\nSummary: 1 error';
  assert.equal(errorsOnly(report), '/b\n    [ERROR] [Both] Missing <title>.\nSummary: 1 error');
});

test('the plugin hooks: Bash PreToolUse runs only the SEO check, the post-write hooks are all there, and the pre-merge hook is gone', () => {
  const hooks = JSON.parse(readFileSync(join(here, '..', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.deepEqual(hooks.PreToolUse, [
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-check-hook.mjs"' }] },
  ]);
  assert.deepEqual(hooks.PostToolUse, [
    {
      matcher: 'Write|Edit',
      hooks: ['design-lint-hook', 'design-md-hook', 'glossary-check-hook'].map((n) => ({
        type: 'command',
        command: `node "\${CLAUDE_PLUGIN_ROOT}/scripts/${n}.mjs"`,
      })),
    },
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-check-hook.mjs"' }] },
  ]);
  assert.deepEqual(Object.keys(hooks).sort(), ['PostToolUse', 'PreToolUse']);
  assert.doesNotMatch(JSON.stringify(hooks), /merge-gate/);
  for (const gone of ['merge-gate-hook.mjs', 'merge-gate-hook.test.mjs']) {
    assert.equal(existsSync(join(here, gone)), false, `${gone} should be deleted`);
  }
});
