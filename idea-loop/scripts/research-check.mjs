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
 * page opens from file:// and nothing points at a remote address that expires). What a chapter holds
 * beyond that — an extra paragraph, an extra block inside the conclusion or a source — is the
 * contract's prose (references/design/research-backend.md, "What each chapter is for") and the
 * human's reading, not a failing check. The two retired parts (`cannot-answer`, `for-us`) stay an
 * error because a human annotation removed them by name.
 *
 * The page marks these parts with `data-part` attributes (the contract with the template in
 * references/design/research-backend.md). A page with no source at all is legal only when a
 * `data-part="no-source"` section says why.
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

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [file] = args.filter((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: research-check.mjs <index.html> [--json]');
    process.exit(1);
  }
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`research-check: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const base = dirname(file);
  const result = checkResearchPage(html, { fileExists: (rel) => existsSync(join(base, rel)) });
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderReport(result, file));
  process.exit(result.valid ? 0 : 2);
}
