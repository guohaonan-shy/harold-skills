#!/usr/bin/env node
/**
 * The only place seo-scan writes GitHub: turns one run's findings into issues. A new issue carries no
 * status:* label, so it simply is 待验证 and issue-dispatch hands it out like any other; its body
 * carries the evidence and how to reproduce it, because the issue session re-runs that independently.
 *
 *   reject  — no evidence, no repro, empty acceptance, or a percentage without numerator/denominator;
 *             rejected findings only go back in the result (seo-scan writes them to the research log)
 *   merge   — findings with the same direction + kind become one issue listing every target
 *   dedupe  — an open issue whose body carries the same hidden marker gets a comment with this run's
 *             data and the new targets instead of a second issue
 *   classify — `type:seo/<direction>` through issues.mjs's categories; when the project has no `seo`
 *             category the issue is still created and the result says so (`untyped`)
 *
 * There is no cap on the number of issues: issue-dispatch limits how many sessions run at once.
 *
 * Usage: node seo-issues.mjs <docs> <findings.json> [--dry-run]
 *   → { "created": [{number,title}], "commented": [{number,title}], "rejected": [{title,reason}], "untyped": bool }
 *   (--dry-run: the same shape, numbers null, nothing written)
 * Exit: 0 = done, 1 = bad input / gh error (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { defaultGh, readTypes, setTypes, typeSet } from './issues.mjs';
import { DIRECTIONS } from './seo-md.mjs';

export const DIRECTION_NAMES = {
  technical: '技术 SEO 与索引',
  pages: '已有页面优化',
  keywords: '关键词挖掘与新内容',
  backlinks: '外链',
  geo: 'AI 搜索可见性',
};

export const marker = (f) => `<!-- seo-finding: ${f.direction}/${f.kind} -->`;
const KIND_RE = /^[\p{Ll}\p{Lo}\p{Nd}]+(-[\p{Ll}\p{Lo}\p{Nd}]+)*$/u;
const MARKER_RE = /<!-- seo-finding: ([a-z]+\/[^\s>]+) -->/u;

const text = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const filled = (v) => text(v).trim().length > 0;

/** Why a finding cannot become an issue, or null. */
export function rejection(f) {
  if (!DIRECTIONS.includes(f.direction)) return `方向「${f.direction}」不认识`;
  if (!KIND_RE.test(String(f.kind ?? ''))) return `kind「${f.kind ?? ''}」不是连字符连起来的短名（小写字母、数字、中文）`;
  if (!filled(f.title)) return '缺 title';
  const ev = f.evidence;
  if (!ev || (typeof ev === 'object' ? !(filled(ev.what) && filled(ev.values)) : !filled(ev))) return '缺证据（查了什么、拿回什么）';
  if (!filled(f.repro)) return '缺复现方法';
  if (!Array.isArray(f.acceptance) || !f.acceptance.some(filled)) return '缺验收标准';
  const prose = [f.title, text(ev), f.fix, ...(f.acceptance ?? [])].join(' ');
  if (/\d\s*%|百分之/.test(prose) && !(Number.isFinite(f.ratio?.numerator) && Number.isFinite(f.ratio?.denominator))) return '用了百分比却没给分子分母（ratio）';
  return null;
}

const uniq = (xs) => [...new Set(xs.filter(filled).map((x) => String(x).trim()))];

/** Findings grouped by direction + kind, in first-seen order. */
export function merge(findings) {
  const groups = new Map();
  for (const f of findings) {
    const k = `${f.direction}/${f.kind}`;
    if (!groups.has(k)) groups.set(k, { ...f, targets: [], evidences: [], repros: [], acceptance: [], assumptions: [] });
    const g = groups.get(k);
    g.targets = uniq([...g.targets, ...(f.targets ?? [])]);
    g.evidences.push(f.evidence);
    g.repros = uniq([...g.repros, f.repro]);
    g.acceptance = uniq([...g.acceptance, ...(f.acceptance ?? [])]);
    g.assumptions = uniq([...g.assumptions, ...(f.assumptions ?? [])]);
  }
  return [...groups.values()];
}

const evidenceLine = (ev) =>
  typeof ev === 'object' && ev ? `- ${[ev.when, ev.what].filter(filled).join(' · ')}：${text(ev.values)}` : `- ${text(ev)}`;
const ratioLine = (r) => (r ? `\n比例：${r.numerator} / ${r.denominator}` : '');
const list = (xs) => xs.map((x) => `- ${x}`).join('\n');

export const issueTitle = (g) => `SEO（${DIRECTION_NAMES[g.direction]}）：${g.title}`;

export function issueBody(g) {
  const parts = [
    `## 问题\n\n${g.title}\n\n受影响的${g.targets.length} 处：\n\n${list(g.targets)}`,
    `## 证据\n\n${g.evidences.map(evidenceLine).join('\n')}${ratioLine(g.ratio)}`,
    `## 怎么复现\n\n${g.repros.join('\n\n')}`,
    `## 建议的修法\n\n${text(g.fix) || '需要诊断'}`,
    `## 验收标准\n\n${g.acceptance.map((a) => `- [ ] ${a}`).join('\n')}`,
  ];
  if (g.assumptions.length) parts.push(`## 扫描时的假设\n\n无人值守时代替提问用的默认值，审核时核一下：\n\n${list(g.assumptions)}`);
  if (g.content) {
    const c = g.content;
    parts.push(
      `## 审核阶段\n\n内容类：目标词「${text(c.keyword)}」，页面类型「${text(c.pageType)}」，${c.mode === 'update' ? '改已有页' : '新开页'}。起草 spec 时用 \`idea-loop:seo-brief\` 写「方案」；spec 标题下第一行写「> 需要 grill：选题角度和论点」，由人定。实现阶段用 \`idea-loop:seo-writing\` 按 brief 写。`,
    );
  }
  if (g.direction === 'backlinks') parts.push('## 实现阶段\n\n用 `idea-loop:seo-outreach` 起草邮件和跟进表，产出只改 `docs/` 的 PR。邮件由人发送，任何会话都不发。');
  parts.push(`---\n由 \`idea-loop:seo-scan\` 提出。\n\n${marker(g)}`);
  return parts.join('\n\n');
}

export function commentBody(g, known) {
  const fresh = g.targets.filter((t) => !known.includes(t));
  return [
    `\`idea-loop:seo-scan\` 本次又发现了同一个问题。`,
    `**本次证据**\n\n${g.evidences.map(evidenceLine).join('\n')}${ratioLine(g.ratio)}`,
    fresh.length ? `**新增的受影响处**\n\n${list(fresh)}` : '受影响处没有新增。',
  ].join('\n\n');
}

/** What to do with a run's findings, given the open issues ({ number, title, body }). */
export function plan(findings, openIssues) {
  const rejected = [];
  const ok = [];
  for (const f of findings) {
    if (f && f.uncollected !== undefined) continue;
    const why = rejection(f ?? {});
    if (why) rejected.push({ title: text(f?.title) || '(无标题)', reason: why });
    else ok.push(f);
  }
  const byMarker = new Map();
  for (const i of openIssues) {
    const m = String(i.body ?? '').match(MARKER_RE);
    if (m && !byMarker.has(m[1])) byMarker.set(m[1], i);
  }
  const create = [];
  const comment = [];
  for (const g of merge(ok)) {
    const hit = byMarker.get(`${g.direction}/${g.kind}`);
    if (hit) comment.push({ number: hit.number, title: hit.title, body: commentBody(g, String(hit.body ?? '')) });
    else create.push({ direction: g.direction, title: issueTitle(g), body: issueBody(g) });
  }
  return { create, comment, rejected };
}

function openIssues(gh) {
  return JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '1000', '--json', 'number,title,body']));
}

export function apply(gh, types, p) {
  let untyped = false;
  const created = [];
  for (const c of p.create) {
    const url = gh(['issue', 'create', '--title', c.title, '--body', c.body]).trim();
    const number = Number(url.match(/(\d+)\s*$/)?.[1]);
    created.push({ number, title: c.title });
    try {
      typeSet(types, [`seo/${c.direction}`]);
      setTypes(gh, types, number, [`seo/${c.direction}`]);
    } catch {
      untyped = true;
    }
  }
  for (const c of p.comment) gh(['issue', 'comment', String(c.number), '--body', c.body]);
  return { created, commented: p.comment.map(({ number, title }) => ({ number, title })), rejected: p.rejected, untyped };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [docs, file, flag] = process.argv.slice(2);
    if (!docs || !file || (flag && flag !== '--dry-run')) throw new Error('usage: seo-issues.mjs <docs> <findings.json> [--dry-run]');
    const findings = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(findings)) throw new Error(`${file} 不是发现清单（要一个 JSON 数组）`);
    const gh = defaultGh(docs);
    const types = readTypes(docs);
    const p = plan(findings, openIssues(gh));
    if (flag === '--dry-run') {
      let untyped = false;
      try {
        typeSet(types, ['seo']);
      } catch {
        untyped = true;
      }
      console.log(JSON.stringify({ created: p.create.map((c) => ({ number: null, title: c.title })), commented: p.comment.map(({ number, title }) => ({ number, title })), rejected: p.rejected, untyped }, null, 2));
    } else console.log(JSON.stringify(apply(gh, types, p), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
