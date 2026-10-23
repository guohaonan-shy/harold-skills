import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveBody, archiveMarker, localFigures, nextRound, parseLoop, toArchive, unsettled, withAuthorship, withFigureUrls } from './review-loop.mjs';

const loop = `# PR #12 的 review loop

<!-- idea-loop-entry {"kind":"pause","round":1} -->
## 第 1 次停下 · 落地 3 张，等你决定 1 件
…汇报…

### 你的批示（2026-10-13 09:10）
> 03 选 A

### 做了什么
- 03 的决定写回工单，03 和 05 继续（提交链接）

<!-- idea-loop-entry {"kind":"review","round":1} -->
## Review 第 1 轮
…结论…

### 你的批示（2026-10-13 14:02）
> S1 接受，C1 修

### 做了什么
- S1 写回 spec；C1 已修

### 你的批示（2026-10-13 15:30）
> C1 的回归测试补一下
`;

test('entries come out in order with their kind, round and body', () => {
  const e = parseLoop(loop);
  assert.deepEqual(e.map((x) => [x.kind, x.round, x.rulings]), [['pause', 1, 1], ['review', 1, 2]]);
  assert.match(e[0].body, /^## 第 1 次停下/);
  assert.doesNotMatch(e[0].body, /review loop/); // the title is not part of an entry
});

test('an entry is settled only when its latest ruling has been acted on', () => {
  const e = parseLoop(loop);
  assert.deepEqual(e.map((x) => x.settled), [true, false]);
  assert.deepEqual(unsettled(e), [{ kind: 'review', round: 1 }]);
  assert.equal(parseLoop('<!-- idea-loop-entry {"kind":"review","round":2} -->\n## Review 第 2 轮')[0].settled, false); // no ruling yet
});

test('the next round counts per kind, starting at 1 for an empty file', () => {
  const e = parseLoop(loop);
  assert.equal(nextRound(e, 'review'), 2);
  assert.equal(nextRound(e, 'pause'), 2);
  assert.equal(nextRound(parseLoop(''), 'review'), 1);
});

test('a malformed marker is an error, not a silently dropped entry', () => {
  assert.throws(() => parseLoop('<!-- idea-loop-entry {"kind":"note","round":1} -->'), /bad entry marker/);
});

test('archiving posts each entry once, labelled as a record, saying who posted it', () => {
  const e = parseLoop(loop);
  const already = [{ body: `${archiveMarker('pause', 1)}\n…` }, { body: '人写的评论' }];
  assert.deepEqual(toArchive(e, already).map((x) => [x.kind, x.round]), [['review', 1]]);
  const body = archiveBody(e[1], 'gh-login');
  assert.ok(body.startsWith(archiveMarker('review', 1)));
  assert.match(body, /由 Claude 代发/);
  assert.match(body, /review 第 1 轮在会话里进行/);
  assert.equal(withAuthorship('x', 'app'), 'x');
});

test('an entry too long for one GitHub comment is refused before it is sent', () => {
  assert.throws(() => archiveBody({ kind: 'review', round: 1, body: 'x'.repeat(70000) }, 'app'), /limit/);
});

const ruledOnly = `<!-- idea-loop-entry {"kind":"review","round":1} -->
## Review 第 1 轮
**结论**：Spec 0 条、Standards 1 条，都已按规则处理。

### 已按规则处理
- C1：补了缺的说明文字（依据：仓库的文案规定；提交链接）

### 做了什么
- C1 已修并推送（提交链接）
`;

test('a review round whose findings were all handled by rule, and says what was done, is settled without a ruling', () => {
  const [e] = parseLoop(ruledOnly);
  assert.deepEqual([e.rulings, e.settled], [0, true]);
  assert.deepEqual(unsettled([e]), []);
});

test('a review round that still asks the human something, or has not said what was done, is not settled without a ruling', () => {
  const asks = ruledOnly.replace('### 做了什么', '#### S1 · 标题\n**要你决定**：A，还是 B？\n\n### 做了什么');
  assert.equal(parseLoop(asks)[0].settled, false);
  assert.equal(parseLoop(ruledOnly.replace(/### 做了什么[\s\S]*$/, ''))[0].settled, false);
  // a stop report is not covered by this: its delivery items always wait for the human
  assert.equal(parseLoop(ruledOnly.replace('"kind":"review"', '"kind":"pause"'))[0].settled, false);
});

test('overturning a handled-by-rule item is one more ruling in the same entry, and re-opens it until it is acted on', () => {
  const overturned = `${ruledOnly}
### 你的批示（2026-10-19 16:00）
> 推翻 C1，这个不用改

`;
  const [e] = parseLoop(overturned);
  assert.deepEqual([e.rulings, e.settled], [1, false]);
  assert.match(e.body, /推翻 C1/);
  const [done] = parseLoop(`${overturned}### 做了什么\n- C1 改回去了（提交链接）\n`);
  assert.deepEqual([done.rulings, done.settled], [1, true]);
});

test('local figures are found and swapped for their uploaded addresses; web addresses are left alone', () => {
  const body = '![重试流程](../pr-review/12/evidence/r1-s1-flow.png)\n![旧图](https://example.com/a.png)\n![同一张](../pr-review/12/evidence/r1-s1-flow.png)';
  assert.deepEqual(localFigures(body), ['../pr-review/12/evidence/r1-s1-flow.png']);
  const out = withFigureUrls(body, { 'r1-s1-flow.png': 'https://github.com/a/b/blob/idea-loop-evidence-pr-12/r1-s1-flow.png?raw=true' });
  assert.equal(out.match(/raw=true/g).length, 2);
  assert.match(out, /example\.com/);
});

test('a nightly replay is a third kind of entry: numbered among replays, archived with its own label, and the old kinds read as before', () => {
  const withReplay = `${loop}
<!-- idea-loop-entry {"kind":"replay","round":1} -->
## 规则回放 第 1 次 · 1 个用例，1 个过

### 做了什么
- 全部用例都过
`;
  const e = parseLoop(withReplay);
  assert.deepEqual(e.map((x) => [x.kind, x.round, x.settled]), [['pause', 1, true], ['review', 1, false], ['replay', 1, true]]);
  assert.equal(nextRound(e, 'replay'), 2);
  assert.equal(nextRound(e, 'review'), 2, 'a replay does not use up a review round');
  assert.match(archiveBody(e[2], 'app'), /规则回放第 1 次在会话里进行/);
});
