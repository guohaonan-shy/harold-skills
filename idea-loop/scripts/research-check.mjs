/**
 * Research page shape check — the deterministic gate on what `idea-loop:uiux-researcher` hands back.
 *
 * The researcher writes one self-contained `index.html` next to the screenshots it downloaded, and
 * the calling session sends that file to the human without reading it. So the page has to be
 * checkable without a model: this file judges its SHAPE, never whether the reading of a reference
 * is right.
 *
 *   - the head of the page: the named question, one-sentence conclusion, what this research
 *     cannot answer (a time- or behaviour-dimension question that static screenshots cannot
 *     settle goes there instead of being padded with references);
 *   - every source: a title, a flow (ordered steps, each with a screenshot AND a line saying what
 *     the step does), and the three readings 场景 / 设计逻辑 / 对我们;
 *   - every screenshot is a relative path that resolves inside the drop directory, so the page
 *     opens from file:// and nothing points at a remote address that expires.
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

  for (const part of ['question', 'conclusion', 'cannot-answer']) {
    const found = byPart(root, part);
    if (!found.length) errors.push(`缺少顶部的 ${part}（data-part="${part}"）`);
    else if (!textOf(found[0])) errors.push(`${part} 是空的：照实写，「不能回答什么」也一样`);
  }

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
          const s = img.attrs.src ?? '';
          if (!isRelative(s)) errors.push(`${name}第 ${n + 1} 步的图 ${s || '(无 src)'} 不是落图目录内的相对路径`);
          else if (!fileExists(s)) errors.push(`${name}第 ${n + 1} 步的图 ${s} 在落图目录里不存在`);
        }
      });
    }

    for (const part of ['scene', 'logic', 'for-us']) {
      const found = [...walk(src)].filter((e) => e.attrs['data-part'] === part);
      if (!found.length || !textOf(found[0])) errors.push(`${name}缺 ${part}（场景 / 设计逻辑 / 对我们 三段都要有内容）`);
    }
  });

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
