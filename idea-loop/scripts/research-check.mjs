/**
 * Research page shape check — the deterministic gate on what `idea-loop:uiux-researcher` hands back.
 *
 * The researcher writes one self-contained `index.html` next to the screenshots it downloaded, and
 * the calling session sends that file to the human without reading it. So the page has to be
 * checkable without a model: this file judges its SKELETON, never whether the reading of a reference
 * is right and never what a chapter says.
 *
 * The page is a fixed sequence of chapters (human decision, review round 1: "the broad shape is
 * fixed to this report; each chapter has a description, not a hard requirement"):
 *
 *   1. 研究问题 — the page title (the named question handed to the researcher), the human's own
 *      words under the heading 「研究问题」, and the product context handed with it;
 *   2. 通用结论 (`general`) — what these products agree on;
 *   3. the sources — each with a title, a flow (ordered steps, each a screenshot AND a line saying
 *      what the step does, the screenshot clickable to a larger picture), and two readings,
 *      场景 / 设计逻辑;
 *   4. 要我们决策的问题 (`decisions`) — the LAST block of the page; nothing follows it.
 *
 * What this check enforces is exactly that skeleton: the chapters exist and are non-empty, they come
 * in that order, nothing comes after the decisions, every flow step has its picture / line / zoom,
 * and every picture on the page — in a flow step or anywhere else, the zoom dialog's own empty
 * <img> excepted — has an address that is a relative path resolving inside the drop directory (so the
 * page opens from a static server over its own directory and nothing points at a remote address that expires). What a chapter holds
 * beyond that — an extra paragraph, an extra block inside the conclusion or a source — is the
 * contract's prose (skills/design/uiux-research/references/research-backend.md, section 每块写什么) and the
 * human's reading, not a failing check. The two retired parts (`cannot-answer`, `for-us`) stay an
 * error because a human annotation removed them by name.
 *
 * The page marks these parts with `data-part` attributes (the contract with the template in
 * skills/design/uiux-research/references/research-backend.md). A page with no source at all is legal only when a
 * `data-part="no-source"` section says why.
 *
 * Second mode, `checkLightReturn` (CLI `--light`): the file the researcher hands back for the light use
 * (one item per judge opinion, each with a user path, pictures and a new design intent). Its shape is
 * in skills/design/uiux-research/references/light-return.md; the full-page checks above do not apply to it.
 *
 * Pure apart from the CLI at the bottom: `fileExists` is injected so the check never touches the
 * disk in tests.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VOID = new Set(['img', 'br', 'hr', 'meta', 'link', 'input', 'source', 'col', 'area', 'base', 'wbr']);

/** Drop comments and the bodies of script / style so their text is never read as page content. */
function strip(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

/** Parse just enough HTML to get elements with their attributes, inner text and children. */
function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [], text: '', parent: null };
  let cur = root;
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) {
      for (let n = cur; n; n = n.parent) n.text += m[5];
      continue;
    }
    const [, closing, rawTag, rawAttrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (closing) {
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const el = { tag, attrs, children: [], text: '', parent: cur };
    cur.children.push(el);
    if (!VOID.has(tag) && !selfClose) cur = el;
  }
  return root;
}

function* walk(el) {
  for (const c of el.children) {
    yield c;
    yield* walk(c);
  }
}

const textOf = (el) => el.text.replace(/\s+/g, ' ').trim();
const headings = (el) => [...walk(el)].filter((e) => /^h[1-6]$/.test(e.tag)).map(textOf);
/** Is `el` inside `ancestor` (or the ancestor itself)? */
function within(el, ancestor) {
  for (let n = el; n; n = n.parent) if (n === ancestor) return true;
  return false;
}
/** Does `el` sit inside an element with this tag? */
function hasAncestor(el, tag) {
  for (let n = el.parent; n; n = n.parent) if (n.tag === tag) return true;
  return false;
}
/** Tags that can follow the last chapter without being a chapter (the zoom dialog and its script). */
const NOT_CONTENT = new Set(['script', 'style', 'dialog', 'template', 'noscript']);
const isContent = (el) => !NOT_CONTENT.has(el.tag) && ('data-part' in el.attrs || 'data-source' in el.attrs || textOf(el) !== '');
const byPart = (root, part) => [...walk(root)].filter((e) => e.attrs['data-part'] === part);

/** A screenshot address must stay inside the drop directory: relative, no scheme, no `..`. */
function isRelative(src) {
  if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/') || src.startsWith('//')) return false;
  return !src.split(/[\\/]/).includes('..');
}

/**
 * @param {string} html
 * @param {{ fileExists: (relativePath: string) => boolean }} io
 * @returns {{ valid: boolean, errors: string[], sources: number }}
 */
export function checkResearchPage(html, { fileExists }) {
  const root = parse(strip(html));
  const errors = [];

  const emptyHint = {
    'human-words': '页面上要能看到人的原话，原样抄',
    question: '页面上要能看到交给调研 agent 的具名问题，原样抄',
    context: '页面上要能看到交给调研 agent 的产品上下文',
    conclusion: '结论要写',
  };
  for (const part of ['human-words', 'question', 'context', 'conclusion']) {
    const found = byPart(root, part);
    if (!found.length) errors.push(`缺少顶部的 ${part}（data-part="${part}"）`);
    else if (!textOf(found[0])) errors.push(`${part} 是空的：${emptyHint[part]}`);
  }
  const words = byPart(root, 'human-words')[0];
  if (words && !headings(words).includes('研究问题')) {
    errors.push('人的原话那一块的标题要写「研究问题」（<h3>研究问题</h3>，下面原样抄人的原话）');
  }
  const conclusion = byPart(root, 'conclusion')[0];
  if (conclusion) {
    const general = [...walk(conclusion)].filter((e) => e.attrs['data-part'] === 'general');
    if (!general.length) errors.push('结论里缺 general（这些产品的通用结论；data-part="general"，放在 data-part="conclusion" 里面）');
    else if (!textOf(general[0])) errors.push('结论的 general 是空的（这些产品的通用结论）：没有共同点也照实写一句');
  }
  for (const gone of ['cannot-answer', 'for-us']) {
    if (byPart(root, gone).length) errors.push(`${gone} 已取消：不再单列「不能回答什么」，也不在每个来源里写「对我们」；跟我们需求的结合只在页面最后的 decisions 里出现一次`);
  }

  // decisions: one block, after every source (or the no-source note), outside the top conclusion,
  // and the last block of the page.
  const order = new Map([...walk(root)].map((e, i) => [e, i]));
  const decisions = byPart(root, 'decisions')[0];
  const lastBody = [...walk(root)].filter((e) => 'data-source' in e.attrs || e.attrs['data-part'] === 'no-source').pop();
  if (!decisions) errors.push('缺少 decisions（结合我们需求、要人决策的问题；data-part="decisions"，放在所有来源之后）');
  else {
    if (!textOf(decisions)) errors.push('decisions 是空的（结合我们需求、要人决策的问题）：没有分歧要人定，也照实写一句');
    if (conclusion && within(decisions, conclusion)) {
      errors.push('decisions 不放在顶部的结论里：「结合我们需求、要人决策的问题」放在最后一个来源之后，作为页面的最后一块');
    } else if (lastBody && (within(decisions, lastBody) || order.get(decisions) < order.get(lastBody))) {
      errors.push('decisions 要放在最后一个来源之后：先让人看完各来源，再摆要人决策的问题');
    } else {
      // placed correctly; now nothing may follow it: walk up, and at every level the later siblings
      // must be non-content (the zoom dialog / script are fine, a footer block is not).
      for (let n = decisions; n.parent; n = n.parent) {
        const later = n.parent.children.slice(n.parent.children.indexOf(n) + 1).filter(isContent);
        if (later.length) {
          errors.push(`decisions 之后不能再有别的块（发现 <${later[0].tag}${later[0].attrs['data-part'] ? ` data-part="${later[0].attrs['data-part']}"` : ''}>）：「要我们决策的问题」是页面的最后一块，补充说明放进它前面的章节或删掉`);
          break;
        }
      }
    }
  }

  // The head comes first: 研究问题 (title, the human's words, the context) -> 通用结论 -> the sources.
  if (conclusion) {
    for (const part of ['question', 'human-words', 'context']) {
      const el = byPart(root, part)[0];
      if (el && order.get(el) > order.get(conclusion)) {
        errors.push(`${part} 要排在通用结论之前：页面的顺序是 研究问题与上下文 → 通用结论 → 各来源 → 要我们决策的问题`);
      }
    }
    const firstBody = [...walk(root)].find((e) => 'data-source' in e.attrs || e.attrs['data-part'] === 'no-source');
    if (firstBody && order.get(firstBody) < order.get(conclusion)) {
      errors.push('通用结论要排在各来源之前：先说这些产品得出的共同点，再逐个摆来源');
    }
  }

  const checkedImgs = new Set();
  const sources = [...walk(root)].filter((e) => 'data-source' in e.attrs);
  if (!sources.length) {
    const none = byPart(root, 'no-source');
    if (!none.length || !textOf(none[0])) errors.push('没有任何来源：至少一个 data-source 小节，或者一个写明原因的 data-part="no-source"');
  }

  sources.forEach((src, i) => {
    const titleEl = [...walk(src)].find((e) => e.attrs['data-part'] === 'source-title');
    const title = titleEl && textOf(titleEl) ? textOf(titleEl) : '';
    const name = title ? `来源「${title}」` : `第 ${i + 1} 个来源`;
    if (!title) errors.push(`${name}没有标题（data-part="source-title"）`);

    const flows = [...walk(src)].filter((e) => e.attrs['data-part'] === 'flow');
    if (!flows.length) errors.push(`${name}缺少 flow（data-part="flow"，按顺序排的截图）`);
    else {
      const steps = flows[0].children.filter((c) => c.tag === 'li');
      if (!steps.length) errors.push(`${name}的 flow 里没有任何一步（<li>）`);
      steps.forEach((li, n) => {
        const imgs = [...walk(li)].filter((e) => e.tag === 'img');
        if (!imgs.length) errors.push(`${name}第 ${n + 1} 步缺截图`);
        if (!textOf(li)) errors.push(`${name}第 ${n + 1} 步缺说明：这一步在做什么`);
        for (const img of imgs) {
          checkedImgs.add(img);
          const s = img.attrs.src ?? '';
          if (!isRelative(s)) errors.push(`${name}第 ${n + 1} 步的图 ${s || '(无 src)'} 不是落图目录内的相对路径`);
          else if (!fileExists(s)) errors.push(`${name}第 ${n + 1} 步的图 ${s} 在落图目录里不存在`);
          let zoom = img.parent;
          while (zoom && zoom !== li && !(zoom.tag === 'a' && zoom.attrs['data-part'] === 'zoom')) zoom = zoom.parent;
          if (!zoom || zoom === li) errors.push(`${name}第 ${n + 1} 步的图不能点开放大：用 <a data-part="zoom" href="…大图"> 包住 <img>`);
          else {
            const h = zoom.attrs.href ?? '';
            if (!isRelative(h)) errors.push(`${name}第 ${n + 1} 步的放大地址 ${h || '(无 href)'} 不是落图目录内的相对路径`);
            else if (!fileExists(h)) errors.push(`${name}第 ${n + 1} 步的放大图 ${h} 在落图目录里不存在`);
          }
        }
      });
    }

    for (const part of ['scene', 'logic']) {
      const found = [...walk(src)].filter((e) => e.attrs['data-part'] === part);
      if (!found.length || !textOf(found[0])) errors.push(`${name}缺 ${part}（场景 / 设计逻辑 两段都要有内容）`);
    }
  });

  // Every other picture on the page (in the conclusion, a source's readings, the decisions, ...) has
  // the same rule as a flow step's: a relative path that exists in the drop directory. The only
  // picture exempt is the one inside the zoom <dialog> — its src is set by the script at click time.
  for (const img of [...walk(root)].filter((e) => e.tag === 'img' && !checkedImgs.has(e))) {
    if (hasAncestor(img, 'dialog')) continue;
    const s = img.attrs.src ?? '';
    if (!isRelative(s)) errors.push(`页面上的图 ${s || '(无 src)'} 不是落图目录内的相对路径：参考图都要下载到落图目录再引用，远程地址会过期`);
    else if (!fileExists(s)) errors.push(`页面上的图 ${s} 在落图目录里不存在`);
  }

  return { valid: errors.length === 0, errors, sources: sources.length };
}

/** Human-readable render, same grouping the other scripts use. */
export function renderReport(result, file) {
  if (result.valid) return `research-check: green ✓ ${result.sources} 个来源${file ? ` (${file})` : ''}`;
  return [`research-check: 调研页校验失败${file ? ` (${file})` : ''} —— 补齐后再交回：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Light use: the structured file the researcher returns each design round.
// ---------------------------------------------------------------------------------------------

/** The standard line a "Mobbin not connected" return carries; the review report shows it where the pictures would be. */
export const NO_REFERENCE_LINE = '这一轮没有参考图：Mobbin 没连上';

const LIGHT_FIELDS = { connected: ['mode', 'mobbin', 'items', 'uncovered'], unavailable: ['mode', 'mobbin', 'message', 'reason', 'items'] };
const ITEM_FIELDS = ['covers', 'path', 'intent', 'overturns'];
const STEP_FIELDS = ['source', 'saw', 'did', 'then', 'images', 'reading'];
const OVERTURN_FIELDS = ['ledger', 'why'];
const UNCOVERED_FIELDS = ['opinion', 'why'];
/** Ledger numbers are `<round>.<serial>`; round 0 holds what was carried over from before the ledger. */
const LEDGER_ID = /^\d+\.\d+$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
/** Opinion numbers may be written 1 or "1"; they are compared as text. */
const key = (n) => (typeof n === 'string' || Number.isInteger(n) ? String(n) : null);

function unknownFields(obj, allowed, where, errors) {
  for (const f of Object.keys(obj)) if (!allowed.includes(f)) errors.push(`${where}有不认识的字段 ${f}`);
}

/**
 * @param {unknown} data the parsed file
 * @param {{ fileExists: (relativePath: string) => boolean, opinions: Array<number|string>, ledger?: string[] }} ctx
 *   `opinions`: the numbers of the judge opinions handed to the researcher; `ledger`: the ledger numbers
 *   handed to it (when given, an overturn must name one of them).
 * @returns {{ valid: boolean, errors: string[], items: number }}
 */
export function checkLightReturn(data, { fileExists, opinions = [], ledger }) {
  const errors = [];
  if (!isObj(data)) return { valid: false, errors: ['交回的文件顶层要是一个对象'], items: 0 };
  if (data.mode !== 'light') errors.push('mode 要写 "light"');
  if (data.mobbin !== 'connected' && data.mobbin !== 'unavailable') {
    errors.push('mobbin 要写 "connected" 或 "unavailable"');
    return { valid: false, errors, items: 0 };
  }
  unknownFields(data, LIGHT_FIELDS[data.mobbin], '文件顶层', errors);

  if (data.mobbin === 'unavailable') {
    if (data.message !== NO_REFERENCE_LINE) errors.push(`message 要写「${NO_REFERENCE_LINE}」，报告照这句出`);
    if (!isText(data.reason)) errors.push('reason 是空的：写下调用 Mobbin 时看到的错误');
    if (!Array.isArray(data.items) || data.items.length) errors.push('Mobbin 没连上时 items 要是空数组');
    return { valid: errors.length === 0, errors, items: 0 };
  }

  if (!Array.isArray(data.items)) {
    errors.push('items 要是数组');
    return { valid: false, errors, items: 0 };
  }
  const known = new Set(opinions.map(key));
  const ledgerIds = ledger ? new Set(ledger.map(String)) : null;
  const coveredBy = new Map();

  data.items.forEach((it, i) => {
    const name = `第 ${i + 1} 项`;
    if (!isObj(it)) return errors.push(`${name}要是一个对象`);
    unknownFields(it, ITEM_FIELDS, name, errors);

    if (!Array.isArray(it.covers) || !it.covers.length || !it.covers.every((n) => key(n) !== null)) {
      errors.push(`${name}的 covers 要列出它覆盖的评委意见编号（至少一个）`);
    } else {
      for (const n of it.covers) {
        const k = key(n);
        if (!known.has(k)) errors.push(`${name}覆盖的评委意见 ${k} 不是这一轮给的意见编号`);
        else if (coveredBy.has(k)) errors.push(`评委意见 ${k} 同时出现在两项里（第 ${coveredBy.get(k)} 项和${name}）：并成一项`);
        else coveredBy.set(k, i + 1);
      }
    }

    if (!Array.isArray(it.path) || !it.path.length) errors.push(`${name}缺用户路径（path：每步写看到什么、做了什么、接着看到什么）`);
    else {
      it.path.forEach((st, n) => {
        const sname = `${name}第 ${n + 1} 步`;
        if (!isObj(st)) return errors.push(`${sname}要是一个对象`);
        unknownFields(st, STEP_FIELDS, sname, errors);
        for (const f of ['saw', 'did', 'then']) {
          if (!isText(st[f])) errors.push(`${sname}缺 ${f}（${{ saw: '看到什么', did: '做了什么', then: '接着看到什么' }[f]}）`);
        }
        if (!isText(st.reading)) errors.push(`${sname}缺解读（reading：一句话说这一步为什么这样做）`);
        if (!Array.isArray(st.images) || st.images.length < 1 || st.images.length > 2) {
          errors.push(`${sname}要配 1–2 张图（images）`);
        } else {
          for (const img of st.images) {
            if (typeof img !== 'string' || !isRelative(img)) errors.push(`${sname}的图 ${img} 不是落图目录内的相对路径`);
            else if (!fileExists(img)) errors.push(`${sname}的图 ${img} 在落图目录里不存在`);
          }
        }
      });
    }

    if (!isText(it.intent)) errors.push(`${name}缺新的设计意图（intent：一句话）`);

    if (it.overturns !== undefined) {
      if (!Array.isArray(it.overturns)) errors.push(`${name}的 overturns 要是数组`);
      else {
        it.overturns.forEach((o, n) => {
          const oname = `${name}第 ${n + 1} 条推翻`;
          if (!isObj(o)) return errors.push(`${oname}要是一个对象`);
          unknownFields(o, OVERTURN_FIELDS, oname, errors);
          if (typeof o.ledger !== 'string' || !LEDGER_ID.test(o.ledger)) errors.push(`${oname}缺 ledger 编号（形如 1.2）`);
          else if (ledgerIds && !ledgerIds.has(o.ledger)) errors.push(`${oname}的编号 ${o.ledger} 不在这一轮给的 ledger 里`);
          if (!isText(o.why)) errors.push(`${oname}缺理由（why）：为什么这条决策该改`);
        });
      }
    }
  });

  const left = new Map();
  if (data.uncovered !== undefined) {
    if (!Array.isArray(data.uncovered)) errors.push('uncovered 要是数组');
    else {
      data.uncovered.forEach((u, n) => {
        const uname = `uncovered 第 ${n + 1} 条`;
        if (!isObj(u)) return errors.push(`${uname}要是一个对象`);
        unknownFields(u, UNCOVERED_FIELDS, uname, errors);
        if (key(u.opinion) === null) errors.push(`${uname}缺 opinion（评委意见编号）`);
        else if (isText(u.why)) left.set(key(u.opinion), u.why);
      });
    }
  }
  for (const k of known) {
    if (!coveredBy.has(k) && !left.has(k)) errors.push(`评委意见 ${k} 没有被覆盖：放进某一项的 covers，或在 uncovered 里写明为什么没覆盖`);
  }

  return { valid: errors.length === 0, errors, items: data.items.length };
}

/** Human-readable render for the light mode. */
export function renderLightReport(result, file) {
  if (result.valid) return `research-check: green ✓ 轻用法交回，${result.items} 项${file ? ` (${file})` : ''}`;
  return [`research-check: 轻用法交回校验失败${file ? ` (${file})` : ''} —— 补齐后再交回：`, ...result.errors.map((e) => `  - ${e}`)].join('\n');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const light = args.includes('--light');
  const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const list = (v) => (v === undefined ? undefined : v.split(',').map((x) => x.trim()).filter(Boolean));
  const [file] = args.filter((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: research-check.mjs <index.html> [--json]\n       research-check.mjs --light <research-light.json> --opinions=1,2,3 [--ledger=1.1,1.2] [--json]');
    process.exit(1);
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`research-check: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const base = dirname(file);
  const fileExists = (rel) => existsSync(join(base, rel));
  let result;
  if (light) {
    const opinions = list(opt('opinions'));
    if (!opinions || !opinions.length) {
      console.error('research-check: --light needs --opinions=<the judge opinion numbers of this round>, e.g. --opinions=1,2,3');
      process.exit(1);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(`research-check: ${file} is not valid JSON: ${e.message}`);
      process.exit(1);
    }
    result = checkLightReturn(data, { fileExists, opinions, ledger: list(opt('ledger')) });
    console.log(json ? JSON.stringify(result, null, 2) : renderLightReport(result, file));
  } else {
    result = checkResearchPage(text, { fileExists });
    console.log(json ? JSON.stringify(result, null, 2) : renderReport(result, file));
  }
  process.exit(result.valid ? 0 : 2);
}
