/**
 * GLOSSARY.md lint — the format half of `references/glossary.md` §3, made falsifiable.
 *
 * The failure this guards against is the one upstream reports most: a glossary that slowly turns
 * into a spec. Field values, code constants, file paths and mechanism write-ups creep in one
 * reasonable-looking line at a time, and a model asked "is this implementation detail?" will
 * usually argue it isn't. So this file does not ask. It checks shapes that implementation detail
 * almost always leaves behind — a backtick, a path, a link, a `2=listen_repeat` mapping, a
 * definition that has grown past two sentences — and refuses them outright.
 *
 * It does not judge content: whether a term belongs (the three questions in §2), whether a
 * definition is right, whether it says what a thing IS rather than what it does. Those stay with
 * Harold.
 *
 * Runs in two places: the plugin's PostToolUse hook (glossary-check-hook.mjs) on every write to a
 * file named GLOSSARY.md, and the target repo's CI, which curls this file pinned to a commit sha.
 * That second use is why this file must stay SINGLE-FILE AND DEPENDENCY-FREE — no imports beyond
 * node built-ins, no sibling modules.
 *
 * Exit codes: 0 clean, 2 violations, 1 usage / unreadable file.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The only two H2 sections a glossary may have, in this order. 术语 is required. */
export const SECTIONS = ['术语', '歧义词'];

const MAX_SENTENCES = 2;

/**
 * Line-level patterns that implementation detail leaves behind. Checked on every line.
 * Each one is a shape, not a judgement — see the header.
 */
const FORBIDDEN = [
  { name: '反引号', re: /`/, why: '代码标识符属于代码或 AGENTS.md，不属于术语表' },
  { name: '链接', re: /\]\(|https?:\/\/|<[a-z]+:\/\//i, why: '术语表不链出去，其他文档反过来用它的叫法' },
  {
    name: '文件路径',
    re: /(?:^|[\s(（:：])\.{1,2}\/|\b[\w-]+\/[\w./-]*\.[a-z][a-z0-9]{0,4}\b/i,
    why: '路径会烂，也不是「它是什么」',
  },
  { name: '取值映射', re: /(?<![\w.])\d+\s*[=＝]\s*\S/, why: '字段取值、枚举编码进 AGENTS.md 的表结构那节' },
];

const H = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const TERM_HEAD = /^\*\*(.+?)\*\*\s*[：:]\s*$/;
const AVOID = /^_Avoid_\s*[：:]\s*(.*)$/;
const AMBIG_ITEM = /^[-*]\s+\*\*(.+?)\*\*\s*[：:]\s*(.*)$/;

/**
 * Count sentences. Terminators are 。！？!? and a period followed by whitespace or end of text —
 * so 0.5、v2.0 and e.g. a decimal band never split. Trailing text with no terminator counts.
 */
export function countSentences(text) {
  return String(text)
    .split(/[。！？!?]+|\.(?=\s|$)/)
    .map((s) => s.replace(/[\s)）"”'’]+/g, ''))
    .filter((s) => s.length > 0).length;
}

/** Split an _Avoid_ list into bare words: parentheticals dropped, separated by , ， 、 ; ； */
export function avoidWords(list) {
  return String(list)
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .split(/[,，、;；]/)
    .map((w) => w.trim())
    .filter(Boolean);
}

const norm = (s) => s.trim().toLowerCase();

/**
 * Check one GLOSSARY.md.
 *
 * @returns { valid, errors, terms, ambiguous }
 *   errors    — human-readable strings, each prefixed with its line number
 *   terms     — [{ name, line, definition, avoid: [word] }] in document order
 *   ambiguous — [{ word, line }]
 */
export function checkGlossary(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const errors = [];
  const at = (i, msg) => errors.push(`第 ${i + 1} 行：${msg}`);
  const terms = [];
  const ambiguous = [];

  // --- forbidden shapes, every line ---
  lines.forEach((line, i) => {
    for (const f of FORBIDDEN) {
      if (f.re.test(line)) at(i, `出现${f.name}——${f.why}`);
    }
  });

  // --- headings ---
  const heads = [];
  lines.forEach((line, i) => {
    const m = line.match(H);
    if (m) heads.push({ level: m[1].length, title: m[2].trim(), i });
  });

  const h1s = heads.filter((h) => h.level === 1);
  if (h1s.length === 0) errors.push('缺一级标题（# {上下文名}）');
  if (h1s.length > 1) at(h1s[1].i, `一级标题只能有一个，这里又出现「${h1s[1].title}」`);

  const firstContent = lines.findIndex((l) => l.trim() !== '');
  if (h1s.length && firstContent !== h1s[0].i) at(firstContent, '一级标题之前不能有内容');

  for (const h of heads) {
    if (h.level >= 4) at(h.i, `不允许 ${'#'.repeat(h.level)} 级标题——术语表最深到 ### 分组`);
  }

  const h2s = heads.filter((h) => h.level === 2);
  for (const h of h2s) {
    if (!SECTIONS.includes(h.title)) at(h.i, `二级标题只能是 ${SECTIONS.join(' / ')}，不能是「${h.title}」`);
  }
  const known = h2s.filter((h) => SECTIONS.includes(h.title));
  const seen = new Set();
  for (const h of known) {
    if (seen.has(h.title)) at(h.i, `「${h.title}」重复出现`);
    seen.add(h.title);
  }
  if (!seen.has('术语')) errors.push('缺「## 术语」这一节');
  const order = known.map((h) => h.title);
  if (order.indexOf('歧义词') !== -1 && order.indexOf('术语') > order.indexOf('歧义词')) {
    errors.push(`两节顺序不对：应为 ${SECTIONS.join(' → ')}`);
  }

  // --- description between H1 and the first H2 ---
  if (h1s.length) {
    const start = h1s[0].i + 1;
    const end = h2s.length ? h2s[0].i : lines.length;
    const body = lines.slice(start, end).filter((l) => l.trim() !== '');
    if (body.some((l) => H.test(l))) at(start, '一级标题和第一个二级标题之间只放描述，不放别的标题');
    const text = body.filter((l) => !H.test(l)).join(' ');
    if (!text.trim()) at(h1s[0].i, '一级标题下缺一到两句描述：这个上下文是什么、为什么存在');
    else if (countSentences(text) > MAX_SENTENCES) at(start, `描述超过 ${MAX_SENTENCES} 句（${countSentences(text)} 句）`);
  }

  // --- section bodies ---
  const sectionRange = (title) => {
    const idx = h2s.findIndex((h) => h.title === title);
    if (idx === -1) return null;
    return [h2s[idx].i + 1, idx + 1 < h2s.length ? h2s[idx + 1].i : lines.length];
  };

  const termRange = sectionRange('术语');
  if (termRange) {
    let cur = null; // { name, line, defLines: [], avoid: null, state: 'def' | 'avoid' | 'done' }
    const flush = () => {
      if (!cur) return;
      const definition = cur.defLines.join(' ').trim();
      if (!definition) at(cur.line, `词条「${cur.name}」缺定义`);
      else if (countSentences(definition) > MAX_SENTENCES) {
        at(cur.line, `词条「${cur.name}」的定义超过 ${MAX_SENTENCES} 句（${countSentences(definition)} 句）——写它是什么，机制挪去 docs/domain`);
      }
      terms.push({ name: cur.name, line: cur.line + 1, definition, avoid: cur.avoid ?? [] });
      cur = null;
    };
    for (let i = termRange[0]; i < termRange[1]; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (cur && cur.defLines.length) cur.state = cur.state === 'def' ? 'gap' : cur.state;
        continue;
      }
      const h = line.match(H);
      if (h) {
        flush();
        continue;
      }
      const head = line.match(TERM_HEAD);
      if (head) {
        flush();
        cur = { name: head[1].trim(), line: i, defLines: [], avoid: null, state: 'def' };
        continue;
      }
      if (!cur) {
        at(i, '「术语」下只放词条（**词条名**：+ 定义 + 可选 _Avoid_），这一行不属于任何词条');
        continue;
      }
      const av = line.match(AVOID);
      if (av) {
        if (cur.avoid) at(i, `词条「${cur.name}」有两行 _Avoid_`);
        cur.avoid = avoidWords(av[1]);
        if (!cur.avoid.length) at(i, `词条「${cur.name}」的 _Avoid_ 是空的`);
        cur.state = 'done';
        continue;
      }
      if (cur.state === 'def') cur.defLines.push(line);
      else at(i, `词条「${cur.name}」下有多余内容——词条只有定义和 _Avoid_ 两部分`);
    }
    flush();

    const byName = new Map();
    for (const t of terms) {
      const k = norm(t.name);
      if (byName.has(k)) errors.push(`第 ${t.line} 行：词条「${t.name}」重复（第 ${byName.get(k).line} 行已有）`);
      else byName.set(k, t);
    }
    for (const t of terms) {
      for (const w of t.avoid) {
        const other = byName.get(norm(w));
        if (other && other !== t) {
          errors.push(`第 ${t.line} 行：「${w}」在「${t.name}」的 _Avoid_ 里，却又是第 ${other.line} 行的词条——一个词不能既是标准叫法又被弃用`);
        }
      }
    }
  }

  const ambRange = sectionRange('歧义词');
  if (ambRange) {
    let last = null;
    for (let i = ambRange[0]; i < ambRange[1]; i++) {
      const raw = lines[i];
      if (!raw.trim()) continue;
      const item = raw.trim().match(AMBIG_ITEM);
      if (item && !/^\s/.test(raw)) {
        last = { word: item[1].trim(), line: i, text: item[2] };
        ambiguous.push(last);
        continue;
      }
      if (last && /^\s+\S/.test(raw)) {
        last.text += ` ${raw.trim()}`;
        continue;
      }
      at(i, '「歧义词」下只放列表项：- **词**：可能指哪几样，单独出现时该怎么说');
    }
    const seenWords = new Map();
    for (const a of ambiguous) {
      if (!a.text.trim()) at(a.line, `歧义词「${a.word}」缺说明`);
      else if (countSentences(a.text) > MAX_SENTENCES) at(a.line, `歧义词「${a.word}」的说明超过 ${MAX_SENTENCES} 句`);
      const k = norm(a.word);
      if (seenWords.has(k)) at(a.line, `歧义词「${a.word}」重复`);
      else seenWords.set(k, a);
    }
  }

  // Document order: line-numbered errors by line, file-level ones (no line) first.
  const lineOf = (e) => Number(e.match(/^第 (\d+) 行/)?.[1] ?? 0);
  errors.sort((x, y) => lineOf(x) - lineOf(y));

  return {
    valid: errors.length === 0,
    errors,
    terms,
    ambiguous: ambiguous.map((a) => ({ word: a.word, line: a.line + 1 })),
  };
}

/** Human-readable render. */
export function renderReport(result, file) {
  const where = file ? ` (${file})` : '';
  if (result.valid) return `glossary-check: green ✓${where}`;
  return [
    `glossary-check: ${result.errors.length} 处不符合 references/glossary.md §3${where}：`,
    ...result.errors.map((e) => `  - ${e}`),
  ].join('\n');
}

// CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [file] = args.filter((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: glossary-check.mjs <GLOSSARY.md> [--json]');
    process.exit(1);
  }
  let md;
  try {
    md = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`glossary-check: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const result = checkGlossary(md);
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderReport(result, file));
  process.exit(result.valid ? 0 : 2);
}
