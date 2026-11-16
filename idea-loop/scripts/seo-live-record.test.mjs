import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameFromRollback, commentBody, fromRollback, liveChanges, marker, parseMarkers, recordOf, ROLLBACK_LINE } from './seo-live-record.mjs';

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

test('an issue whose body carries 由上线自查回滚而来 came from a rollback; an ordinary body, an empty one and a near miss did not', () => {
  assert.equal(ROLLBACK_LINE, '由上线自查回滚而来');
  assert.equal(cameFromRollback(`## 问题\n\n改了 /blog/meal-prep/ 的 title，上线后带了 noindex\n\n## 从哪发现\n\n合并后的上线自查，${ROLLBACK_LINE}。原 issue #12。`), true);
  assert.equal(cameFromRollback(`${ROLLBACK_LINE}`), true);
  assert.equal(cameFromRollback('## 问题\n\n/blog/meal-prep/ 的 title 太长，被截断'), false);
  assert.equal(cameFromRollback('由上线自查回退而来'), false);
  assert.equal(cameFromRollback(''), false);
  assert.equal(cameFromRollback(null), false);
  assert.equal(cameFromRollback(undefined), false);
});

test('fromRollback reads the issue body through gh and says whether it came from a rollback', () => {
  const calls = [];
  const gh = (body) => (args) => {
    calls.push(args);
    return JSON.stringify({ body });
  };
  assert.equal(fromRollback(gh(`从哪发现：上线自查。${ROLLBACK_LINE}`), 12), true);
  assert.deepEqual(calls[0], ['issue', 'view', '12', '--json', 'body']);
  assert.equal(fromRollback(gh('## 问题\n\n页面 title 太长'), 13), false);
  assert.equal(fromRollback(gh(null), 14), false, 'an issue with no body is an ordinary one');
});

test('fromRollback does not guess: a key that is not an issue number, or a gh that fails, is an error', () => {
  assert.throws(() => fromRollback(() => '{}', 'FA-577'), /issue 号/);
  assert.throws(() => fromRollback(() => { throw new Error('gh: not found'); }, 12), /not found/);
});
