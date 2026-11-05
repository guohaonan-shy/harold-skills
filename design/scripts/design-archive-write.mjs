#!/usr/bin/env node
/**
 * The archive script — the only way `docs/design/prod/` is written.
 *
 * A requirement's design lives in `docs/design/tmp/<spec-slug>/` while it is in flight (local only,
 * never in git). Before the PR merges, its `delta/` is folded into `prod/`: this script does that, in
 * one call, and refuses to write anything unless the result would pass the archive's own validation.
 *
 *   1 validate the archive with `delta/` laid over it (usedBy consistency is skipped: it has not been
 *     regenerated yet, so a new page that uses an existing component is always "inconsistent" here)
 *   2 copy `delta/` over `prod/` at the same paths (assets included); drop what `removed.md` lists
 *   3 regenerate every component's and motion's `usedBy`, and `prod/index.md` (four tables built from
 *     frontmatter; the index's own viewport / theme / locale settings are kept)
 *   4 move the requirement's interaction figures into `prod/pages/<page>/assets/flows/` and point the
 *     spec's image links at the new place
 *   5 look at the target repo's `.gitattributes` (Git LFS for png / gif / webm under prod assets) and
 *     `.gitignore` (`docs/design/tmp/`); say what is missing, change neither
 *   6 empty `tmp/<spec-slug>/`
 *
 * All of 2-4 is first built as a plan and applied to a throw-away copy of `docs/` (text files real,
 * binaries as empty placeholders); the copy is validated in full. Only when that passes is the plan
 * applied to the repository. So a failure at any point leaves `prod/`, the spec and `tmp/` untouched,
 * and `--dry-run` runs exactly this far and stops.
 *
 * Which images are "interaction figures": the pictures directly inside a `flows/` directory under
 * `canvas/`, plus any picture the spec links that sits under `canvas/`. A figure belongs to the page of
 * the state whose id its file name contains (the longest such id); one that names no state goes to the
 * first page the delta touches (else the page of the first state it touches) and the output says so.
 *
 * Usage:  node design-archive-write.mjs <repo-root> <spec-slug> [--dry-run] [--json]
 * Exit:   0 = archived (or dry-run passed), 1 = refused (violations / conflicts listed; nothing written),
 *         2 = usage error / nothing to archive
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, posix as ppath, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, formatViolation } from './design-archive-check.mjs';
import {
  computeUsedBy, loadArchive, objectsOfKind, pageOfState, statesOfPage, walk, wikilinkTarget,
} from './design-archive.mjs';

export const PROD = 'docs/design/prod';
export const TMP = 'docs/design/tmp';
const FIGURE = /\.(png|gif|webp|jpe?g|svg)$/i;
const LFS_EXTS = ['png', 'gif', 'webm'];

const posix = (p) => p.split(sep).join('/');
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export class UsageError extends Error {}

// ---------- usedBy: edit one frontmatter field in place ----------

/**
 * Set `usedBy` in a file's frontmatter to the given pages, leaving every other byte alone.
 * The field is written as a one-line flow list of quoted wikilinks; an existing value in any YAML
 * shape (flow on one or several lines, block list, empty) is replaced; a missing field is appended.
 */
export function setUsedBy(text, pages) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return text;
  const close = lines.findIndex((l, i) => i > 0 && /^---[ \t]*$/.test(l));
  if (close < 0) return text;
  const next = `usedBy: [${pages.map((p) => `"[[${p}]]"`).join(', ')}]`;
  const at = lines.findIndex((l, i) => i > 0 && i < close && /^usedBy\s*:/.test(l));
  if (at < 0) {
    lines.splice(close, 0, next);
    return lines.join(eol);
  }
  const value = lines[at].replace(/^usedBy\s*:\s*/, '').replace(/\s+#.*$/, '');
  let end = at;
  if (/^[\[{]/.test(value)) {
    let depth = 0;
    for (let i = at; i < close; i++) {
      const code = (i === at ? value : lines[i]).replace(/"[^"]*"|'[^']*'/g, '');
      for (const c of code) depth += c === '[' || c === '{' ? 1 : c === ']' || c === '}' ? -1 : 0;
      end = i;
      if (depth <= 0) break;
    }
  } else if (value === '') {
    while (end + 1 < close && /^(\s+\S|-\s)/.test(lines[end + 1])) end++;
  }
  lines.splice(at, end - at + 1, next);
  return lines.join(eol);
}

// ---------- prod/index.md ----------

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const link = (id) => `[[${id}]]`;

function table(head, rows) {
  if (!rows.length) return '无\n';
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') + '\n';
}

/**
 * The four tables of `prod/index.md`, built from the archive's frontmatter, under the existing
 * frontmatter (kept verbatim — it holds the project's main viewport / theme / locale).
 */
export function renderIndex(archive, existing = null) {
  const m = existing?.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  const head = m ? m[0].replace(/\r\n/g, '\n').replace(/\n*$/, '\n') : '---\ntype: design-index\ntags: [design]\nsummary: 设计档案索引\n---\n';
  const used = computeUsedBy(archive);
  const pagesOf = (map, id) => (map.get(id) ?? []).map(link).join('、');
  const objs = (kind) => objectsOfKind(archive, kind).sort((a, b) => byId(a.id, b.id));

  const pages = objs('page').map((p) => [link(p.id), statesOfPage(archive, p.id).map((s) => s.id).sort(byId).map(link).join('、'), p.fm.summary]);
  const components = objs('component').map((o) => [link(o.id), pagesOf(used.components, o.id), o.fm.summary]);
  const motions = objs('motion').map((o) => [link(o.id), pagesOf(used.motions, o.id), o.fm.summary]);
  const journeys = objs('journey').map((j) => {
    const touched = new Set();
    for (const item of asList(j.fm.path)) {
      const s = archive.objects.get(wikilinkTarget(item && typeof item === 'object' ? item.state : item));
      const page = s && s.kind === 'state' ? pageOfState(s) : null;
      if (page) touched.add(page);
    }
    return [link(j.id), j.fm.intent, [...touched].sort(byId).map(link).join('、')];
  });

  return [
    head,
    '# 设计档案\n',
    '> 本文件由归档脚本生成，表体取自各对象的 frontmatter，不手工维护。',
    '',
    '## 页面\n',
    table(['页面', '状态', '说明'], pages),
    '## 组件\n',
    table(['组件', '用到它的页面', '说明'], components),
    '## 动效\n',
    table(['动效', '用到它的页面', '说明'], motions),
    '## 用户路径\n',
    table(['用户路径', '意图', '途经页面'], journeys),
  ].join('\n');
}

// ---------- links in the spec ----------

/** Targets of markdown links / images, outside fenced code: [{ line, target }]. */
function linkTargets(text) {
  const out = [];
  let fence = null;
  text.split('\n').forEach((line, i) => {
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (mark) {
      if (fence === null) fence = mark[1][0];
      else if (mark[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    for (const m of line.matchAll(LINK)) out.push({ line: i + 1, target: m[3] });
  });
  return out;
}
const LINK = /(!?\[[^\]]*\]\()(<?)([^)\s>]+)(>?)((?:\s+"[^"]*")?\))/g;

/** Repo-relative candidates a link target may mean: relative to the file's folder, or from the repo root. */
function candidates(specDir, target) {
  const path = decodeURI(target.split(/[#?]/)[0]);
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('#')) return [];
  if (path.startsWith('/')) return [{ path: ppath.normalize(path.slice(1)), style: 'absolute' }];
  return [{ path: ppath.normalize(ppath.join(specDir, path)), style: 'relative' }, { path: ppath.normalize(path), style: 'root' }];
}

/**
 * Point every link in `text` that resolves to a key of `moved` (old repo path → new repo path) at the
 * new place, keeping the link's own style (relative, from the repo root, or with a leading slash).
 * @returns {{ text: string, changes: { from: string, to: string }[] }}
 */
export function rewriteLinks(text, specDir, moved) {
  const changes = [];
  let fence = null;
  const out = text.split('\n').map((line) => {
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (mark) {
      if (fence === null) fence = mark[1][0];
      else if (mark[1][0] === fence) fence = null;
      return line;
    }
    if (fence !== null) return line;
    return line.replace(LINK, (whole, open, lt, target, gt, close) => {
      for (const c of candidates(specDir, target)) {
        const to = moved.get(c.path);
        if (!to) continue;
        const rest = target.slice(target.search(/[#?]|$/));
        const written = c.style === 'relative' ? ppath.relative(specDir, to) : c.style === 'absolute' ? `/${to}` : to;
        changes.push({ from: target, to: written + rest });
        return `${open}${lt}${written}${rest}${gt}${close}`;
      }
      return whole;
    });
  });
  return { text: out.join('\n'), changes };
}

// ---------- LFS and .gitignore ----------

/** One .gitattributes pattern → does it match this repo-relative path? */
function attrMatches(pattern, path) {
  let p = pattern;
  const anchored = p.includes('/') && !p.endsWith('/');
  p = p.replace(/^\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(anchored ? `^${re}$` : `(^|/)${re}$`).test(path);
}

/** Whether `.gitattributes` text routes a path through Git LFS (the last matching line that sets `filter` wins). */
export function lfsCovers(attributes, path) {
  let covered = false;
  for (const raw of String(attributes).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [pattern, ...attrs] = line.split(/\s+/);
    if (!attrs.some((a) => /^-?!?filter(=|$)/.test(a))) continue;
    if (!attrMatches(pattern, path)) continue;
    covered = attrs.includes('filter=lfs');
  }
  return covered;
}

/** Whether `.gitignore` text ignores `docs/design/tmp/`. */
export function ignoresTmp(gitignore) {
  return String(gitignore).split('\n').some((raw) => {
    const line = raw.trim().replace(/^\//, '').replace(/\/(\*\*?)?$/, '');
    return !raw.trim().startsWith('#') && !raw.trim().startsWith('!') && line === TMP;
  });
}

function repoHints(root) {
  const hints = [];
  const attrsFile = join(root, '.gitattributes');
  const attrs = existsSync(attrsFile) ? readFileSync(attrsFile, 'utf8') : '';
  const missing = LFS_EXTS.filter((ext) => !lfsCovers(attrs, `${PROD}/pages/x/assets/a.${ext}`));
  if (missing.length) {
    hints.push({
      kind: 'lfs',
      message: `.gitattributes 还没有用 Git LFS 管 ${PROD}/**/assets/ 下的 ${missing.join(' / ')}；要加这几行（脚本不代改）：\n${missing
        .map((ext) => `  ${PROD}/**/assets/**/*.${ext} filter=lfs diff=lfs merge=lfs -text`)
        .join('\n')}`,
    });
  }
  const ignoreFile = join(root, '.gitignore');
  if (!ignoresTmp(existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '')) {
    hints.push({ kind: 'gitignore', message: `.gitignore 还没有忽略 ${TMP}/；要加一行（脚本不代改）：\n  ${TMP}/` });
  }
  return hints;
}

// ---------- the plan ----------

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const sha = (p) => readFileSync(p);
const sameBytes = (a, b) => sha(a).equals(sha(b));

/**
 * Work out everything the archive would do, without touching the repository.
 * @returns {{ ok: false, stage: string, violations?: object[], errors?: string[] }
 *   | { ok: true, plan: object, summary: object, hints: object[] }}
 */
export function planArchive(root, slug) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) throw new UsageError(`spec 名「${slug}」不合法`);
  const tmpRel = `${TMP}/${slug}`;
  const tmpDir = join(root, tmpRel);
  if (!existsSync(tmpDir)) throw new UsageError(`没有 ${tmpRel}/：这个需求没有可归档的内容`);
  const deltaDir = join(tmpDir, 'delta');
  const hasDelta = existsSync(deltaDir);

  // 1 — validate (usedBy is regenerated below, so it is not judged yet)
  const checked = check(root, { delta: hasDelta ? slug : null, usedBy: false });
  if (checked.violations.length) return { ok: false, stage: '校验', violations: checked.violations };
  const archive = checked.archive;
  const delta = archive.delta ?? { added: [], changed: [], removed: [] };
  const prod = loadArchive(root);

  const copies = []; // { from: absolute, to: repo path }
  const writes = new Map(); // repo path → text
  const deletes = new Set(); // repo paths (files or folders)
  const errors = [];

  // 2 — delta over prod, removed.md out
  const removed = new Set(delta.removed);
  if (hasDelta) {
    for (const abs of walk(deltaDir)) {
      const rel = posix(relative(deltaDir, abs));
      if (rel === 'removed.md' || rel === 'index.md') continue;
      if (rel.endsWith('.md') && removed.has(basename(rel, '.md'))) continue;
      copies.push({ from: abs, to: `${PROD}/${rel}` });
    }
  }
  for (const id of [...removed].sort(byId)) {
    const o = prod.objects.get(id);
    if (!o) continue;
    deletes.add(o.kind === 'component' && basename(dirname(o.file)) === id ? posix(dirname(o.file)) : o.file);
  }
  // a page / component folder left without any object file goes entirely, assets with it
  const deletedFiles = new Set([...deletes]);
  for (const dir of new Set([...deletes].map((p) => (deletes.has(posix(dirname(p))) ? null : posix(dirname(p)))).filter(Boolean))) {
    const depth = dir.slice(PROD.length + 1).split('/').length;
    if (depth !== 2 || !dir.startsWith(`${PROD}/`) || !existsSync(join(root, dir))) continue;
    const left = readdirSync(join(root, dir)).filter((n) => n.endsWith('.md') && !deletedFiles.has(`${dir}/${n}`));
    const incoming = copies.some((c) => posix(dirname(c.to)) === dir && c.to.endsWith('.md'));
    if (!left.length && !incoming) deletes.add(dir);
  }

  // 3 — usedBy on every component and motion, then the index
  const used = computeUsedBy(archive);
  const usedByUpdated = [];
  for (const o of [...archive.objects.values()].sort((a, b) => byId(a.id, b.id))) {
    if (o.kind !== 'component' && o.kind !== 'motion') continue;
    const want = (o.kind === 'component' ? used.components : used.motions).get(o.id) ?? [];
    const have = asList(o.fm.usedBy).map(wikilinkTarget);
    if (Array.isArray(o.fm.usedBy) && have.every(Boolean) && sameSet(have, want)) continue;
    const target = o.source === 'delta' ? o.file.replace(`${tmpRel}/delta/`, `${PROD}/`) : o.file;
    writes.set(target, setUsedBy(readFileSync(join(root, o.file), 'utf8'), want));
    usedByUpdated.push(o.id);
  }
  const indexFile = join(root, PROD, 'index.md');
  const indexText = renderIndex(archive, existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : null);
  writes.set(`${PROD}/index.md`, indexText);

  // 4 — interaction figures
  const specRel = `docs/spec/${slug}/${slug}.md`;
  const specDir = posix(dirname(specRel));
  const specText = existsSync(join(root, specRel)) ? readFileSync(join(root, specRel), 'utf8') : null;
  const canvasRel = `${tmpRel}/canvas/`;
  const figures = new Set();
  if (existsSync(join(tmpDir, 'canvas'))) {
    for (const abs of walk(join(tmpDir, 'canvas'))) {
      if (FIGURE.test(abs) && basename(dirname(abs)) === 'flows') figures.add(posix(relative(root, abs)));
    }
  }
  if (specText) {
    for (const { target } of linkTargets(specText)) {
      for (const c of candidates(specDir, target)) {
        if (c.path.startsWith(canvasRel) && FIGURE.test(c.path) && existsSync(join(root, c.path))) figures.add(c.path);
      }
    }
  }
  const stateIds = objectsOfKind(archive, 'state').map((s) => s.id).sort((a, b) => b.length - a.length || byId(a, b));
  const deltaIds = [...delta.added, ...delta.changed].sort(byId);
  const kindOf = (id) => archive.objects.get(id)?.kind;
  const fallback =
    deltaIds.find((id) => kindOf(id) === 'page') ?? pageOfState(archive.objects.get(deltaIds.find((id) => kindOf(id) === 'state')) ?? { fm: {}, id: '' });
  const moved = new Map();
  const placed = [];
  const taken = new Map();
  for (const from of [...figures].sort(byId)) {
    const name = basename(from);
    const stem = name.replace(/\.[^.]+$/, '');
    const state = stateIds.find((id) => stem.includes(id));
    const page = state ? pageOfState(archive.objects.get(state)) : fallback;
    if (!page || !archive.objects.has(page)) {
      errors.push(`交互图 ${from} 对应不上任何页面，delta 里也没有页面或状态可以放它`);
      continue;
    }
    const to = `${PROD}/pages/${page}/assets/flows/${name}`;
    if (taken.has(to)) errors.push(`交互图 ${from} 与 ${taken.get(to)} 同名，归档后会落到同一个位置 ${to}；改其中一个的文件名`);
    else taken.set(to, from);
    if (existsSync(join(root, to)) && !sameBytes(join(root, from), join(root, to))) {
      errors.push(`${to} 已经存在且内容不同：${from} 会盖掉它；改交互图的文件名再归档`);
    }
    moved.set(from, to);
    copies.push({ from: join(root, from), to });
    placed.push({ from, to, page, reason: state ? `对应状态 ${state}` : `文件名里没有状态 id，放进 delta 里的第一个页面 ${page}` });
  }
  if (errors.length) return { ok: false, stage: '归档', errors };

  let linkChanges = [];
  if (specText && moved.size) {
    const r = rewriteLinks(specText, specDir, moved);
    linkChanges = r.changes;
    if (r.changes.length) writes.set(specRel, r.text);
  }
  // 5 — repo hints
  const hints = repoHints(root);
  if (specText) {
    // links into the scratch area that are not archived would dangle once tmp/ is emptied
    const after = writes.get(specRel) ?? specText;
    const stray = linkTargets(after).filter(({ target }) => candidates(specDir, target).some((c) => c.path.startsWith(`${tmpRel}/`)));
    if (stray.length) {
      hints.push({ kind: 'dangling', message: `spec 里还有 ${stray.length} 处链接指向 ${tmpRel}/ 里不会被归档的文件，清空后会断：${[...new Set(stray.map((x) => x.target))].join('、')}` });
    }
  }
  if (!archive.index || ['viewport', 'theme', 'locale'].some((k) => !archive.index[k])) {
    hints.push({ kind: 'index', message: `${PROD}/index.md 的 frontmatter 还没有定主视口 / 主题 / 语言（viewport / theme / locale）；项目定一次，截图按它拍` });
  }

  return {
    ok: true,
    plan: { tmp: tmpRel, copies, writes, deletes: [...deletes].sort(byId) },
    summary: {
      slug,
      added: [...delta.added],
      changed: [...delta.changed],
      removed: [...delta.removed],
      usedBy: usedByUpdated,
      figures: placed,
      specLinks: linkChanges.map((c) => ({ file: specRel, ...c })),
    },
    hints,
  };
}

// ---------- applying a plan ----------

/**
 * Apply a plan to a repository root. With `placeholder`, binary files are created empty (the
 * throw-away copy used for the full re-validation only needs their names).
 */
export function applyPlan(root, plan, { placeholder = false } = {}) {
  const abs = (rel) => join(root, rel);
  for (const rel of plan.deletes) rmSync(abs(rel), { recursive: true, force: true });
  for (const { from, to } of plan.copies) {
    mkdirSync(dirname(abs(to)), { recursive: true });
    if (placeholder && !to.endsWith('.md')) writeFileSync(abs(to), '');
    else copyFileSync(from, abs(to));
  }
  for (const [rel, text] of plan.writes) {
    mkdirSync(dirname(abs(rel)), { recursive: true });
    writeFileSync(abs(rel), text);
  }
}

/** A copy of `docs/` (minus the scratch area) that is cheap: text files real, everything else empty. */
function stageDocs(root) {
  const stage = mkdtempSync(join(tmpdir(), 'design-archive-stage-'));
  const docs = join(root, 'docs');
  const skip = (p) => posix(relative(root, p)) === TMP;
  for (const file of walk(docs, skip)) {
    const to = join(stage, relative(root, file));
    mkdirSync(dirname(to), { recursive: true });
    if (file.endsWith('.md')) copyFileSync(file, to);
    else writeFileSync(to, '');
  }
  mkdirSync(join(stage, 'docs'), { recursive: true });
  return stage;
}

/**
 * Archive one requirement.
 * @param {{ dryRun?: boolean }} [opts]
 */
export function archiveSpec(root, slug, { dryRun = false } = {}) {
  const planned = planArchive(root, slug);
  if (!planned.ok) return planned;
  const { plan, summary, hints } = planned;

  const stage = stageDocs(root);
  let after;
  try {
    applyPlan(stage, plan, { placeholder: true });
    after = check(stage);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  if (after.violations.length) return { ok: false, stage: '归档后复核', violations: after.violations };

  if (!dryRun) {
    applyPlan(root, plan);
    rmSync(join(root, plan.tmp), { recursive: true, force: true });
  }
  return { ok: true, dryRun, summary, hints };
}

// ---------- command line ----------

export function renderSummary(result) {
  const lines = [];
  if (!result.ok) {
    lines.push(`拒绝归档（${result.stage}）：什么都没写。`);
    for (const x of result.violations ?? []) lines.push(formatViolation(x));
    for (const e of result.errors ?? []) lines.push(`冲突：${e}`);
    return lines.join('\n');
  }
  const s = result.summary;
  lines.push(result.dryRun ? `dry-run：${s.slug} 可以归档，没有写任何文件。归档会做：` : `已归档 ${s.slug}：`);
  const list = (label, ids) => lines.push(`${label}：${ids.length ? ids.join('、') : '无'}`);
  list('新增', s.added);
  list('改动', s.changed);
  list('删除', s.removed);
  list('usedBy 重新生成', s.usedBy);
  lines.push(`${PROD}/index.md：重新生成`);
  lines.push(s.figures.length ? '交互图：' : '交互图：无');
  for (const f of s.figures) lines.push(`  ${f.from} → ${f.to}（${f.reason}）`);
  lines.push(s.specLinks.length ? 'spec 链接改写：' : 'spec 链接改写：无');
  for (const c of s.specLinks) lines.push(`  ${c.file}：${c.from} → ${c.to}`);
  lines.push(result.dryRun ? `${TMP}/${s.slug}/：不动（dry-run）` : `${TMP}/${s.slug}/：已清空`);
  for (const h of result.hints) lines.push(`提示：${h.message}`);
  return lines.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));
  const unknown = [...flags].filter((f) => f !== '--dry-run' && f !== '--json');
  if (positional.length !== 2 || unknown.length) {
    console.error('用法：node design-archive-write.mjs <repo-root> <spec-slug> [--dry-run] [--json]');
    return 2;
  }
  const root = resolve(positional[0]);
  if (!existsSync(join(root, 'docs'))) {
    console.error(`${root} 下没有 docs/：这不是目标仓库的根`);
    return 2;
  }
  let result;
  try {
    result = archiveSpec(root, positional[1], { dryRun: flags.has('--dry-run') });
  } catch (e) {
    if (e instanceof UsageError || /^没有 /.test(e.message)) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
  if (flags.has('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderSummary(result));
  }
  return result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv));
