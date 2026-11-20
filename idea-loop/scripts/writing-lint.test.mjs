import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, RULES, mergeConfig } from './writing-lint.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'writing-lint.mjs');

/** Run the CLI the way the rewrite loop would. */
function lint(args, cwd) {
  const r = spawnSync('node', [script, ...args], { encoding: 'utf8', cwd });
  let report = null;
  try { report = JSON.parse(r.stdout); } catch { /* usage errors print no JSON */ }
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, report };
}

const dir = () => mkdtempSync(join(tmpdir(), 'writing-lint-'));
const put = (d, name, text) => { const p = join(d, name); writeFileSync(p, text); return p; };

// ── Fixture articles: a clean base per language, and one change per rule ─────────────────────

const FRONT = {
  en: ({ extra = '', faq = 'Most of the recipes here take about twenty minutes from start to table, including the time you spend chopping, washing the vegetables and cleaning up the stove afterwards.' } = {}) => `---
title: Weeknight dinners
excerpt: Quick meals for busy evenings.
cover: /img/cover.png
faqs:
  - q: How long does it take?
    a: "${faq}"
${extra}---
`,
  zh: ({ extra = '', faq = '这里大多数菜谱从开火到上桌大约二十分钟，包括你切菜、洗菜和收拾灶台所花的时间，所以下班回家之后也完全来得及动手做一顿热饭。' } = {}) => `---
title: 工作日晚餐
excerpt: 忙碌的晚上也能吃好。
cover: /img/cover.png
faqs:
  - q: 要花多久？
    a: "${faq}"
${extra}---
`,
};
const BODY = {
  en: '\n## Planning\n\nPick three recipes on Sunday. Shop once.\n\n## Cooking\n\nStart the rice first. The rest fits in the same time.\n',
  zh: '\n## 计划\n\n周日挑三道菜。一次买齐。\n\n## 烹饪\n\n先煮饭。其余的菜刚好同时做完。\n',
};
const NAME = { en: 'post.en.md', zh: 'post.zh-CN.md' };

/** A clean article, with `add` appended to the body (after the last paragraph). */
const article = (lang, { add = '', front = {} } = {}) => FRONT[lang](front) + BODY[lang] + (add ? `\n${add}\n` : '');

/** The 1-based line of the first line that contains `needle`. */
const lineOf = (text, needle) => {
  const i = text.split('\n').findIndex((l) => l.includes(needle));
  assert.ok(i >= 0, `fixture has no line with "${needle}"`);
  return i + 1;
};

/** Lint one article; return the findings of one rule. */
function findings(rule, text, lang, { config } = {}) {
  const d = dir();
  const file = put(d, NAME[lang], text);
  const args = [file];
  if (config) args.unshift(`--config=${put(d, 'lint.json', JSON.stringify(config))}`);
  const { report } = lint(args);
  return report.rules[rule] ?? [];
}

// A run of paragraphs long enough to pass the visual-break limit, with no commas or transitions.
const longProse = {
  en: Array.from({ length: 8 }, (_, i) => `Cook the dish number ${i} on the stove for a while. Then let it rest in the pan for a while. Serve it on a warm plate with some fresh herbs.`).join('\n\n'),
  zh: Array.from({ length: 8 }, (_, i) => `第${i}道菜要在炉子上煮一会儿，再放在锅里静置一会儿。装盘的时候撒上一点新鲜的香草。再配上一碗热汤端上桌。`.replace('，', '')).join('\n\n'),
};
const withBreak = (prose) => { const [a, b, c, d2, ...rest] = prose.split('\n\n'); return [a, b, c, d2, '- a list item', ...rest].join('\n\n'); };

/**
 * One row per rule. `bad` is the body text that breaks it, `good` the fixed version of the same text;
 * `needle` finds the line the finding must point at. A row may change the frontmatter with `front`.
 */
const CASES = {
  'para-sentences': {
    en: { bad: 'Chop the onions. Heat the pan. Add the oil. Stir the rice. Serve it warm.', good: 'Chop the onions. Heat the pan. Add the oil. Stir the rice.', needle: 'Chop the onions' },
    zh: { bad: '先切洋葱。再热锅。然后倒油。接着翻炒米饭。最后装盘端上桌。', good: '先切洋葱。再热锅。然后倒油。接着翻炒米饭。', needle: '先切洋葱' },
  },
  'visual-break': {
    en: { bad: longProse.en, good: withBreak(longProse.en), needle: 'dish number 7' },
    zh: { bad: longProse.zh, good: withBreak(longProse.zh), needle: '第7道菜' },
  },
  'bullet-long': {
    en: { bad: `- ${'A very long list item that keeps going '.repeat(7)}`, good: '- A short list item', needle: 'A very long list item' },
    zh: { bad: `- ${'这是一条一直写下去而且没有尽头的很长的列表项'.repeat(6)}`, good: '- 一条很短的列表项', needle: '这是一条一直写下去' },
  },
  'transition-density': {
    en: { bad: 'However, the pan is hot. Therefore the oil burns, thus we stop.', good: 'However, the pan is hot. We stop.', needle: 'However, the pan' },
    zh: { bad: '然而锅很烫。因此油烧焦了，从而我们停火。', good: '然而锅很烫。我们停火。', needle: '然而锅很烫' },
  },
  'dash-density': {
    en: { bad: 'The pan — still hot — waits on the stove — ready.', good: 'The pan, still hot, waits on the stove, ready.', needle: 'The pan —' },
    zh: { bad: '锅——还烫着——放在灶上——准备好了。', good: '锅还烫着，放在灶上，准备好了。', needle: '锅——' },
  },
  'comma-chain': {
    en: { bad: 'She chopped the onions, then heated the pan, then added the oil, then stirred the rice, then served it.', good: 'She chopped the onions, then heated the pan. She added the oil, then stirred the rice, then served it.', needle: 'She chopped' },
    zh: { bad: '她把洋葱切成了细细的小丁，然后把平底锅放在火上烧热，然后往锅里倒入了一勺橄榄油，然后把煮好的米饭倒进去翻炒，最后装盘端上了桌。', good: '她把洋葱切成了细细的小丁，然后把平底锅放在火上烧热。她往锅里倒入了一勺橄榄油，然后把煮好的米饭倒进去翻炒。', needle: '她把洋葱' },
  },
  'faq-thin': {
    en: { front: { faq: 'About twenty minutes.' }, good: {}, needle: 'About twenty minutes.' },
    zh: { front: { faq: '大约二十分钟。' }, good: {}, needle: '大约二十分钟。' },
  },
  'ai-slop': {
    en: { bad: 'Furthermore, the rice is ready.', good: 'The rice is ready.', needle: 'Furthermore' },
    zh: { bad: '此外，饭已经好了。', good: '饭已经好了。', needle: '此外' },
  },
  'colon-opener': {
    en: { bad: 'So: the rice is ready.', good: 'The rice is ready.', needle: 'So: the rice' },
    zh: { bad: '所以：饭好了。', good: '饭好了。', needle: '所以：' },
  },
  'stray-italic': {
    en: { bad: 'Wash the *rice* twice.', good: 'Wash the **rice** twice.', needle: 'Wash the *rice*' },
    zh: { bad: '把*米饭*洗两遍。', good: '把**米饭**洗两遍。', needle: '把*米饭*' },
  },
  'image-caption': {
    en: { bad: '![A bowl of rice](/img/rice.png)', good: '![A bowl of rice](/img/rice.png "Steamed rice, ready in twenty minutes")', needle: '![A bowl of rice]' },
    zh: { bad: '![一碗米饭](/img/rice.png)', good: '![一碗米饭](/img/rice.png "二十分钟煮好的米饭")', needle: '![一碗米饭]' },
  },
  'required-fields': {
    en: { front: { drop: 'excerpt' }, good: {}, needle: '---' },
    zh: { front: { drop: 'excerpt' }, good: {}, needle: '---' },
  },
  'image-field': {
    en: { front: { drop: 'cover' }, good: {}, needle: '---' },
    zh: { front: { drop: 'cover' }, good: {}, needle: '---' },
  },
  'faqs-field': {
    en: { front: { dropFaqs: true }, good: {}, needle: '---' },
    zh: { front: { dropFaqs: true }, good: {}, needle: '---' },
  },
  'table-div-align': {
    en: { bad: '| Meal | Time |\n| :--- | :--- |\n| <div style="text-align:center">Stew</div> | 40 |', good: '| Meal | Time |\n| :--- | :---: |\n| Stew | 40 |', needle: '<div style' },
    zh: { bad: '| 菜 | 时间 |\n| :--- | :--- |\n| <div style="text-align:center">炖菜</div> | 40 |', good: '| 菜 | 时间 |\n| :--- | :---: |\n| 炖菜 | 40 |', needle: '<div style' },
  },
  'tilde-number': {
    en: { bad: 'It takes ~20 minutes.', good: 'It takes about 20 minutes.', needle: '~20' },
    zh: { bad: '大约要 ~20 分钟。', good: '大约要 20 分钟。', needle: '~20' },
  },
  'numeric-range-hyphen': {
    en: { bad: 'Cook it for 15-20 minutes.', good: 'Cook it for 15–20 minutes.', needle: '15-20' },
    zh: { bad: '煮 15-20 分钟。', good: '煮 15–20 分钟。', needle: '15-20' },
  },
};

/** Apply a frontmatter change spec to a clean front matter string. */
function front(lang, spec = {}) {
  let t = FRONT[lang]({ faq: spec.faq });
  if (spec.drop) t = t.replace(new RegExp(`^${spec.drop}:.*\\n`, 'm'), '');
  if (spec.dropFaqs) t = t.replace(/^faqs:\n(?:\s+.*\n)+/m, '');
  return t;
}
const build = (lang, c, which) => {
  if (c.front) return front(lang, which === 'bad' ? c.front : c.good) + BODY[lang];
  return article(lang, { add: c[which] });
};

test('the clean base article of each language reports nothing', () => {
  for (const lang of ['en', 'zh']) {
    const d = dir();
    const r = lint([put(d, NAME[lang], article(lang))]);
    assert.equal(r.status, 0, JSON.stringify(r.report));
    assert.equal(r.report.clean, true);
    assert.deepEqual(r.report.rules, {});
  }
});

test('every rule in the list has a fixture case', () => {
  const parity = 'locale-parity';
  assert.deepEqual([...Object.keys(CASES), parity].sort(), [...RULES].sort());
  assert.equal(RULES.length, 18);
});

for (const [rule, byLang] of Object.entries(CASES)) {
  for (const lang of ['en', 'zh']) {
    const c = byLang[lang];
    test(`${rule} (${lang}): the violating article is reported on the right line, the fixed one is not`, () => {
      const bad = build(lang, c, 'bad');
      const hits = findings(rule, bad, lang);
      assert.ok(hits.length >= 1, `${rule} not reported`);
      const expected = lineOf(bad, c.needle);
      assert.ok(hits.some((h) => h.line === expected), `${rule}: lines ${hits.map((h) => h.line)} do not include ${expected}`);
      assert.deepEqual(findings(rule, build(lang, c, 'good'), lang), []);
    });
  }
}

for (const [rule, byLang] of Object.entries(CASES)) {
  test(`${rule}: with the rule switched off the violating articles report nothing for it (the fixtures exercise this rule)`, () => {
    for (const lang of ['en', 'zh']) {
      const bad = build(lang, byLang[lang], 'bad');
      assert.ok(findings(rule, bad, lang).length >= 1);
      assert.deepEqual(findings(rule, bad, lang, { config: { disableRules: [rule] } }), []);
    }
  });
}

test('image-caption also catches a caption that repeats the alt text and one that is only a label', () => {
  for (const [lang, alt, label] of [['en', 'A bowl of rice', 'Figure 2:'], ['zh', '一碗米饭', '图 2：']]) {
    const same = article(lang, { add: `![${alt}](/img/rice.png "${alt}")` });
    const hit = findings('image-caption', same, lang);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].line, lineOf(same, `![${alt}]`));
    const only = article(lang, { add: `![${alt}](/img/rice.png "${label}")` });
    assert.equal(findings('image-caption', only, lang).length, 1);
  }
});

test('a hand-written <img> is checked through the configured caption attribute', () => {
  const html = (attr) => article('en', { add: `<img src="/img/rice.png" alt="A bowl of rice" ${attr}="Steamed rice, ready in twenty minutes" />` });
  assert.equal(findings('image-caption', html('title'), 'en').length, 0);
  assert.equal(findings('image-caption', html('data-caption'), 'en').length, 1);
  assert.equal(findings('image-caption', html('data-caption'), 'en', { config: { fields: { captionAttribute: 'data-caption' } } }).length, 0);
});

test('stray-italic leaves the first blockquote, a whole-paragraph footnote and a link label alone', () => {
  const quote = article('en', { add: '> *In short:* twenty minutes.' });
  assert.equal(findings('stray-italic', quote, 'en').length, 0);
  const second = article('en', { add: '> *In short:* twenty minutes.\n\n> *Another:* note.' });
  assert.equal(findings('stray-italic', second, 'en').length, 1);
  assert.equal(findings('stray-italic', quote, 'en', { config: { italic: { exemptFirstBlockquote: false } } }).length, 1);
  assert.equal(findings('stray-italic', article('en', { add: '*All figures are rounded to the nearest minute.*' }), 'en').length, 0);
  assert.equal(findings('stray-italic', article('en', { add: 'See [the *Cookbook* index](/index).' }), 'en').length, 0);
});

test('comma-chain ignores commas inside parentheses and short enumerations', () => {
  const d = 'Pack the bag (pans, plates, forks, knives, spoons) and go. Bring salt, pepper, oil, garlic, onions and rice.';
  assert.equal(findings('comma-chain', article('en', { add: d }), 'en').length, 0);
});

// ── The article the spec's functional test describes ──────────────────────────────────────────

const SPEC_ARTICLE = `---
title: Weeknight dinners
excerpt: Quick meals for busy evenings.
cover: /img/cover.png
faqs:
  - q: How long does it take?
    a: "Most of the recipes here take about twenty minutes from start to table, including the time you spend chopping, washing the vegetables and cleaning up the stove afterwards."
---

## Planning

Pick three recipes on Sunday. Shop once.

## Cooking

Chop the onions. Heat the pan. Add the oil. Stir the rice. Serve it warm.

She chopped the onions, then heated the pan, then added the oil, then stirred the rice, then served it.

![A bowl of rice](/img/rice.png)
`;

test('one article with a 5-sentence paragraph, a 4-comma sentence and an image with no caption: three rules, once each, right lines', () => {
  const d = dir();
  const file = put(d, 'post.en.md', SPEC_ARTICLE);
  const { status, report } = lint([file]);
  assert.equal(status, 1);
  assert.deepEqual(Object.keys(report.rules).sort(), ['comma-chain', 'image-caption', 'para-sentences']);
  for (const [rule, needle] of [['para-sentences', 'Chop the onions.'], ['comma-chain', 'She chopped'], ['image-caption', '![A bowl of rice]']]) {
    assert.equal(report.rules[rule].length, 1, rule);
    assert.equal(report.rules[rule][0].line, lineOf(SPEC_ARTICLE, needle), rule);
    assert.equal(report.rules[rule][0].file, file);
  }
  assert.equal(report.total, 3);
});

test('with the sentence limit raised to 5 in the config, the sentence rule no longer reports', () => {
  const d = dir();
  const file = put(d, 'post.en.md', SPEC_ARTICLE);
  const cfg = put(d, 'lint.json', JSON.stringify({ thresholds: { maxSentencesPerParagraph: 5 } }));
  const { report } = lint([`--config=${cfg}`, file]);
  assert.deepEqual(Object.keys(report.rules).sort(), ['comma-chain', 'image-caption']);
});

// ── Config ────────────────────────────────────────────────────────────────────────────────────

test('config: a threshold you write takes effect, and the ones you leave out keep the default', () => {
  const text = article('en', { add: 'Chop the onions. Heat the pan. Add the oil. Stir the rice. Serve it warm.\n\nIt takes ~20 minutes.' });
  const cfg = { thresholds: { maxSentencesPerParagraph: 5 } };
  assert.equal(findings('para-sentences', text, 'en').length, 1);
  assert.equal(findings('para-sentences', text, 'en', { config: cfg }).length, 0);
  assert.equal(findings('tilde-number', text, 'en', { config: cfg }).length, 1);
  const tight = { thresholds: { maxSentencesPerParagraph: 1 } };
  assert.equal(findings('para-sentences', article('en'), 'en', { config: tight }).length, 2);
});

test('config: a nested threshold overrides one language and keeps the other', () => {
  const text = article('zh', { add: '很长的列表项'.repeat(1) });
  assert.doesNotThrow(() => mergeConfig({ thresholds: { faqMinWords: { en: 5 } } }));
  const m = mergeConfig({ thresholds: { faqMinWords: { en: 5 } } });
  assert.deepEqual(m.thresholds.faqMinWords, { en: 5, zh: 40 });
  assert.equal(findings('faq-thin', FRONT.zh({ faq: '大约二十分钟。' }) + BODY.zh, 'zh', { config: { thresholds: { faqMinWords: { en: 5 } } } }).length, 1);
  assert.ok(text);
});

test('config: a word list replaces the default list for that language only', () => {
  const text = (lang, w) => article(lang, { add: w });
  const cfg = { wordlists: { aiSlop: { en: ['lorem ipsum'] } } };
  assert.equal(findings('ai-slop', text('en', 'Furthermore, the rice is ready.'), 'en', { config: cfg }).length, 0);
  assert.equal(findings('ai-slop', text('en', 'Lorem  ipsum, the rice is ready.'), 'en', { config: cfg }).length, 1);
  assert.equal(findings('ai-slop', text('zh', '此外，饭已经好了。'), 'zh', { config: cfg }).length, 1);
  assert.equal(findings('ai-slop', text('en', 'Furthermore, the rice is ready.'), 'en', { config: { wordlists: { aiSlop: { en: [] } } } }).length, 0);
  const colon = { wordlists: { colonOpeners: { en: ['verdict'] } } };
  assert.equal(findings('colon-opener', text('en', 'Verdict: the rice is ready.'), 'en', { config: colon }).length, 1);
  assert.equal(findings('colon-opener', text('en', 'So: the rice is ready.'), 'en', { config: colon }).length, 0);
});

test('config: frontmatter field names are the ones you configure', () => {
  const custom = `---
title: Weeknight dinners
summary: Quick meals for busy evenings.
heroImage: /img/cover.png
questions:
  - q: How long does it take?
    reply: "About twenty minutes."
---
${BODY.en}`;
  const cfg = { fields: { required: ['title', 'summary'], image: ['heroImage'], faqs: 'questions', faqAnswer: 'reply' } };
  assert.equal(findings('required-fields', custom, 'en').length, 1); // default wants `excerpt:`
  assert.equal(findings('image-field', custom, 'en').length, 1);
  assert.equal(findings('faqs-field', custom, 'en').length, 1);
  for (const rule of ['required-fields', 'image-field', 'faqs-field']) assert.equal(findings(rule, custom, 'en', { config: cfg }).length, 0, rule);
  assert.equal(findings('faq-thin', custom, 'en').length, 0); // default key `a:` is not there
  assert.equal(findings('faq-thin', custom, 'en', { config: cfg }).length, 1);
});

test('config: disableRules switches a rule off', () => {
  const text = article('en', { add: 'It takes ~20 minutes.' });
  assert.equal(findings('tilde-number', text, 'en').length, 1);
  assert.equal(findings('tilde-number', text, 'en', { config: { disableRules: ['tilde-number'] } }).length, 0);
});

test('config: an unknown key, a wrong type or an unknown rule name is an error (exit 2), not a silent pass', () => {
  const d = dir();
  const file = put(d, NAME.en, article('en'));
  for (const bad of [{ thresholds: { maxSentencesPerParagrah: 5 } }, { thresholds: { maxBulletWidth: 'wide' } }, { disableRules: ['no-such-rule'] }, { extra: 1 }, { wordlists: { aiSlop: { en: 'furthermore' } } }]) {
    const r = lint([`--config=${put(d, 'bad.json', JSON.stringify(bad))}`, file]);
    assert.equal(r.status, 2, JSON.stringify(bad));
    assert.match(r.stderr, /config/);
    assert.equal(r.stdout, '');
  }
  put(d, 'broken.json', '{ nope');
  assert.equal(lint([`--config=${join(d, 'broken.json')}`, file]).status, 2);
  assert.equal(lint([`--config=${join(d, 'missing.json')}`, file]).status, 2);
});

test('the defaults are the documented ones', () => {
  assert.equal(DEFAULT_CONFIG.thresholds.maxSentencesPerParagraph, 4);
  assert.equal(DEFAULT_CONFIG.thresholds.maxTransitionsPerSentence, 1);
  assert.equal(DEFAULT_CONFIG.thresholds.maxCommasPerSentence, 3);
  assert.equal(DEFAULT_CONFIG.thresholds.maxDashPer100Words, 1);
  assert.ok(DEFAULT_CONFIG.wordlists.aiSlop.en.length > 0 && DEFAULT_CONFIG.wordlists.aiSlop.zh.length > 0);
});

// ── EN / ZH structure parity ──────────────────────────────────────────────────────────────────

const pair = (d, en, zh, names = ['post.en.md', 'post.zh-CN.md']) => [put(d, names[0], en), put(d, names[1], zh)];

test('locale-parity: a pair whose H2 counts differ is reported, a matching pair is not', () => {
  const d = dir();
  const extra = '\n## Storing\n\nKeep leftovers in a jar.\n';
  const [en] = pair(d, article('en') + extra, article('zh'));
  const { report, status } = lint([en, join(d, 'post.zh-CN.md')]);
  assert.equal(status, 1);
  assert.deepEqual(Object.keys(report.rules), ['locale-parity']);
  assert.equal(report.rules['locale-parity'].length, 1);
  assert.match(report.rules['locale-parity'][0].message, /h2: en=3 zh-CN=2/);
  assert.equal(report.rules['locale-parity'][0].file, en);

  const e = dir();
  pair(e, article('en'), article('zh'));
  assert.deepEqual(lint([join(e, 'post.en.md'), join(e, 'post.zh-CN.md')]).report.rules, {});
});

test('locale-parity: linting only one file still compares it with its sibling on disk', () => {
  const d = dir();
  pair(d, article('en') + '\n## Storing\n\nKeep leftovers in a jar.\n', article('zh'));
  const one = lint([join(d, 'post.zh-CN.md')]).report;
  assert.equal(one.rules['locale-parity'].length, 1);
});

test('locale-parity: a missing language version is ignored by default and an error with requireBoth', () => {
  const e = dir();
  const only = put(e, 'solo.en.md', article('en'));
  assert.deepEqual(lint([only]).report.rules, {});
  const cfg = put(e, 'lint.json', JSON.stringify({ localePair: { requireBoth: true } }));
  const lone = lint([`--config=${cfg}`, only]).report.rules['locale-parity'];
  assert.equal(lone.length, 1);
  assert.equal(lone[0].severity, 'error');
  assert.match(lone[0].message, /missing/);
  assert.equal(lint([`--config=${cfg}`, ...pair(dir(), article('en'), article('zh'))]).status, 0);
});

test('locale-parity: the locale pair is the one the config names, and .mdx files count', () => {
  const d = dir();
  put(d, 'post.en-US.md', article('en') + '\n## Storing\n\nKeep leftovers in a jar.\n');
  put(d, 'post.zh-TW.mdx', article('zh'));
  const cfg = put(d, 'lint.json', JSON.stringify({ localePair: { en: 'en-US', zh: 'zh-TW' } }));
  const r = lint([`--config=${cfg}`, join(d, 'post.en-US.md'), join(d, 'post.zh-TW.mdx')]);
  assert.equal(r.report.rules['locale-parity'].length, 1);
  assert.match(r.report.rules['locale-parity'][0].message, /en-US=3 zh-TW=2/);
});

// ── CLI contract ──────────────────────────────────────────────────────────────────────────────

test('output shape, exit codes, a directory argument, --lang and --format=text', () => {
  const d = dir();
  put(d, 'a.en.md', article('en', { add: 'It takes ~20 minutes.' }));
  put(d, 'b.en.md', article('en'));
  put(d, 'notes.txt', 'not an article');
  const r = lint([d]);
  assert.equal(r.status, 1);
  assert.equal(r.report.clean, false);
  assert.deepEqual(r.report.files.map((f) => f.replace(d + '/', '')), ['a.en.md', 'b.en.md']);
  assert.equal(r.report.total, 1);
  assert.deepEqual(r.report.bySeverity, { error: 0, warn: 0, note: 1 });
  const [hit] = r.report.rules['tilde-number'];
  assert.deepEqual(Object.keys(hit).sort(), ['file', 'line', 'message', 'severity']);
  assert.equal(typeof hit.line, 'number');

  const text = spawnSync('node', [script, '--format=text', join(d, 'a.en.md')], { encoding: 'utf8' });
  assert.equal(text.status, 1);
  assert.match(text.stdout, /^tilde-number \(1\)\n {2}.*a\.en\.md:\d+ \[note\] /);

  // The language comes from the file name; `--lang` overrides it.
  const named = put(d, 'plain.md', article('zh', { add: '大约要 ~20 分钟。' }));
  assert.equal(lint([named]).report.rules['tilde-number'].length, 1); // detected from the text
  const forced = put(d, 'forced.en.md', article('zh', { add: '此外，饭好了。' }));
  assert.equal(lint([forced]).report.rules['ai-slop'], undefined);
  assert.equal(lint(['--lang=zh', forced]).report.rules['ai-slop'].length, 1);

  assert.equal(lint([]).status, 2);
  assert.equal(lint([join(d, 'nope.md')]).status, 2);
  assert.equal(lint(['--lang=fr', named]).status, 2);
});

test('the header comment documents the usage, the output shape, the exit codes and every rule', () => {
  const head = readFileSync(script, 'utf8').split('*/')[0];
  for (const needle of ['Usage:', 'Output', 'Exit:', '"rules"', '"line"', '--config']) assert.ok(head.includes(needle), needle);
  for (const rule of RULES) assert.ok(head.includes(rule), `header does not describe ${rule}`);
  for (const key of ['thresholds', 'wordlists', 'fields', 'localePair', 'disableRules']) assert.ok(head.includes(`"${key}"`), key);
});

test('the script and its fixtures carry no project names (the leak test does not scan scripts/)', () => {
  const here = dirname(script);
  const text = ['writing-lint.mjs', 'writing-lint.test.mjs'].map((f) => readFileSync(join(here, f), 'utf8')).join('\n');
  const tells = [/toeflair|tofelair|\btoefl\b/i, /okara/i, /备考|错题|听力/, /\bETS\b/, /marketing\/src/];
  for (const re of tells) assert.doesNotMatch(text.replace(/tells = \[[^\n]*\]/, ''), re, String(re));
});
