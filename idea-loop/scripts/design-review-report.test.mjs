import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildReport, parseThoughts, canvasLink, versionLabel, NO_REFERENCE_MESSAGE, RECOMMEND_KEEP, RECOMMEND_REOPEN,
} from './design-review-report.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'design-review-report.mjs');

// A 1x1 PNG; every picture in these fixtures is this one, which is enough to see it inlined.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const readImage = (path) => {
  if (!path.endsWith('.png') && !path.endsWith('.jpg')) throw new Error('not an image');
  return PIXEL;
};

const CANVAS = { current: 'http://127.0.0.1:4173/v3.html', previous: 'http://127.0.0.1:4173/v2.html' };

/** Four judge opinions: a direction one, a pattern one, and two craft ones the researcher merged / could not cover. */
function fixtureJudge() {
  return {
    findings: [
      { kind: 'direction', state: 'quiz-exit', where: '退出入口', detail: '退出入口应该整个挪进二级菜单', why: '一级入口太抢眼', reference: '练习页里退出要多走一步的画面' },
      { kind: 'pattern', state: 'quiz-exit', where: '确认窗', detail: '确认窗的主按钮应该是留下', why: '防止误退出', reference: '确认窗里默认动作是留下' },
      { kind: 'craft', state: 'results', where: '分数卡', detail: '分数字号比标题小', why: '层级倒了', reference: '结果页分数最大' },
      { kind: 'craft', state: 'results', where: '空状态', detail: '空状态没有重试按钮', why: '用户走不下去', reference: '空状态下的重试' },
    ],
    reasoning: [
      { id: '1', verdict: '成立', why: '保持一级入口符合人的意图' },
      { id: '2', verdict: '存疑', why: '卡片阴影与整体扁平不一致' },
    ],
    score: 7,
    note: '整体接近，退出入口的取舍要人定',
  };
}

/** What the human wrote this round: the two thoughts the critic assessed, and one kept after discussion (not assessed). */
const THOUGHTS_MD = `1 | 退出入口我想保持在一级，不要藏起来
2 | 卡片阴影可以留一点，
但不要太重
3 | 三卡布局我就要这样
`;
const fixtureThoughts = () => parseThoughts(THOUGHTS_MD);

function fixtureResearch() {
  return {
    mode: 'light',
    mobbin: 'connected',
    items: [
      {
        covers: [1],
        path: [{
          source: 'Acme 练习', saw: '右上角有一个 X', did: '点 X', then: '弹出确认窗',
          images: ['shots/acme-1.jpg'], reading: '先确认再退出',
        }],
        intent: '退出入口留在右上角，点后先弹确认',
        overturns: [{ ledger: '1.2', why: 'Acme 把退出放在第一屏，用户一步就找到' }],
      },
      {
        covers: [2, 3],
        path: [{
          source: 'Acme 练习', saw: '确认窗', did: '点「继续」', then: '回到练习页',
          images: ['shots/acme-2.jpg', 'shots/acme-3.jpg'], reading: '默认动作是留下',
        }],
        intent: '确认窗里「继续」是主按钮，分数最大',
      },
    ],
    uncovered: [{ opinion: 4, why: '搜了两个角度，没有能呈现空状态重试的画面' }],
  };
}

function fixtureDiff(undeclared) {
  return {
    mode: 'canvas-diff', classified: true, changed: [], declared: [], declaredUnchanged: [], unchecked: [], humanReviewCells: [],
    undeclared: undeclared ?? [
      {
        cell: 'quiz-exit', state: 'quiz-exit', anchor: 'footer', kind: 'changed',
        changes: [{ property: 'backgroundColor', before: 'rgb(255, 255, 255)', after: 'rgb(240, 240, 240)', delta: null }],
        pixelPercent: 3.5, shots: { before: '/shots/quiz-exit--footer--before.png', after: '/shots/quiz-exit--footer--after.png' },
      },
      { cell: 'results', state: 'results', anchor: 'badge', kind: 'added', changes: [], pixelPercent: null, shots: null },
    ],
  };
}

const build = (over = {}) => buildReport({
  judge: fixtureJudge(), research: fixtureResearch(), diff: fixtureDiff(), canvas: CANVAS, thoughts: fixtureThoughts(), readImage, ...over,
});

const article = (html, n) => html.match(new RegExp(`<article id="r${n}"[\\s\\S]*?</article>`))?.[0];
const sectionOrder = (html) => [...html.matchAll(/<section data-section="([a-z]+)"/g)].map((m) => m[1]);

test('the four sections come in order, the undeclared changes first', () => {
  const { html } = build();
  assert.deepEqual(sectionOrder(html), ['undeclared', 'opinions', 'reasoning', 'score']);
  assert.ok(html.indexOf('没声明却变了的地方') < html.indexOf('评委的意见'));
  assert.ok(html.indexOf('评委的意见') < html.indexOf('评委对你这一轮思路的评估'));
  assert.ok(html.indexOf('评委对你这一轮思路的评估') < html.indexOf('分数与评委的总评'));
});

test('without undeclared changes the first section is not there at all', () => {
  const { html, entries } = build({ diff: fixtureDiff([]) });
  assert.deepEqual(sectionOrder(html), ['opinions', 'reasoning', 'score']);
  assert.ok(!html.includes('没声明却变了的地方'));
  assert.equal(entries[0].n, 1);
  assert.equal(entries[0].section, 'opinions');
});

test('each undeclared change shows before and after and asks keep or undo', () => {
  const { html } = build();
  const first = article(html, 1);
  assert.match(first, /quiz-exit · footer/);
  assert.match(first, /改前/);
  assert.match(first, /改后/);
  assert.match(first, /留，还是撤/);
  assert.match(first, /backgroundColor：rgb\(255, 255, 255\) → rgb\(240, 240, 240\)/);
  assert.equal([...first.matchAll(/<img /g)].length, 2);
  // a change with no area to cut says so instead of showing empty frames
  const second = article(html, 2);
  assert.match(second, /新增了这个锚点/);
  assert.equal([...second.matchAll(/<img /g)].length, 0);
});

test('numbers are unique across sections and consecutive from 1', () => {
  const { html, entries } = build();
  const numbers = [...html.matchAll(/<article id="r(\d+)" data-n="(\d+)"/g)].map((m) => {
    assert.equal(m[1], m[2]);
    return Number(m[1]);
  });
  assert.deepEqual(numbers, numbers.map((_, i) => i + 1));
  assert.equal(numbers.length, 2 + 4 + 2);
  assert.deepEqual(entries.map((e) => e.n), numbers);
  assert.equal(new Set(numbers).size, numbers.length);
});

test('every opinion links to this version and its own state; undeclared changes to both versions', () => {
  const { html, entries } = build();
  for (const e of entries.filter((x) => x.section === 'opinions')) {
    const hrefs = [...article(html, e.n).matchAll(/<a href="([^"]+)"/g)].map((m) => new URL(m[1].replaceAll('&amp;', '&')));
    assert.equal(hrefs.length, 1, `opinion #${e.n} has one canvas link`);
    assert.equal(hrefs[0].pathname, '/v3.html');
    assert.equal(hrefs[0].searchParams.get('state'), e.state);
  }
  const hrefs = [...article(html, 1).matchAll(/<a href="([^"]+)"/g)].map((m) => new URL(m[1]));
  assert.deepEqual(hrefs.map((u) => u.pathname), ['/v3.html', '/v2.html']);
  assert.ok(hrefs.every((u) => u.searchParams.get('state') === 'quiz-exit'));
});

test('canvasLink and versionLabel follow the canvas shell\'s way of addressing a version and state', () => {
  assert.equal(canvasLink('http://127.0.0.1:4173/v3.html', 'quiz-exit'), 'http://127.0.0.1:4173/v3.html?state=quiz-exit');
  assert.equal(versionLabel('http://127.0.0.1:4173/v3.html'), 'v3');
});

test('no picture is a reference to an outside file: every image is inlined', () => {
  const { html } = build();
  const sources = [...html.matchAll(/<img [^>]*src="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(sources.length, 5, 'two area shots + the researcher\'s three pictures');
  assert.ok(sources.every((s) => s.startsWith('data:image/')), 'every <img> carries a data: URI');
  assert.ok(!/<link[^>]+href/i.test(html) && !/<script[^>]+src/i.test(html));
  assert.ok(!/url\(\s*['"]?(https?:|\/|\.)/.test(html));
});

test('a direction opinion the human was already unhappy about recommends reopening in imagine, with their words', () => {
  const { html, entries } = build({ dissatisfied: [{ opinion: 1, quote: '退出入口放二级菜单我不要，找不到' }] });
  const e = entries.find((x) => x.opinion === 1);
  assert.equal(e.recommend, RECOMMEND_REOPEN);
  const card = article(html, e.n);
  assert.match(card, new RegExp(`推荐：${RECOMMEND_REOPEN}`));
  assert.match(card, /退出入口放二级菜单我不要，找不到/);
});

test('a direction opinion with no mark recommends keeping', () => {
  const { html, entries } = build();
  const e = entries.find((x) => x.opinion === 1);
  assert.equal(e.recommend, RECOMMEND_KEEP);
  const card = article(html, e.n);
  assert.match(card, new RegExp(`推荐：${RECOMMEND_KEEP}`));
  assert.ok(!card.includes(RECOMMEND_REOPEN));
});

test('a mark on an opinion that is not a direction one, or out of range, is refused', () => {
  assert.throws(() => build({ dissatisfied: [{ opinion: 2, quote: '不满意' }] }), /not a direction opinion/);
  assert.throws(() => build({ dissatisfied: [{ opinion: 9, quote: '不满意' }] }), /opinion numbers 1–4/);
  assert.throws(() => build({ dissatisfied: [{ opinion: 1, quote: ' ' }] }), /human's own words/);
});

test('an overturn of the ledger is marked on its opinion with the ledger number and the reason', () => {
  const { html, entries, summary } = build();
  const e = entries.find((x) => x.opinion === 1);
  assert.deepEqual(e.overturns, [{ ledger: '1.2', why: 'Acme 把退出放在第一屏，用户一步就找到' }]);
  const card = article(html, e.n);
  assert.match(card, /class="overturn"[^>]*>推翻 ledger 1\.2（报告 #3）：Acme 把退出放在第一屏，用户一步就找到/);
  // the other items are not marked
  assert.ok(!article(html, 4).includes('class="overturn"'));
  assert.match(summary, /#3 提议推翻 ledger 1\.2/);
});

test('opinions the researcher merged show the path once and point the others at it', () => {
  const { html, entries } = build();
  const second = entries.find((x) => x.opinion === 2);
  const third = entries.find((x) => x.opinion === 3);
  assert.match(article(html, second.n), /用户路径/);
  assert.match(article(html, second.n), /新的设计意图：<\/strong>确认窗里「继续」是主按钮/);
  assert.match(article(html, third.n), new RegExp(`跟 #${second.n} 是同一件事`));
  assert.ok(!article(html, third.n).includes('新的设计意图：'));
  // an opinion the researcher could not cover says why instead of showing a picture
  assert.match(article(html, entries.find((x) => x.opinion === 4).n), /没有找到能呈现这一点的参考：搜了两个角度/);
});

test('with Mobbin not connected the report still comes out and says there are no reference pictures', () => {
  const research = {
    mode: 'light', mobbin: 'unavailable', message: NO_REFERENCE_MESSAGE, reason: 'search_screens 返回要先登录', items: [],
  };
  const { html, entries } = build({ research });
  const opinions = html.match(/<section data-section="opinions">[\s\S]*?<\/section>/)[0];
  assert.equal([...opinions.matchAll(new RegExp(NO_REFERENCE_MESSAGE, 'g'))].length, 4, 'once per opinion, where the pictures would be');
  assert.ok(!opinions.includes('<img'));
  assert.ok(!opinions.includes('新的设计意图'));
  // non-direction opinions fall back to the judge's own words
  assert.equal(entries.find((x) => x.opinion === 2).recommend, '收下评委的意见');
  assert.deepEqual(sectionOrder(html), ['undeclared', 'opinions', 'reasoning', 'score']);
});

test('the conversation text holds the score and the items needing attention, and nothing else', () => {
  const { summary } = build({ dissatisfied: [{ opinion: 1, quote: '退出入口放二级菜单我不要，找不到' }] });
  assert.match(summary, /7 分/);
  assert.match(summary, /没声明却变了的地方 2 处：#1、#2/);
  assert.match(summary, /提议推翻 ledger 1\.2/);
  assert.match(summary, /#3 方向性意见（quiz-exit），推荐回 imagine 重开这一块/);
  // none of the report body leaks into it
  for (const body of ['退出入口应该整个挪进二级菜单', '确认窗里「继续」是主按钮', '保持一级入口符合人的意图', '整体接近', 'http', 'data:', '<']) {
    assert.ok(!summary.includes(body), `summary must not carry: ${body}`);
  }
  assert.equal(summary.split('\n').length, 1 + 1 + 3, 'title, the heading, three attention lines');
});

test('a quiet round says there is nothing special to look at', () => {
  const judge = { findings: [{ kind: 'craft', state: 'results', where: '分数卡', detail: 'd', why: 'w', reference: 'r' }], reasoning: [], score: 9, note: null };
  const research = { mode: 'light', mobbin: 'connected', items: [{ covers: [1], path: [{ source: 'S', saw: 'a', did: 'b', then: 'c', images: ['shots/x.png'], reading: 'r' }], intent: 'i' }] };
  const { summary, html } = build({ judge, research, diff: fixtureDiff([]) });
  assert.match(summary, /9 分/);
  assert.match(summary, /没有要特别注意的项/);
  assert.match(html, /这一轮没有要评估的思路/);
  assert.match(html, /评委没有写总评/);
});

test('each assessed thought shows the human\'s own words, then the critic\'s verdict and reason', () => {
  const { html, entries } = build();
  const [first, second] = entries.filter((e) => e.section === 'reasoning');
  const one = article(html, first.n);
  assert.match(one, /你说：「退出入口我想保持在一级，不要藏起来」/);
  assert.match(one, /→ 评委：<span class="tag">成立<\/span>，理由：保持一级入口符合人的意图/);
  // words written over two lines stay together, and the thought nobody assessed is not shown
  assert.match(article(html, second.n), /你说：「卡片阴影可以留一点，<br>但不要太重」/);
  assert.match(article(html, second.n), /存疑/);
  assert.ok(!html.includes('三卡布局我就要这样'));
  assert.equal(first.quote, '退出入口我想保持在一级，不要藏起来');
});

test('a thought the critic assessed with no words written down is refused, every missing one listed', () => {
  assert.throws(() => build({ thoughts: [{ id: '1', quote: '退出入口我想保持在一级' }] }), /no words from the human[\s\S]*: 2$/);
  assert.throws(() => build({ thoughts: [] }), /thoughts the critic assessed: 1, 2/);
  assert.throws(() => build({ thoughts: [{ id: '1', quote: '  ' }, { id: '2', quote: '有' }] }), /: 1$/);
  assert.throws(() => build({ thoughts: undefined }), /thoughts must be an array/);
});

test('thoughts.md is read one thought per line, with continuation lines, and a bad file is refused', () => {
  assert.deepEqual(parseThoughts('1 | 甲\n\n1.2 | 乙\n丙\n'), [{ id: '1', quote: '甲' }, { id: '1.2', quote: '乙\n丙' }]);
  assert.throws(() => parseThoughts('开头没有编号\n1 | 甲'), /line 1: expected/);
  assert.throws(() => parseThoughts('1 | 甲\n1 | 乙'), /thought 1 appears twice/);
});

test('score and note close the page', () => {
  const { html } = build();
  const score = html.match(/<section data-section="score">[\s\S]*?<\/section>/)[0];
  assert.match(score, /<strong>7<\/strong> \/ 10/);
  assert.match(score, /整体接近，退出入口的取舍要人定/);
});

test('text from the inputs is escaped', () => {
  const judge = fixtureJudge();
  judge.findings[0].detail = '<script>alert(1)</script> & "x"';
  const { html } = build({ judge });
  assert.ok(!html.includes('<script>alert(1)'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;/);
});

test('inputs that cannot make a sound report are refused with every problem named', () => {
  const unclassified = { ...fixtureDiff(), classified: false };
  assert.throws(() => build({ diff: unclassified }), /without a change set/);
  const r = fixtureResearch();
  r.uncovered = [];
  assert.throws(() => build({ research: r }), /opinion 4 has neither a research item nor an entry in research.uncovered/);
  const dup = fixtureResearch();
  dup.items[1].covers = [1, 2, 3];
  assert.throws(() => build({ research: dup }), /opinion 1 is covered by two research items/);
  const stray = fixtureResearch();
  stray.items[0].covers = [7];
  assert.throws(() => build({ research: stray }), /opinion 7, which the critic did not give/);
  assert.throws(() => build({ canvas: { current: 'not a url' } }), /canvas.current|Invalid URL/);
  const badJudge = fixtureJudge();
  badJudge.findings[0].kind = 'other';
  badJudge.score = 11;
  assert.throws(() => build({ judge: badJudge }), /kind must be one of[\s\S]*score must be an integer/);
});

test('a picture that cannot be read stops the report instead of leaving a hole', () => {
  assert.throws(() => build({ readImage: () => { throw new Error('ENOENT'); } }), /cannot read image .*ENOENT/);
  const research = fixtureResearch();
  research.items[0].path[0].images = ['shots/acme-1.svg'];
  assert.throws(() => build({ research, readImage: () => PIXEL }), /cannot inline/);
});

// ---- the command line ----

function runCli(files, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'design-review-report-'));
  const put = (name, value) => {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
    return p;
  };
  for (const n of ['acme-1', 'acme-2', 'acme-3']) put(`research/shots/${n}.jpg`, PIXEL);
  put('shots/quiz-exit--footer--before.png', PIXEL);
  const thoughtsFile = put('thoughts.md', files.thoughts ?? THOUGHTS_MD);
  put('shots/quiz-exit--footer--after.png', PIXEL);
  const diff = fixtureDiff();
  diff.undeclared[0].shots = { before: join(dir, 'shots/quiz-exit--footer--before.png'), after: join(dir, 'shots/quiz-exit--footer--after.png') };
  const paths = {
    judge: put('judge.json', files.judge ?? fixtureJudge()),
    research: put('research/research-light.json', files.research ?? fixtureResearch()),
    diff: put('diff.json', files.diff ?? diff),
    thoughts: thoughtsFile,
  };
  const out = join(dir, 'report.html');
  const result = spawnSync(process.execPath, [
    SCRIPT, '--judge', paths.judge, '--research', paths.research, '--diff', paths.diff, '--thoughts', paths.thoughts,
    '--canvas', CANVAS.current, '--previous', CANVAS.previous, '--out', out, ...extra,
  ], { encoding: 'utf8' });
  return { result, out };
}

test('the command line resolves the researcher\'s relative pictures and the area shots, writes one file and prints the short text', () => {
  const { result, out } = runCli({});
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(out, 'utf8');
  const sources = [...html.matchAll(/<img [^>]*src="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(sources.length, 5);
  assert.ok(sources.every((s) => s.startsWith('data:image/')));
  assert.match(result.stdout, /7 分/);
  assert.match(result.stdout, /没声明却变了的地方 2 处/);
});

test('the command line exits 2 with the problem when an input is unsound, and 1 when called wrong', () => {
  const research = fixtureResearch();
  research.items[0].path[0].images = ['shots/missing.jpg'];
  const { result } = runCli({ research });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read image .*missing\.jpg/);
  const noThoughts = runCli({ thoughts: '2 | 只写了第二条' });
  assert.equal(noThoughts.result.status, 2);
  assert.match(noThoughts.result.stderr, /no words from the human[\s\S]*: 1/);
  const usage = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /usage: design-review-report\.mjs/);
});
