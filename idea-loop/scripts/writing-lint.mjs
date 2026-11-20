#!/usr/bin/env node
/**
 * Writing lint: the mechanical half of checking an article (markdown / mdx with frontmatter).
 * It flags only what a pattern can verify: sentence and comma counts, filler phrases, caption
 * and frontmatter gaps, markup slips, EN / ZH structure parity. Whether a hook is strong or a thesis
 * holds is a judgment, left to a reader (a judge sub-agent), never to this script.
 *
 * Usage: node writing-lint.mjs [--config=<file.json>] [--lang=en|zh] [--format=json|text] <file|dir>...
 *   A directory means every `.md` / `.mdx` file directly inside it. The language of a file comes from
 *   `--lang`, else from its name (`<slug>.<locale>.md`: a locale starting `zh`, or equal to the
 *   configured `localePair.zh`, is Chinese; anything else English), else from its text.
 *
 * Output (stdout, JSON by default; `--format=text` prints the same list as lines):
 *   {
 *     "clean": false,
 *     "total": 3,
 *     "bySeverity": { "error": 1, "warn": 2, "note": 0 },
 *     "files": ["post.en.md"],
 *     "rules": {                                  // only rules that found something
 *       "<rule-name>": [ { "file": "post.en.md", "line": 12, "severity": "warn", "message": "<one sentence>" } ]
 *     }
 *   }
 *   `line` is 1-based in the file. Within a rule, findings are ordered by file, then line.
 * Exit: 0 = clean (no finding at all), 1 = at least one finding, 2 = usage error, unreadable file,
 *   or a config that is not valid (the reason is on stderr).
 *
 * Rules (name: what it flags; severity). Every rule can be switched off in the config.
 *   para-sentences      a paragraph with more sentences than the limit; warn
 *   visual-break        a run of prose longer than the limit with no list, table, image, quote or rule; warn
 *   bullet-long         a list item wider than the limit (a CJK character counts 2); note
 *   transition-density  more transition words than sentences in one paragraph (and more than one); note
 *   dash-density        em-dashes per 100 words above the limit, counted over the whole article; note
 *   comma-chain         one sentence with more commas than the limit, ignoring parentheses and short
 *                       enumerations; warn
 *   faq-thin            an FAQ answer shorter than the minimum, so it cannot stand alone when quoted; warn
 *   ai-slop             a filler phrase from the word list; warn
 *   colon-opener        a paragraph that opens with a label and a colon ("So:", "In other words:"); warn
 *   stray-italic        `*italic*` outside the exempt places (the first blockquote, a whole-paragraph
 *                       footnote, a link label); warn
 *   image-caption       an image with no caption, a caption equal to its alt text, or a caption that
 *                       is only a "Figure N" label; error
 *   required-fields     a required frontmatter field is missing or empty; error
 *   image-field         none of the image frontmatter fields is set; warn
 *   faqs-field          the FAQ frontmatter field is missing; warn
 *   locale-parity       the counts of H2, H3, tables, images, captions or blockquotes differ between the
 *                       two language versions of one article (`<slug>.en.md`, `<slug>.zh-CN.md`; a file
 *                       is compared with its sibling on disk); warn. With `localePair.requireBoth`, a
 *                       missing version is an error too.
 *   table-div-align     a table cell aligned with <div style="text-align...">; error
 *   tilde-number        "~20" in prose; note
 *   numeric-range-hyphen  "15-20" with a hyphen instead of an en-dash; note
 *
 * Config (`--config`, a JSON file). Anything left out keeps its default; a list you write replaces
 * the default list, it is not added to it. A key the script does not know is an error (exit 2), so a
 * typo cannot pass silently.
 *   {
 *     "thresholds": {
 *       "maxSentencesPerParagraph": 4,
 *       "visualBreakWords": { "en": 250, "zh": 400 },   // words; for Chinese a character counts as a word
 *       "maxBulletWidth": 240,
 *       "maxTransitionsPerSentence": 1,
 *       "maxDashPer100Words": 1,
 *       "maxCommasPerSentence": 3,
 *       "faqMinWords": { "en": 25, "zh": 40 }
 *     },
 *     "wordlists": {
 *       "aiSlop":       { "en": [...], "zh": [...] },
 *       "transitions":  { "en": [...], "zh": [...] },
 *       "colonOpeners": { "en": [...], "zh": [...] }
 *     },
 *     "fields": {
 *       "required": ["title", "excerpt"],                // frontmatter keys that must be non-empty
 *       "image": ["cover", "ogImage"],                   // at least one of these must be set
 *       "faqs": "faqs",                                  // the key that holds the FAQ list
 *       "faqAnswer": "a",                                // the key of an answer inside that list
 *       "captionAttribute": "title"                      // the attribute that is the caption of a hand-written <img>
 *     },
 *     "localePair": { "en": "en", "zh": "zh-CN",         // the two locales in `<slug>.<locale>.md`
 *                     "requireBoth": false },            // true: a file whose other-language version is missing is an error
 *     "italic": { "exemptFirstBlockquote": true },
 *     "disableRules": []                                 // rule names to switch off
 *   }
 *
 * Imported by tests: lintText, lintPaths, mergeConfig, DEFAULT_CONFIG.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RULES = [
  'para-sentences', 'visual-break', 'bullet-long', 'transition-density', 'dash-density', 'comma-chain',
  'faq-thin', 'ai-slop', 'colon-opener', 'stray-italic', 'image-caption', 'required-fields',
  'image-field', 'faqs-field', 'locale-parity', 'table-div-align', 'tilde-number', 'numeric-range-hyphen',
];

export const DEFAULT_CONFIG = {
  thresholds: {
    maxSentencesPerParagraph: 4,
    visualBreakWords: { en: 250, zh: 400 },
    maxBulletWidth: 240,
    maxTransitionsPerSentence: 1,
    maxDashPer100Words: 1,
    maxCommasPerSentence: 3,
    faqMinWords: { en: 25, zh: 40 },
  },
  wordlists: {
    aiSlop: {
      en: ['furthermore', 'moreover', 'in addition', 'needless to say', "it's important to note", 'it is important to note', 'last but not least'],
      zh: ['此外', '值得注意的是', '综上所述', '总而言之', '不言而喻', '众所周知'],
    },
    transitions: {
      en: ['however', 'nevertheless', 'additionally', 'consequently', 'therefore', 'thus', 'hence'],
      zh: ['然而', '不过', '因此', '从而', '进而', '故而'],
    },
    colonOpeners: {
      en: ['so', 'and so', 'in other words', 'put simply', 'simply put', 'the result', 'the takeaway', 'the point', 'bottom line', 'net net', 'translation'],
      zh: ['所以', '也就是说', '简单说', '简言之', '换句话说', '结论', '总之'],
    },
  },
  fields: {
    required: ['title', 'excerpt'],
    image: ['cover', 'ogImage'],
    faqs: 'faqs',
    faqAnswer: 'a',
    captionAttribute: 'title',
  },
  localePair: { en: 'en', zh: 'zh-CN', requireBoth: false },
  italic: { exemptFirstBlockquote: true },
  disableRules: [],
};

// ── Config ───────────────────────────────────────────────────────────────────

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge a user config over the defaults, rejecting unknown keys and wrong types. */
export function mergeConfig(user, base = DEFAULT_CONFIG, path = '') {
  if (!isObj(user)) throw new Error(`config${path || ''}: expected an object`);
  const out = {};
  for (const key of Object.keys(user)) {
    if (!(key in base)) throw new Error(`config: unknown key "${path}${key}"`);
  }
  for (const [key, def] of Object.entries(base)) {
    if (!(key in user)) { out[key] = def; continue; }
    const v = user[key];
    const where = `${path}${key}`;
    if (isObj(def)) out[key] = mergeConfig(v, def, `${where}.`);
    else if (Array.isArray(def)) {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`config: "${where}" must be a list of strings`);
      out[key] = v;
    } else if (typeof def === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`config: "${where}" must be a non-negative number`);
      out[key] = v;
    } else if (typeof def === 'boolean') {
      if (typeof v !== 'boolean') throw new Error(`config: "${where}" must be true or false`);
      out[key] = v;
    } else {
      if (typeof v !== 'string' || !v) throw new Error(`config: "${where}" must be a non-empty string`);
      out[key] = v;
    }
  }
  for (const name of out.disableRules ?? []) {
    if (!RULES.includes(name)) throw new Error(`config: disableRules names unknown rule "${name}"`);
  }
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (s) => escapeRe(s.trim()).replace(/\s+/g, '\\s+');

/** A word list as one regex; no words, no regex. English matches whole words, Chinese anywhere. */
function listRegex(words, lang, { prefix = '', suffix = '', flags = '' } = {}) {
  const alts = words.filter((w) => w.trim()).map(phrase);
  if (!alts.length) return null;
  const body = `(?:${alts.join('|')})`;
  const bounded = lang === 'zh' ? body : `\\b${body}\\b`;
  return new RegExp(`${prefix}${bounded}${suffix}`, flags + (lang === 'zh' ? '' : 'i'));
}

// ── Text helpers ─────────────────────────────────────────────────────────────

const CJK_RE = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

function visualWidth(str) {
  let w = 0;
  for (const ch of str) w += CJK_RE.test(ch) ? 2 : 1;
  return w;
}

/** Latin words plus CJK characters, so a Chinese and an English text are comparable. */
function wordEquiv(str) {
  const cjk = (str.match(new RegExp(CJK_RE.source, 'g')) || []).length;
  const latin = (str.replace(new RegExp(CJK_RE.source, 'g'), ' ').match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).length;
  return cjk + latin;
}

/** Parenthetical asides do not chain clauses; drop them before counting commas. */
const stripParens = (s) => s.replace(/\([^()]*\)/g, '').replace(/（[^（）]*）/g, '');

/** Four or more short comma-separated items are an enumeration, not a chained sentence. */
function stripEnumerations(s) {
  return s.replace(/(?:[^,，]{1,24}[,，]\s*){3,}[^,，]{1,24}/g, (run) => {
    const items = run.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    const isShort = (x) => (CJK_RE.test(x) ? x.length <= 6 : x.split(/\s+/).length <= 2);
    return items.filter(isShort).length / items.length >= 0.8 ? ' LIST ' : run;
  });
}

/** A block wrapped start to end in one *italic* span is a deliberate footnote, not stray emphasis. */
function isWholeBlockItalic(raw) {
  const t = raw.trim();
  if (!/^\*(?!\*)/.test(t) || !/(?<!\*)\*$/.test(t) || t.length < 3) return false;
  const inner = t.slice(1, -1).replace(/\*\*[^*]*\*\*/g, '');
  return !/(?<!\*)\*(?!\*)/.test(inner);
}

/** Strip inline markdown so counts reflect prose, not markup. */
function stripInline(s) {
  return s
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,3}/g, '')
    .replace(/<[^>]+>/g, ' ');
}

const ABBREV_RE = /\b(e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|Prof|Ph\.D|U\.S|a\.m|p\.m)\./gi;

function countSentences(text, lang) {
  if (lang === 'zh') {
    const m = text.match(/[。！？]+/g);
    return m ? m.length : (text.trim() ? 1 : 0);
  }
  const t = text.replace(ABBREV_RE, '$1_').replace(/\d+\.\d+/g, 'N').replace(/\.\.\./g, '…');
  const m = t.match(/[.!?]+(?=\s|$|["')\]])/g);
  return m ? m.length : (text.trim() ? 1 : 0);
}

function splitSentences(text, lang) {
  if (lang === 'zh') return text.split(/(?<=[。！？]+)/).map((s) => s.trim()).filter(Boolean);
  const guarded = text.replace(ABBREV_RE, '$1_').replace(/\d+\.\d+/g, 'N');
  return guarded.split(/(?<=[.!?]+)\s+/).map((s) => s.replace(/_/g, '.')).filter((s) => s.trim());
}

const snippet = (s) => { const t = s.trim().replace(/\s+/g, ' '); return t.length > 60 ? `${t.slice(0, 57)}…` : t; };

// ── Images ───────────────────────────────────────────────────────────────────

const MD_IMAGE_RE = /!\[((?:[^\]\\]|\\.)*)\]\(\s*(?:<[^>]*>|[^\s)]+)(?:\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'))?\s*\)/g;
const HTML_IMG_RE = /<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
const CAPTION_LABEL_RE = /^(?:figure|fig\.?|图)\s*\d*\s*[—–:：.-]*\s*/i;
const normCaption = (t) => t.replace(/\s+/g, ' ').trim();

/** Every image in a block of text: {src, alt, caption, index}. A markdown image's caption is its title. */
function findImages(text, captionAttr) {
  const out = [];
  for (const m of text.matchAll(MD_IMAGE_RE)) {
    out.push({ src: m[0].match(/\]\(\s*<?([^\s)>]+)/)?.[1] ?? '', alt: m[1], caption: m[2] ?? m[3] ?? '', index: m.index });
  }
  for (const m of text.matchAll(HTML_IMG_RE)) {
    const attr = (name) => {
      const a = m[0].match(new RegExp(`(?<![\\w-])${escapeRe(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
      return a ? (a[1] ?? a[2] ?? '') : '';
    };
    out.push({ src: attr('src'), alt: attr('alt'), caption: attr(captionAttr), index: m.index });
  }
  return out;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/** Split a file into frontmatter and blocks; every block knows its first line (1-based). */
function parse(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let frontmatter = '';
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) { frontmatter = lines.slice(1, end).join('\n'); i = end + 1; }
  }
  const blocks = [];
  let inFence = false;
  let inJsx = false;
  let cur = null;
  const push = () => { if (cur && cur.lines.length) blocks.push(cur); cur = null; };
  for (; i < lines.length; i++) {
    const ln = lines[i];
    const no = i + 1;
    if (/^```/.test(ln)) { push(); inFence = !inFence; blocks.push({ type: 'code', lines: [ln], start: no }); continue; }
    if (inFence) { if (blocks.length) blocks[blocks.length - 1].lines.push(ln); continue; }
    // A JSX element spans several lines; stay inside its opening tag until the tag closes.
    if (inJsx) {
      blocks[blocks.length - 1].lines.push(ln);
      if (/>\s*$/.test(ln)) inJsx = false;
      continue;
    }
    if (ln.trim() === '') { push(); continue; }
    let type;
    if (/^#{1,6}\s/.test(ln)) type = 'heading';
    else if (/^\s*([-*+]\s|\d+\.\s)/.test(ln)) type = 'list';
    else if (/^\s*>/.test(ln)) type = 'quote';
    else if (/^\s*\|/.test(ln)) type = 'table';
    else if (/^\s*!\[/.test(ln)) type = 'image';
    else if (/^\s*(---|\*\*\*|___)\s*$/.test(ln)) type = 'hr';
    else if (/^\s*</.test(ln)) type = 'html';
    else if (/^\s*(import|export)\s/.test(ln)) type = 'html';
    else type = 'para';
    if (type === 'heading' || type === 'image' || type === 'hr') { push(); blocks.push({ type, lines: [ln], start: no }); continue; }
    if (type === 'html' && /^\s*</.test(ln) && !/>\s*$/.test(ln)) {
      push(); blocks.push({ type: 'html', lines: [ln], start: no }); inJsx = true; continue;
    }
    if (!cur || cur.type !== type) { push(); cur = { type, lines: [], start: no }; }
    cur.lines.push(ln);
  }
  push();
  return { frontmatter, blocks };
}

/** Joined text of a block plus a way back from an offset in it to a file line. */
function blockText(b, transform = (s) => s) {
  const parts = b.lines.map(transform);
  const starts = [];
  let at = 0;
  for (const p of parts) { starts.push(at); at += p.length + 1; }
  const text = parts.join(' ');
  const lineAt = (offset) => {
    let k = 0;
    while (k + 1 < starts.length && starts[k + 1] <= offset) k++;
    return b.start + k;
  };
  return { text, lineAt };
}

// ── One file ─────────────────────────────────────────────────────────────────

export function detectLang(text) {
  const cjk = (text.match(new RegExp(CJK_RE.source, 'g')) || []).length;
  return cjk > text.length * 0.2 ? 'zh' : 'en';
}

const POST_FILE_RE = /^(.+?)\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*)\.mdx?$/;

function langFromName(file, pair) {
  const locale = basename(file).match(POST_FILE_RE)?.[2];
  if (!locale) return null;
  if (locale === pair.zh || /^zh/i.test(locale)) return 'zh';
  return 'en';
}

/** Findings of one article. `opts.lang` forces the language; otherwise it comes from the name, then the text. */
export function lintText(raw, { file = '', lang, config = DEFAULT_CONFIG } = {}) {
  const cfg = config;
  const th = cfg.thresholds;
  const L = lang ?? langFromName(file, cfg.localePair) ?? detectLang(raw);
  const { frontmatter: fm, blocks } = parse(raw);
  const findings = [];
  const off = new Set(cfg.disableRules);
  const add = (rule, severity, line, message) => { if (!off.has(rule)) findings.push({ rule, severity, line, message }); };

  const slopRe = listRegex(cfg.wordlists.aiSlop[L], L, { flags: 'g' });
  const transRe = listRegex(cfg.wordlists.transitions[L], L, { flags: 'g' });
  const colonRe = listRegex(cfg.wordlists.colonOpeners[L], L, { prefix: '^', suffix: '\\s*[:：]' });
  const fmLine = (idx) => fm.slice(0, idx).split('\n').length + 1; // frontmatter text offset → file line

  // — Frontmatter —
  const hasField = (name) => new RegExp(`^${escapeRe(name)}:\\s*\\S`, 'm').test(fm);
  for (const name of cfg.fields.required) {
    if (!hasField(name)) add('required-fields', 'error', 1, `Missing required frontmatter field \`${name}:\`.`);
  }
  if (cfg.fields.image.length && !cfg.fields.image.some(hasField)) {
    add('image-field', 'warn', 1, `None of ${cfg.fields.image.map((n) => `\`${n}:\``).join(' / ')} is set; the article has no image.`);
  }
  const faqsKey = cfg.fields.faqs;
  if (!new RegExp(`^${escapeRe(faqsKey)}:`, 'm').test(fm)) {
    add('faqs-field', 'warn', 1, `No \`${faqsKey}:\` in the frontmatter; the article carries no FAQ list.`);
  }

  // — FAQ answers: a floor only —
  const answerRe = new RegExp(`^\\s*${escapeRe(cfg.fields.faqAnswer)}:\\s*"([^"]*)"\\s*$`, 'gm');
  for (const m of fm.matchAll(answerRe)) {
    const words = wordEquiv(m[1]);
    if (words < th.faqMinWords[L]) {
      add('faq-thin', 'warn', fmLine(m.index), `FAQ answer is thin (${words} words, minimum ${th.faqMinWords[L]}); it cannot stand alone when quoted: "${snippet(m[1])}"`);
    }
  }

  // — Body —
  let heading = '(intro)';
  let proseRun = 0;
  let breakReported = false;
  let totalWords = 0;
  let totalDashes = 0;
  let firstDashLine = 0;
  let seenFirstQuote = false;
  const stats = { h2: 0, h3: 0, tables: 0, images: 0, quotes: 0, captions: 0 };
  const visualTypes = new Set(['table', 'image', 'quote', 'list', 'hr']);

  for (const b of blocks) {
    const { text, lineAt } = blockText(b);
    const cleaned = blockText(b, stripInline);
    const clean = cleaned.text;

    if (b.type === 'heading') {
      heading = b.lines[0].replace(/^#+\s*/, '').trim();
      if (/^##\s/.test(b.lines[0])) stats.h2++;
      else if (/^###\s/.test(b.lines[0])) stats.h3++;
      proseRun = 0; breakReported = false;
      continue;
    }
    if (b.type === 'code') { proseRun = 0; breakReported = false; continue; }
    if (b.type === 'table') stats.tables++;
    if (b.type === 'image') stats.images++;
    if (b.type === 'quote') stats.quotes++;

    // Image captions, on every non-code block so a list or table cell is seen too.
    for (const img of findImages(text, cfg.fields.captionAttribute)) {
      const caption = normCaption(img.caption);
      const line = lineAt(img.index);
      if (caption) stats.captions++;
      if (!caption) add('image-caption', 'error', line, `Image has no caption under "${heading}" (${img.src}); write it as the image title: ![alt](src "caption").`);
      else if (caption === normCaption(img.alt)) add('image-caption', 'error', line, `Caption repeats the alt text under "${heading}" (${img.src}); alt describes the picture, the caption says what it shows here: "${snippet(caption)}"`);
      else if (!caption.replace(CAPTION_LABEL_RE, '').trim()) add('image-caption', 'error', line, `Caption is only a label under "${heading}" (${img.src}); follow "${caption}" with the sentence that says what the picture shows.`);
    }

    // Stray italic. The first blockquote is the one place some sites style as italic on purpose.
    const exempt = cfg.italic.exemptFirstBlockquote && b.type === 'quote' && !seenFirstQuote;
    if (b.type === 'quote') seenFirstQuote = true;
    if (!exempt && b.type !== 'html' && !(b.type === 'para' && isWholeBlockItalic(text))) {
      const masked = text.replace(/\[[^\]]*\]/g, (m) => ' '.repeat(m.length)); // italic inside a link label is a cited title
      for (const m of masked.matchAll(/(?:^|[^*\\])\*(?!\*)([^*\n ][^*\n]*?)\*(?!\*)/g)) {
        add('stray-italic', 'warn', lineAt(m.index + (m[0].startsWith('*') ? 0 : 1)), `Stray *italic* under "${heading}"; use **bold** for a term, or "quotes" for a word named as a word: "*${m[1].trim()}*"`);
      }
    }

    if (visualTypes.has(b.type)) { proseRun = 0; breakReported = false; }

    if (b.type === 'table') {
      const m = text.match(/<div[^>]*text-align/i);
      if (m) add('table-div-align', 'error', lineAt(m.index), `Table cell uses <div style="text-align:..."> under "${heading}"; align with the separator row instead ("| :--- |", "| :---: |", "| ---: |").`);
    }

    if (b.type === 'para') {
      const n = countSentences(clean, L);
      if (n > th.maxSentencesPerParagraph) add('para-sentences', 'warn', b.start, `Paragraph has ${n} sentences (limit ${th.maxSentencesPerParagraph}) under "${heading}": "${snippet(clean)}"`);

      proseRun += wordEquiv(clean);
      if (proseRun > th.visualBreakWords[L] && !breakReported) {
        breakReported = true;
        add('visual-break', 'warn', b.start, `About ${proseRun} words of prose with no visual break under "${heading}" (limit ${th.visualBreakWords[L]}); add a list, table, sample or diagram.`);
      }

      const words = wordEquiv(clean);
      totalWords += words;
      const dashes = (clean.match(/—/g) || []).length;
      if (dashes && !firstDashLine) firstDashLine = cleaned.lineAt(clean.indexOf('—'));
      totalDashes += dashes;

      // Comma chains: one finding per sentence, on the line the sentence starts.
      const commaChar = L === 'zh' ? /，/g : /,/g;
      let from = 0;
      for (const s of splitSentences(clean, L)) {
        const at = clean.indexOf(s, from);
        if (at >= 0) from = at + s.length;
        const commas = (stripEnumerations(stripParens(s)).match(commaChar) || []).length;
        if (commas > th.maxCommasPerSentence) {
          add('comma-chain', 'warn', cleaned.lineAt(Math.max(0, at)), `Sentence has ${commas} commas outside parentheses (limit ${th.maxCommasPerSentence}) under "${heading}"; split it: "${snippet(s)}"`);
        }
      }

      if (colonRe) {
        const m = clean.trimStart().match(colonRe);
        if (m) add('colon-opener', 'warn', b.start, `Paragraph opens with "${m[0]}" under "${heading}"; that is a label on your own output. Cut it and start with the sentence.`);
      }

      if (transRe) {
        const tc = (text.match(transRe) || []).length;
        const sentences = Math.max(1, n);
        if (tc > 1 && tc / sentences > th.maxTransitionsPerSentence) {
          add('transition-density', 'note', b.start, `${tc} transition words in ${sentences} sentence(s) under "${heading}" (limit ${th.maxTransitionsPerSentence} per sentence); thin them.`);
        }
      }
    }

    if (b.type === 'list') {
      b.lines.forEach((li, k) => {
        const w = visualWidth(stripInline(li));
        if (w > th.maxBulletWidth) add('bullet-long', 'note', b.start + k, `List item is long (width ${w}, limit ${th.maxBulletWidth}) under "${heading}": "${snippet(stripInline(li))}"`);
      });
    }

    if (slopRe) {
      for (const m of text.matchAll(slopRe)) add('ai-slop', 'warn', lineAt(m.index), `Filler phrase "${m[0]}" under "${heading}"; cut it and go straight to the next sentence.`);
    }

    if (b.type === 'para' || b.type === 'list' || b.type === 'quote') {
      const tilde = text.match(/~\s*\d/);
      if (tilde) add('tilde-number', 'note', lineAt(tilde.index), `"~number" under "${heading}"; write "about N" in prose.`);
      for (const m of text.matchAll(/(?<![\w/-])\d+-\d+(?![\w/-])/g)) {
        add('numeric-range-hyphen', 'note', lineAt(m.index), `Numeric range "${m[0]}" uses a hyphen under "${heading}"; use an en-dash "${m[0].replace('-', '–')}" (ignore if it is a date or an id).`);
      }
    }
  }

  if (totalWords > 0) {
    const density = (totalDashes / totalWords) * 100;
    if (density > th.maxDashPer100Words) {
      add('dash-density', 'note', firstDashLine || 1, `Em-dash density is ${density.toFixed(2)} per 100 words (limit ${th.maxDashPer100Words}); use a period or colon for some of them.`);
    }
  }

  findings.sort((a, b) => a.line - b.line);
  return { findings, stats };
}

// ── Files and parity ─────────────────────────────────────────────────────────

function expand(paths) {
  const out = [];
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`not found: ${p}`);
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) if (/\.mdx?$/.test(name)) out.push(join(p, name));
    } else out.push(p);
  }
  return [...new Set(out)];
}

const sibling = (file, locale) => {
  const m = basename(file).match(POST_FILE_RE);
  if (!m) return null;
  for (const ext of ['md', 'mdx']) {
    const p = join(dirname(file), `${m[1]}.${locale}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
};

/**
 * Lint files; returns the grouped report. Parity is checked once per article that is named by its
 * `<slug>.<locale>.md` files, against the other language's file on disk.
 */
export function lintPaths(paths, { config = DEFAULT_CONFIG, lang } = {}) {
  const files = expand(paths);
  const rules = {};
  const push = (rule, file, f) => { (rules[rule] ??= []).push({ file, line: f.line, severity: f.severity, message: f.message }); };
  const statsOf = {};
  for (const file of files) {
    const { findings, stats } = lintText(readFileSync(file, 'utf8'), { file, lang, config });
    statsOf[file] = stats;
    for (const f of findings) push(f.rule, file, f);
  }

  if (!config.disableRules.includes('locale-parity')) {
    const { en, zh } = config.localePair;
    const done = new Set();
    for (const file of files) {
      const m = basename(file).match(POST_FILE_RE);
      if (!m || (m[2] !== en && m[2] !== zh)) continue;
      const key = join(dirname(file), m[1]);
      if (done.has(key)) continue;
      done.add(key);
      const enFile = m[2] === en ? file : sibling(file, en);
      const zhFile = m[2] === zh ? file : sibling(file, zh);
      const primary = enFile ?? file;
      if (!enFile || !zhFile) {
        if (!config.localePair.requireBoth) continue;
        push('locale-parity', file, { line: 1, severity: 'error', message: `Only the ${enFile ? en : zh} version of "${m[1]}" exists; the other language version (${enFile ? zh : en}) is missing.` });
        continue;
      }
      const stat = (f) => statsOf[f] ?? lintText(readFileSync(f, 'utf8'), { file: f, lang, config }).stats;
      const a = stat(enFile);
      const b = stat(zhFile);
      for (const k of ['h2', 'h3', 'tables', 'images', 'captions', 'quotes']) {
        if (a[k] !== b[k]) push('locale-parity', primary, { line: 1, severity: 'warn', message: `Structure differs between versions: ${k}: ${en}=${a[k]} ${zh}=${b[k]}; the two files should mirror each other.` });
      }
    }
  }

  for (const list of Object.values(rules)) list.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : x.line - y.line));
  const all = Object.values(rules).flat();
  const bySeverity = { error: 0, warn: 0, note: 0 };
  for (const f of all) bySeverity[f.severity]++;
  const ordered = Object.fromEntries(RULES.filter((r) => rules[r]).map((r) => [r, rules[r]]));
  return { clean: all.length === 0, total: all.length, bySeverity, files, rules: ordered };
}

function toText(report) {
  const out = [];
  for (const [rule, list] of Object.entries(report.rules)) {
    out.push(`${rule} (${list.length})`);
    for (const f of list) out.push(`  ${f.file}:${f.line} [${f.severity}] ${f.message}`);
  }
  out.push(report.clean ? 'clean' : `${report.total} finding(s): ${report.bySeverity.error} error, ${report.bySeverity.warn} warn, ${report.bySeverity.note} note`);
  return out.join('\n');
}

const USAGE = 'usage: writing-lint.mjs [--config=<file.json>] [--lang=en|zh] [--format=json|text] <file|dir>...';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const argv = process.argv.slice(2);
    const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    const paths = argv.filter((a) => !a.startsWith('--'));
    if (!paths.length) throw new Error(USAGE);
    const lang = opt('lang');
    if (lang && lang !== 'en' && lang !== 'zh') throw new Error(`--lang must be en or zh\n${USAGE}`);
    const format = opt('format') ?? 'json';
    if (format !== 'json' && format !== 'text') throw new Error(`--format must be json or text\n${USAGE}`);
    const cfgPath = opt('config');
    let config = DEFAULT_CONFIG;
    if (cfgPath) {
      let user;
      try { user = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch (e) { throw new Error(`cannot read config ${cfgPath}: ${e.message}`); }
      config = mergeConfig(user);
    }
    const report = lintPaths(paths, { config, lang });
    console.log(format === 'text' ? toText(report) : JSON.stringify(report, null, 2));
    process.exitCode = report.clean ? 0 : 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
  }
}
