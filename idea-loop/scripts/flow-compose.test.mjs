import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFlow, layout, renderHtml } from './flow-compose.mjs';

/** A well-formed flow: a main row, a branch off its second step, an unconnected 「同一规则」 row. */
const flow = () => ({
  title: '点一段还没下完的音频',
  scale: 0.5,
  rows: [
    {
      steps: [
        { image: 'idle.png', caption: '可播放' },
        { image: 'loading.png', trigger: '点播放', caption: '图标原位换成转圈', circles: [{ x: 40, y: 40, r: 36 }] },
        { image: 'playing.png', trigger: '下载完成', caption: '自动开始播放' },
      ],
    },
    { branchFrom: { row: 0, step: 1 }, steps: [{ image: 'failed.png', trigger: '下载失败', caption: '换成重试' }] },
    { label: '同一规则 · 后台预取失败', connected: false, steps: [{ image: 'failed-bg.png', caption: '只换按钮' }] },
  ],
  note: '每个失败只有一个可点的重试目标。',
});

test('a well-formed flow is valid', () => {
  assert.deepEqual(checkFlow(flow()), { valid: true, errors: [] });
});

test('a step with an arrow into it must say what triggers it', () => {
  const f = flow();
  delete f.rows[0].steps[2].trigger;
  const r = checkFlow(f);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('第 1 行第 3 步') && e.includes('trigger')));
});

test('every step needs its caption', () => {
  const f = flow();
  delete f.rows[1].steps[0].caption;
  assert.ok(checkFlow(f).errors.some((e) => e.includes('caption')));
});

test('a branch must fork from a step that exists in a row above it', () => {
  const f = flow();
  f.rows[1].branchFrom = { row: 0, step: 7 };
  assert.ok(checkFlow(f).errors.some((e) => e.includes('branchFrom.step')));
  f.rows[1].branchFrom = { row: 1, step: 0 };
  assert.ok(checkFlow(f).errors.some((e) => e.includes('branchFrom.row')));
});

test('an unconnected row must carry its 「同一规则」 label', () => {
  const f = flow();
  delete f.rows[2].label;
  assert.ok(checkFlow(f).errors.some((e) => e.includes('label')));
});

test('a trigger on a row start with nothing pointing in is flagged, not silently dropped', () => {
  const f = flow();
  f.rows[0].steps[0].trigger = '打开';
  assert.ok(checkFlow(f).errors.some((e) => e.includes('第 1 行第 1 步') && e.includes('画不出来')));
});

test('rings need numeric x / y / r in source pixels', () => {
  const f = flow();
  f.rows[0].steps[1].circles = [{ x: 1, y: 2 }];
  assert.ok(checkFlow(f).errors.some((e) => e.includes('光圈')));
});

test('a missing screenshot is named', () => {
  const r = checkFlow(flow(), (p) => p !== 'failed.png');
  assert.ok(r.errors.some((e) => e.includes('failed.png')));
});

test('a branch starts one column right of the step it forks from', () => {
  const { placed, cols } = layout(flow());
  assert.equal(placed[1].start, 2);
  assert.equal(cols, 3);
  assert.equal(placed[2].labelRow !== null, true);
});

test('the html carries every trigger, caption and ring, scaled', () => {
  const html = renderHtml(flow(), (p) => `x/${p}`);
  for (const t of ['点播放', '下载完成', '下载失败', '可播放', '同一规则 · 后台预取失败', '每个失败只有一个可点的重试目标。']) {
    assert.ok(html.includes(t), t);
  }
  assert.ok(html.includes('src="x/loading.png"'));
  assert.ok(html.includes('left:2px;top:2px;width:36px;height:36px'));
  assert.ok(html.includes('data-branch="1"'));
});

test('text is escaped', () => {
  const f = flow();
  f.title = '<script>';
  assert.ok(!renderHtml(f).includes('<title><script>'));
});
