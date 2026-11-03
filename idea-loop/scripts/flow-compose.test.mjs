import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFlow, flowFileName, layout, renderHtml, stateMap } from './flow-compose.mjs';
import { compliantFiles, writeRepo } from './design-archive-fixture.mjs';

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

// ---- state ids: each step may name the design-archive state it shows ----

/** The same flow, with the archive state each step shows. */
const withStates = () => {
  const f = flow();
  f.rows[0].steps[0].state = 'player--idle';
  f.rows[0].steps[1].state = 'player--loading';
  f.rows[0].steps[2].state = 'player--playing';
  f.rows[1].steps[0].state = 'player--failed';
  return f;
};

test('without state ids the html is byte-for-byte what it was before state ids existed', () => {
  // sha256 of renderHtml(flow(), p => `x/${p}`) taken from the script before the state field was added.
  const html = renderHtml(flow(), (p) => `x/${p}`);
  assert.equal(createHash('sha256').update(html).digest('hex'), '0acdd9cb7ededd34f42dcfc9f4ca9bc165f22c70242b87e2f8cde84130c3a4ca');
  assert.ok(!html.includes('data-state'));
});

test('a flow whose steps carry state ids is valid, and ids are optional per step', () => {
  assert.deepEqual(checkFlow(withStates()), { valid: true, errors: [] });
  const f = withStates();
  delete f.rows[0].steps[1].state;
  assert.deepEqual(checkFlow(f), { valid: true, errors: [] });
});

test('a state id is one archive name: no spaces, no brackets, not empty', () => {
  for (const bad of ['', '  ', 'player loading', '[[player--loading]]', 7]) {
    const f = withStates();
    f.rows[0].steps[1].state = bad;
    const r = checkFlow(f);
    assert.equal(r.valid, false, JSON.stringify(bad));
    assert.ok(r.errors.some((e) => e.includes('第 1 行第 2 步') && e.includes('state')), JSON.stringify(bad));
  }
});

test('when the archive is supplied, a state id it does not know is named', () => {
  const known = new Set(['player--idle', 'player--loading', 'player--playing']);
  const r = checkFlow(withStates(), () => true, (id) => known.has(id));
  assert.equal(r.valid, false);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('第 2 行第 1 步') && r.errors[0].includes('player--failed'));
  assert.deepEqual(checkFlow(withStates(), () => true, () => true), { valid: true, errors: [] });
});

test('state ids are not checked against the archive unless one is supplied', () => {
  const f = withStates();
  f.rows[0].steps[0].state = 'no-such--state';
  assert.deepEqual(checkFlow(f), { valid: true, errors: [] });
});

test('the html keeps the correspondence: every figure carries its state id, shown under the caption', () => {
  const html = renderHtml(withStates(), (p) => `x/${p}`);
  for (const id of ['player--idle', 'player--loading', 'player--playing', 'player--failed']) {
    assert.ok(html.includes(`data-state="${id}"`), id);
    assert.ok(html.includes(`<div class="state">${id}</div>`), id);
  }
  assert.equal([...html.matchAll(/data-state=/g)].length, 4, 'the step without one gets none');
});

test('state ids are escaped in the html', () => {
  const f = withStates();
  f.rows[0].steps[0].state = 'a"b';
  assert.ok(!renderHtml(f).includes('data-state="a"b"'));
});

test('stateMap lists the steps that name a state, in reading order, so the figure can be traced back', () => {
  assert.deepEqual(stateMap(flow()), []);
  assert.deepEqual(stateMap(withStates()), [
    { row: 1, step: 1, state: 'player--idle', caption: '可播放' },
    { row: 1, step: 2, state: 'player--loading', caption: '图标原位换成转圈' },
    { row: 1, step: 3, state: 'player--playing', caption: '自动开始播放' },
    { row: 2, step: 1, state: 'player--failed', caption: '换成重试' },
  ]);
});

test('flowFileName: the figure is named after the state its first cell shows, page included', () => {
  assert.equal(flowFileName(withStates(), 2), 'flow-2-player--idle.png');
  assert.equal(flowFileName(flow(), 2), null, 'no state ids, no state in the name');
  const f = withStates();
  delete f.rows[0].steps[0].state;
  assert.equal(flowFileName(f, 1), 'flow-1-player--loading.png', 'the first cell that names one');
});

// ---- the CLI: --archive checks the ids against the design archive, a sidecar keeps the map ----

const script = join(dirname(fileURLToPath(import.meta.url)), 'flow-compose.mjs');

/** A repo with the fixture archive and a one-row flow whose steps name cookbook states. */
function cliCase(states) {
  const repo = writeRepo(compliantFiles());
  const work = mkdtempSync(join(tmpdir(), 'flow-compose-'));
  writeFileSync(join(work, 'a.png'), 'png');
  writeFileSync(join(work, 'b.png'), 'png');
  const f = {
    title: '搜索菜谱',
    rows: [{ steps: [{ image: 'a.png', caption: '列表', state: states[0] }, { image: 'b.png', trigger: '搜索', caption: '搜索中', state: states[1] }] }],
  };
  writeFileSync(join(work, 'flow.json'), JSON.stringify(f));
  return { repo, work };
}

const compose = ({ repo, work }, ...extra) =>
  spawnSync(process.execPath, [script, join(work, 'flow.json'), join(work, 'flow-1.png'), ...extra], {
    cwd: work, // no node_modules up this chain, so no playwright: the run stops after writing the html
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: '' },
  });

test('cli: with --archive, known state ids pass and the map is written next to the figure', () => {
  const c = cliCase(['cookbook--list', 'cookbook--search-loading']);
  const res = compose(c, '--archive', c.repo);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(join(c.work, 'flow-1.html'), 'utf8');
  assert.ok(html.includes('data-state="cookbook--search-loading"'));
  assert.deepEqual(JSON.parse(readFileSync(join(c.work, 'flow-1.states.json'), 'utf8')), [
    { row: 1, step: 1, state: 'cookbook--list', caption: '列表' },
    { row: 1, step: 2, state: 'cookbook--search-loading', caption: '搜索中' },
  ]);
});

test('cli: with --archive, an id the archive does not have stops the run with exit 2', () => {
  const c = cliCase(['cookbook--list', 'cookbook--nowhere']);
  const res = compose(c, '--archive', c.repo);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /cookbook--nowhere/);
  assert.ok(!existsSync(join(c.work, 'flow-1.html')));
});

test('cli: --delta lays the requirement on top, so a state that only exists there is found', () => {
  const c = cliCase(['cookbook--list', 'cookbook--share-sheet']);
  assert.equal(compose(c, '--archive', c.repo).status, 2, 'not in prod/');
  const delta = `${c.repo}/docs/design/tmp/demo-spec/delta/pages/cookbook`;
  mkdirSync(delta, { recursive: true });
  writeFileSync(
    join(delta, 'cookbook--share-sheet.md'),
    '---\ntype: design-state\ntags: [cookbook]\nsummary: 分享面板\npage: "[[cookbook]]"\nedges: []\n---\n\n## 这一屏\n\n分享面板。\n\n## 应看到什么\n\n- 看到分享面板\n',
  );
  const res = compose(c, '--archive', c.repo, '--delta', 'demo-spec');
  assert.equal(res.status, 0, res.stderr);
});

test('cli: a figure named flow-<n>-… with state ids must carry its first state in the name', () => {
  const c = cliCase(['cookbook--list', 'cookbook--search-loading']);
  const run = (name) =>
    spawnSync(process.execPath, [script, join(c.work, 'flow.json'), join(c.work, name)], { cwd: c.work, encoding: 'utf8' });
  const wrong = run('flow-1-cookbook--search-loading.png');
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /flow-1-cookbook--list\.png/);
  assert.equal(run('flow-1-cookbook--list.png').status, 0);
  assert.equal(run('anything.png').status, 0, 'only the flow-<n>- convention is enforced');
});

test('cli: without state ids and without --archive nothing extra is written', () => {
  const c = cliCase([undefined, undefined]);
  const res = compose(c);
  assert.equal(res.status, 0, res.stderr);
  assert.ok(!existsSync(join(c.work, 'flow-1.states.json')));
});

test('cli: --archive that is not a repository root is a usage error', () => {
  const c = cliCase(['cookbook--list', 'cookbook--search-loading']);
  const res = compose(c, '--archive', join(c.work, 'nope'));
  assert.equal(res.status, 1);
});
