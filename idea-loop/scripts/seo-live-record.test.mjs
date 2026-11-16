import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentBody, liveChanges, marker, parseMarkers, recordOf } from './seo-live-record.mjs';

const item = (ok = true) => ({ ok, detail: '' });
const result = (over = {}) => ({
  verdict: 'pass',
  pages: [
    { url: 'https://cookbook.example/blog/weeknight-dinners/', keyword: 'weeknight dinner ideas', status: item(), noindex: item(), meta: item(), sitemap: item() },
    { url: 'https://cookbook.example/blog/meal-prep/', keyword: 'meal prep for two', status: item(), noindex: item(), meta: item(), sitemap: item() },
  ],
  failed: [],
  ...over,
});

test('the marker written into the comment reads back: URLs, target words, merge date and the four results', () => {
  const body = commentBody(result(), { mergedOn: '2026-11-16', pr: 321 });
  const [rec, ...more] = parseMarkers(body);
  assert.equal(more.length, 0);
  assert.equal(rec.mergedOn, '2026-11-16');
  assert.deepEqual(rec.pages, [
    { url: 'https://cookbook.example/blog/weeknight-dinners/', keyword: 'weeknight dinner ideas', status: true, noindex: true, meta: true, sitemap: true },
    { url: 'https://cookbook.example/blog/meal-prep/', keyword: 'meal prep for two', status: true, noindex: true, meta: true, sitemap: true },
  ]);
});

test('the comment says 上线自查 and shows each URL with its target word for a person; the marker is a hidden HTML comment', () => {
  const body = commentBody(result(), { mergedOn: '2026-11-16', pr: 321 });
  assert.match(body, /上线自查/);
  assert.match(body, /#321/);
  assert.match(body, /weeknight dinner ideas/);
  assert.match(body, /<!-- seo-live-check: \{/);
  assert.equal(body.split('-->').length - 1, 1, 'only one comment terminator: the JSON cannot close it early');
});

test('a value that would close the HTML comment cannot: the marker still reads back', () => {
  const r = result();
  r.pages[0].keyword = 'a --> b <script> & "quotes"';
  const body = commentBody(r, { mergedOn: '2026-11-16' });
  assert.equal(parseMarkers(body)[0].pages[0].keyword, 'a --> b <script> & "quotes"');
  assert.ok(!body.slice(body.indexOf('<!-- seo-live-check')).slice(0, -3).includes('-->'));
});

test('a target word that was not written reads back as null', () => {
  const r = result();
  r.pages[0].keyword = null;
  assert.equal(parseMarkers(commentBody(r, { mergedOn: '2026-11-16' }))[0].pages[0].keyword, null);
});

test('text without a marker, and a marker that is not JSON, read as nothing', () => {
  assert.deepEqual(parseMarkers('🤖 idea-loop：上线自查没做'), []);
  assert.deepEqual(parseMarkers('<!-- seo-live-check: {not json} -->'), []);
  assert.deepEqual(parseMarkers(undefined), []);
});

test('recordOf only takes a passed check: a failed or not-live result has no change to record', () => {
  assert.throws(() => recordOf(result({ verdict: 'fail', failed: [{ url: 'u', item: 'meta', detail: 'x' }] }), '2026-11-16'), /全过/);
  assert.throws(() => recordOf(result({ verdict: 'not-live' }), '2026-11-16'), /全过/);
  assert.throws(() => recordOf(result(), '16 Nov'), /YYYY-MM-DD/);
});

test('liveChanges lists each page of each closed SEO issue that carries the marker, one row per URL', () => {
  const issues = [
    { number: 12, title: 'SEO（已有页面优化）：改标题', comments: [{ body: '🤖 idea-loop：开工了' }, { body: `🤖 idea-loop：\n${commentBody(result(), { mergedOn: '2026-11-16' })}` }] },
    { number: 13, title: '没有自查', comments: [{ body: '随便说两句' }] },
    { number: 14, title: '没有评论', comments: [] },
  ];
  const rows = liveChanges(issues);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    issue: 12,
    title: 'SEO（已有页面优化）：改标题',
    url: 'https://cookbook.example/blog/weeknight-dinners/',
    keyword: 'weeknight dinner ideas',
    mergedOn: '2026-11-16',
    status: true,
    noindex: true,
    meta: true,
    sitemap: true,
  });
});

test('liveChanges --since keeps the changes merged on or after that day', () => {
  const old = commentBody(result(), { mergedOn: '2026-10-01' });
  const fresh = commentBody(result(), { mergedOn: '2026-11-10' });
  const issues = [{ number: 1, title: 'a', comments: [{ body: old }] }, { number: 2, title: 'b', comments: [{ body: fresh }] }];
  assert.deepEqual([...new Set(liveChanges(issues, { since: '2026-11-01' }).map((r) => r.issue))], [2]);
});

test('marker(record) is the same text commentBody puts in the comment', () => {
  const rec = recordOf(result(), '2026-11-16');
  assert.ok(commentBody(result(), { mergedOn: '2026-11-16' }).includes(marker(rec)));
});
