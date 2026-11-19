#!/usr/bin/env node
/**
 * The record a passed post-deploy check leaves on its issue, and the way back to it. seo-live-check.mjs
 * says the live pages are right; the comment `body` makes of that result is what the issue keeps: a few
 * lines for a person and a hidden marker holding the URLs, their target words, the merge date and the
 * four results. There is no separate ledger: the list of what SEO changed and when is these comments,
 * and `list` reads it back from the closed `type:seo` issues (the effect report starts from it).
 *
 * The marker is one line, `<!-- seo-live-check: {json} -->`; the JSON has `<` and `>` escaped, so no
 * value (a target word with `-->` in it) can end the comment early.
 *
 * Usage:
 *   node seo-live-record.mjs body <result.json> --merged=<YYYY-MM-DD> [--pr=<n>]   → the comment body (post it with `issues.mjs note`, which adds the 🤖 idea-loop： prefix); exit 1 unless the check passed
 *   node seo-live-record.mjs list <docs> [--since=<YYYY-MM-DD>]   → JSON: [{ issue, title, url, keyword, mergedOn, status, noindex, meta, sitemap }], one row per URL, oldest issue first
 *   node seo-live-record.mjs from-rollback <docs> <issue>   → JSON: { issue, fromRollback }: whether the issue's body carries the sentence every rollback-opened issue carries, i.e. a failed check on it is the second failure
 * Exit: 0 = done, 1 = bad input / gh error (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { defaultGh } from './issues.mjs';
import { ITEMS } from './seo-live-check.mjs';

/**
 * The sentence in the body of every issue a failed check opened after a rollback. A change that is rolled back,
 * redone and fails again points at something the change did not cause (a site that was `noindex` all along), so a
 * failed check on an issue whose body carries it is rolled back too but goes to the human, not back to the queue.
 */
export const ROLLBACK_LINE = '由上线自查回滚而来';

const MARKER_RE =/<!-- seo-live-check: (\{.*?\}) -->/gs;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `{ mergedOn, pages: [{ url, keyword, status, noindex, meta, sitemap }] }` from a passed check result. */
export function recordOf(result, mergedOn) {
  if (result?.verdict !== 'pass') throw new Error('只有全过的自查结果才留记录（未上线、失败的不是一次上线的改动）');
  if (!DATE_RE.test(String(mergedOn))) throw new Error(`合并日期「${mergedOn}」不是 YYYY-MM-DD`);
  return {
    mergedOn,
    pages: result.pages.map((p) => ({ url: p.url, keyword: p.keyword ?? null, ...Object.fromEntries(ITEMS.map((k) => [k, p[k].ok === true])) })),
  };
}

export const marker = (record) => `<!-- seo-live-check: ${JSON.stringify(record).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')} -->`;

/** Every record in a text, in order; markers that are not JSON are skipped. */
export function parseMarkers(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(MARKER_RE)) {
    try {
      const rec = JSON.parse(m[1]);
      if (rec && Array.isArray(rec.pages)) out.push(rec);
    } catch {
      /* not ours */
    }
  }
  return out;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The comment for a passed check: a table for a person, the marker for the scripts. `pr` is the merged PR's number. */
export function commentBody(result, { mergedOn, pr } = {}) {
  const rec = recordOf(result, mergedOn);
  const lines = [
    `上线自查：全过（${rec.pages.length} 个网址，合并日 ${mergedOn}${pr ? `，PR #${pr}` : ''}）`,
    '',
    '| 网址 | 目标词 | 能打开 | 没有 noindex | title 与 description 同产物 | 在 sitemap 里 |',
    '|---|---|---|---|---|---|',
    ...rec.pages.map((p) => `| ${cell(p.url)} | ${cell(p.keyword ?? '')} | ${ITEMS.map((k) => (p[k] ? '✓' : '✗')).join(' | ')} |`),
    '',
    marker(rec),
  ];
  return lines.join('\n');
}

/** The changes recorded in issues' comments ({ number, title, comments: [{ body }] }), one row per URL. */
export function liveChanges(issues, { since = null } = {}) {
  const rows = [];
  for (const issue of issues) {
    for (const c of issue.comments ?? []) {
      for (const rec of parseMarkers(c.body)) {
        if (since && String(rec.mergedOn) < since) continue;
        for (const p of rec.pages) rows.push({ issue: issue.number, title: issue.title, url: p.url, keyword: p.keyword ?? null, mergedOn: rec.mergedOn, status: p.status, noindex: p.noindex, meta: p.meta, sitemap: p.sitemap });
      }
    }
  }
  return rows;
}

/** The closed `type:seo` issues with their comments, oldest first. */
export function closedSeoIssues(gh) {
  const issues = JSON.parse(gh(['issue', 'list', '--state', 'closed', '--label', 'type:seo', '--limit', '1000', '--json', 'number,title,comments']));
  return issues.sort((a, b) => a.number - b.number);
}

/** Whether an issue body carries `ROLLBACK_LINE`. */
export const cameFromRollback = (body) => String(body ?? '').includes(ROLLBACK_LINE);

/** Whether issue #n (a GitHub issue number) came from a rollback; throws when its body cannot be read. */
export function fromRollback(gh, n) {
  if (!/^\d+$/.test(String(n))) throw new Error(`「${n}」不是 issue 号，读不到正文`);
  return cameFromRollback(JSON.parse(gh(['issue', 'view', String(n), '--json', 'body'])).body);
}

const flag = (args, name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    const [cmd, target, issueArg] = args.filter((a) => !a.startsWith('--'));
    if (cmd === 'body' && target) {
      const pr = flag(args, 'pr');
      console.log(commentBody(JSON.parse(readFileSync(target, 'utf8')), { mergedOn: flag(args, 'merged'), pr: pr ? Number(pr) : undefined }));
    } else if (cmd === 'list' && target) {
      const since = flag(args, 'since');
      if (since !== undefined && !DATE_RE.test(since)) throw new Error('--since 要 YYYY-MM-DD');
      console.log(JSON.stringify(liveChanges(closedSeoIssues(defaultGh(target)), { since }), null, 2));
    } else if (cmd === 'from-rollback' && target && issueArg) {
      console.log(JSON.stringify({ issue: Number(issueArg), fromRollback: fromRollback(defaultGh(target), issueArg) }));
    } else throw new Error('usage: seo-live-record.mjs body <result.json> --merged=<YYYY-MM-DD> [--pr=<n>] | list <docs> [--since=<YYYY-MM-DD>] | from-rollback <docs> <issue>');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
