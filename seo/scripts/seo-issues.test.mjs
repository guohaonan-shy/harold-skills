import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, marker, plan, rejection } from './seo-issues.mjs';
import { parseTypes } from './issues.mjs';

const finding = (over = {}) => ({
  direction: 'technical',
  kind: 'missing-meta-description',
  title: '页面没有 meta description',
  targets: ['https://cookbook.example/a'],
  evidence: { what: 'get_audit_pages limit 1000', when: '2026-10-20', values: 'metaDescription 为空' },
  repro: 'get_audit_pages，看 metaDescription 为空的行；或 curl -s 该网址 | grep description',
  fix: '每页写一句描述',
  acceptance: ['页面 head 里有 meta description'],
  ...over,
});

test('rejects findings without evidence, repro, acceptance, or a ratio behind a percentage', () => {
  assert.equal(rejection(finding()), null);
  assert.match(rejection(finding({ evidence: undefined })), /证据/);
  assert.match(rejection(finding({ repro: '' })), /复现/);
  assert.match(rejection(finding({ acceptance: [] })), /验收/);
  assert.match(rejection(finding({ title: 'CTR 只有 1.1% ' })), /分子分母/);
  assert.equal(rejection(finding({ title: 'CTR 只有 1.1%', ratio: { numerator: 11, denominator: 1042 } })), null);
  assert.match(rejection(finding({ direction: 'social' })), /方向/);
  assert.match(rejection(finding({ kind: 'Missing Desc' })), /kind/);
  assert.equal(rejection(finding({ kind: 'content-工作日晚餐' })), null);
});

test('a Chinese kind still dedupes against its open issue', () => {
  const f = finding({ direction: 'keywords', kind: 'content-工作日晚餐' });
  assert.equal(plan([f], [{ number: 3, title: 'x', body: marker(f) }]).comment.length, 1);
});

test('thirty findings of one kind become one issue listing every target', () => {
  const many = Array.from({ length: 30 }, (_, i) => finding({ targets: [`https://cookbook.example/p${i}`] }));
  const p = plan(many, []);
  assert.equal(p.create.length, 1);
  assert.equal(p.comment.length, 0);
  for (let i = 0; i < 30; i++) assert.ok(p.create[0].body.includes(`https://cookbook.example/p${i}`));
  assert.ok(p.create[0].body.includes(marker(many[0])));
  assert.match(p.create[0].title, /^SEO（技术 SEO 与索引）：/);
});

test('an open issue with the same marker gets a comment with only the new targets', () => {
  const open = [{ number: 7, title: 'old', body: `- https://cookbook.example/a\n\n${marker(finding({ direction: 'pages', kind: 'low-ctr' }))}` }];
  const p = plan([finding({ direction: 'pages', kind: 'low-ctr', targets: ['https://cookbook.example/a', 'https://cookbook.example/b', 'https://cookbook.example/c'] })], open);
  assert.equal(p.create.length, 0);
  assert.equal(p.comment.length, 1);
  assert.equal(p.comment[0].number, 7);
  assert.ok(p.comment[0].body.includes('https://cookbook.example/b'));
  assert.ok(p.comment[0].body.includes('https://cookbook.example/c'));
  assert.ok(!p.comment[0].body.includes('- https://cookbook.example/a'));
});

test('uncollected placeholders are skipped; content and backlink issues carry the stage pointers', () => {
  const p = plan(
    [
      { direction: 'geo', uncollected: '没有 AI 可见性跟踪' },
      finding({ direction: 'keywords', kind: 'new-topic', content: { keyword: 'weeknight dinner ideas', pageType: '教程', mode: 'new' } }),
      finding({ direction: 'backlinks', kind: 'competitor-only-domains' }),
    ],
    [],
  );
  assert.equal(p.create.length, 2);
  assert.match(p.create[0].body, /idea-loop:seo-brief/);
  assert.match(p.create[0].body, /需要 grill：选题角度和论点/);
  assert.match(p.create[1].body, /idea-loop:seo-outreach/);
  assert.match(p.create[1].body, /由人发送/);
  assert.deepEqual(p.rejected, []);
});

/** A fake gh that records calls and answers what seo-issues asks. */
function fakeGh() {
  const calls = [];
  let next = 40;
  const labels = new Map();
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'issue' && args[1] === 'create') return `https://github.com/acme/cookbook/issues/${next++}\n`;
    if (args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ number: Number(args[2]), state: 'OPEN', title: 't', labels: (labels.get(args[2]) ?? []).map((name) => ({ name })) });
    if (args[0] === 'issue' && args[1] === 'edit') {
      const add = args.flatMap((a, i) => (a === '--add-label' ? [args[i + 1]] : []));
      labels.set(args[2], [...(labels.get(args[2]) ?? []), ...add]);
      return '';
    }
    return '';
  };
  return { gh, calls, labels };
}

const TYPES = parseTypes('## issue 分类\n\n- `bug`：缺陷\n- `seo`：搜索流量\n  - `technical`：技术\n  - `keywords`：关键词\n');

test('apply: new issues get no status label and are classified seo/<direction>', () => {
  const { gh, calls, labels } = fakeGh();
  const p = plan([finding(), finding({ direction: 'keywords', kind: 'new-topic' })], []);
  const r = apply(gh, TYPES, p);
  assert.deepEqual(r.created.map((c) => c.number), [40, 41]);
  assert.equal(r.untyped, false);
  assert.deepEqual(labels.get('40').sort(), ['type:seo', 'type:seo/technical']);
  assert.deepEqual(labels.get('41').sort(), ['type:seo', 'type:seo/keywords']);
  assert.ok(!calls.flat().some((a) => String(a).startsWith('status:')));
});

test('apply: a project without the seo category still gets the issue, flagged untyped', () => {
  const { gh, labels } = fakeGh();
  const r = apply(gh, parseTypes('## issue 分类\n\n- `bug`：缺陷\n'), plan([finding()], []));
  assert.equal(r.created.length, 1);
  assert.equal(r.untyped, true);
  assert.equal(labels.get('40'), undefined);
});

test('apply: comments go to the open issue, nothing is created', () => {
  const { gh, calls } = fakeGh();
  const open = [{ number: 9, title: 'old', body: marker(finding()) }];
  const r = apply(gh, TYPES, plan([finding()], open));
  assert.deepEqual(r.created, []);
  assert.deepEqual(r.commented, [{ number: 9, title: 'old' }]);
  assert.ok(calls.some((a) => a[1] === 'comment' && a[2] === '9'));
});
