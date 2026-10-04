import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGlossary, countSentences, avoidWords } from './glossary-check.mjs';

/** A well-formed glossary; every test starts from this and bends one thing. */
const GOOD = `# Toeflair

TOEFL 备考平台，学生做题、拿分析报告。

## 术语

### 学生应用

**Practice**：
学生可以做的一条练习，属于四种题型之一。
_Avoid_: exercise, drill

**Speaking band**：
口语题统一用的分数量纲，1–6、0.5 步进。
_Avoid_: legacy score（迁移前的旧量纲）

**Cause layer**：
一个错词被归到的错误发生位置。
三层之一：发音、听力、表达。
_Avoid_: error type, category（Issue 上另有一个也叫 category 的分类）

## 歧义词

- **status**：代码里有至少六套互不相关的 status。单独说不成立，必须带上实体名。
`;

const bend = (from, to) => GOOD.replace(from, to);
const errs = (md) => checkGlossary(md).errors;
const has = (md, re) => errs(md).some((e) => re.test(e));

test('a well-formed glossary is valid and its terms are parsed', () => {
  const r = checkGlossary(GOOD);
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid, true);
  assert.deepEqual(
    r.terms.map((t) => t.name),
    ['Practice', 'Speaking band', 'Cause layer'],
  );
  assert.deepEqual(r.terms[0].avoid, ['exercise', 'drill']);
  assert.deepEqual(r.ambiguous, [{ word: 'status', line: 24 }]);
});

test('the 歧义词 section is optional', () => {
  assert.equal(checkGlossary(GOOD.split('## 歧义词')[0]).valid, true);
});

// --- sentence counting: the rule most of the content checks lean on ---

test('decimals and version numbers do not split sentences', () => {
  assert.equal(countSentences('1–6、0.5 步进，v2.0 起生效。'), 1);
  assert.equal(countSentences('一句。两句！三句？'), 3);
  assert.equal(countSentences('One. Two. Three'), 3);
  assert.equal(countSentences('没有句号也算一句'), 1);
});

test('avoid lists split on any separator and drop parentheticals', () => {
  assert.deepEqual(avoidWords('a, b，c、d（说明，带逗号）'), ['a', 'b', 'c', 'd']);
});

// --- forbidden shapes ---

for (const [name, line, re] of [
  ['backticks', '学生的一次提交，存在 `recordings` 表。', /反引号/],
  ['links', '见 [domain](docs/domain/x.md)。', /链接/],
  ['bare URLs', '见 https://example.com。', /链接/],
  ['file paths', '以 backend/app/scoring.py 为准。', /文件路径/],
  ['relative paths', '见 ./docs 下的说明。', /文件路径/],
  ['value mappings', '四种之一：2=listen_repeat、3=interview。', /取值映射/],
]) {
  test(`${name} in a definition are refused`, () => {
    assert.ok(has(bend('学生可以做的一条练习，属于四种题型之一。', line), re));
  });
}

test('a slash between words is not a path', () => {
  assert.equal(checkGlossary(bend('属于四种题型之一。', '属于听/说/读/写四种之一。')).valid, true);
});

// --- structure ---

test('missing H1 is reported', () => {
  assert.ok(has(GOOD.replace('# Toeflair\n', ''), /缺一级标题/));
});

test('a second H1 is reported', () => {
  assert.ok(has(GOOD + '\n# Another\n', /一级标题只能有一个/));
});

test('content before the H1 is reported', () => {
  assert.ok(has('> note\n\n' + GOOD, /一级标题之前不能有内容/));
});

test('the description must exist and stay within two sentences', () => {
  assert.ok(has(bend('TOEFL 备考平台，学生做题、拿分析报告。', ''), /缺一到两句描述/));
  assert.ok(has(bend('TOEFL 备考平台，学生做题、拿分析报告。', '一。二。三。'), /描述超过 2 句/));
});

test('an H2 outside the closed set is reported by name', () => {
  assert.ok(has(GOOD + '\n## Flagged ambiguities\n', /不能是「Flagged ambiguities」/));
});

test('a missing 术语 section is reported', () => {
  assert.ok(has(bend('## 术语', '## Language'), /缺「## 术语」/));
});

test('歧义词 before 术语 is out of order', () => {
  const md = '# T\n\n描述。\n\n## 歧义词\n\n- **status**：说明。\n\n## 术语\n\n**A**：\n定义。\n';
  assert.ok(has(md, /顺序不对/));
});

test('H4 and deeper are refused', () => {
  assert.ok(has(bend('### 学生应用', '#### 学生应用'), /不允许 #### 级标题/));
});

// --- term entries ---

test('a definition over two sentences is refused', () => {
  assert.ok(has(bend('学生可以做的一条练习，属于四种题型之一。', '一。二。三。'), /「Practice」的定义超过 2 句/));
});

test('a definition wrapped across lines is joined before counting', () => {
  const r = checkGlossary(GOOD);
  assert.equal(r.terms[2].definition, '一个错词被归到的错误发生位置。 三层之一：发音、听力、表达。');
});

test('an empty definition is refused', () => {
  assert.ok(has(bend('学生可以做的一条练习，属于四种题型之一。\n', ''), /「Practice」缺定义/));
});

test('anything after _Avoid_ is extra content', () => {
  assert.ok(has(bend('_Avoid_: exercise, drill', '_Avoid_: exercise, drill\n多写的一段机制说明。'), /多余内容/));
});

test('a paragraph after a blank line inside an entry is extra content', () => {
  assert.ok(has(bend('属于四种题型之一。\n', '属于四种题型之一。\n\n另起一段。\n'), /多余内容/));
});

test('a stray line under 术语 that belongs to no entry is refused', () => {
  assert.ok(has(bend('### 学生应用\n', '### 学生应用\n\n这一组讲学生侧。\n'), /不属于任何词条/));
});

test('two _Avoid_ lines and an empty _Avoid_ are refused', () => {
  assert.ok(has(bend('_Avoid_: exercise, drill', '_Avoid_: exercise\n_Avoid_: drill'), /两行 _Avoid_/));
  assert.ok(has(bend('_Avoid_: exercise, drill', '_Avoid_:'), /_Avoid_ 是空的/));
});

test('duplicate term names are refused, case-insensitively', () => {
  assert.ok(has(GOOD.replace('## 歧义词', '**practice**：\n重复。\n\n## 歧义词'), /「practice」重复/));
});

test('a word cannot be both a term and someone else’s _Avoid_', () => {
  assert.ok(has(bend('_Avoid_: exercise, drill', '_Avoid_: exercise, Speaking band'), /既是标准叫法又被弃用/));
});

// --- ambiguous words ---

test('ambiguous items must be "- **word**：..." list items', () => {
  assert.ok(has(bend('- **status**：', '- **"status" 单独出现** —— '), /只放列表项/));
});

test('an indented continuation line belongs to the item above', () => {
  const md = bend('单独说不成立，必须带上实体名。', '\n  单独说不成立。');
  assert.equal(checkGlossary(md).valid, true);
});

test('ambiguous items over two sentences or duplicated are refused', () => {
  assert.ok(has(bend('单独说不成立，必须带上实体名。', '二。三。'), /「status」的说明超过 2 句/));
  assert.ok(has(GOOD + '- **Status**：又一条。\n', /「Status」重复/));
});
