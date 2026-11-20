#!/usr/bin/env node
/**
 * Which "title / description changed" findings were somebody's deliberate change. seo-baseline.mjs
 * reports a key page whose title or description differs between two audits; most of the time a merged
 * SEO PR did it. This script finds out mechanically: for each changed page, every new string (the title
 * and/or the description the current audit saw) is searched for in the repo's history (`git log -S`);
 * the commit that added it is mapped to the PR that brought it onto the main line, and if that PR was
 * merged after the earlier audit and no later than the current one, the page is deliberate. A page with
 * two changed strings is deliberate only when both have such a PR.
 *
 * The window is the PR's *merge* time, not the commit's authored time: a branch commit written before
 * the earlier audit still went live when it merged. A PR is named by a `Merge pull request #N` merge
 * commit, or by a `(#N)` suffix on the subject of a squash-merged commit on the main line. A direct
 * push with no PR number is not a provenance. Strings are matched as written in the added source lines,
 * so a title the source escapes differently from what the page renders (`&amp;`, `\"`) is not found and
 * stays a finding, which is the safe side.
 *
 * Input: the repo, the two `get_audit_pages` files seo-baseline.mjs read (previous first), the findings
 * JSON (an array) seo-baseline.mjs printed, and the two audits' completion times (`completedAt` from
 * `list_site_audits`). `--branch=<ref>` is the main line (default: the remote's default branch when
 * the repo knows it, else HEAD); fetch first if the checkout may be behind.
 *
 * Usage: node seo-meta-provenance.mjs <repo> <previous.json> <current.json> <findings.json> <since> <until> [--branch=<ref>]
 *   → { "findings": [...], "intentional": [{ "url", "prs", "commit" }], "log": "有意改动：<页面> → #<PR>；…" | null }
 *   findings is the input with every deliberate page taken out of its `key-page-meta-changed` finding
 *   (rebuilt for the pages that are left, dropped when none is); other findings pass through untouched.
 * Exit: 0 = judged, 1 = unreadable input or not a git repo (reason on stderr).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { key, metaChangedFinding, pageChanges } from './seo-baseline.mjs';

const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** The remote's default branch if the repo knows it, else HEAD. */
function mainLine(repo) {
  try {
    return git(repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').trim();
  } catch {
    return 'HEAD';
  }
}

/** The newest commit on `branch` that added `text` on a line of its own diff, or null. */
function introducedBy(repo, branch, text) {
  if (!text) return null;
  const shas = git(repo, 'log', branch, `-S${text}`, '--format=%H').split('\n').filter(Boolean);
  for (const sha of shas) {
    const patch = git(repo, 'show', '--format=', '--unified=0', sha);
    if (patch.split('\n').some((l) => l.startsWith('+') && !l.startsWith('+++') && l.includes(text))) return sha;
  }
  return null;
}

/** { pr, at } of the PR that put `sha` on the main line, or null. */
function prOf(repo, branch, sha, firstParent) {
  const subjectOf = (line) => {
    const [at, ...rest] = line.split('\t');
    return { at, subject: rest.join('\t') };
  };
  if (firstParent.has(sha)) {
    const { at, subject } = subjectOf(git(repo, 'log', '-1', '--format=%cI%x09%s', sha).trim());
    const m = subject.match(/\(#(\d+)\)\s*$/);
    return m ? { pr: Number(m[1]), at } : null;
  }
  const first = git(repo, 'log', '--merges', '--first-parent', '--ancestry-path', '--reverse', '--format=%cI%x09%s', `${sha}..${branch}`).split('\n').find(Boolean);
  if (!first) return null;
  const { at, subject } = subjectOf(first);
  const m = subject.match(/^Merge pull request #(\d+)/);
  return m ? { pr: Number(m[1]), at } : null;
}

export function judge({ repo, previous, current, findings, since, until, branch }) {
  const line = branch ?? mainLine(repo);
  git(repo, 'rev-parse', '--git-dir'); // not a repo → throws, the CLI reports it
  const firstParent = new Set(git(repo, 'rev-list', '--first-parent', line).split('\n').filter(Boolean));
  const from = Date.parse(since);
  const to = Date.parse(until);
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('since / until 要是 ISO 时间（list_site_audits 的 completedAt）');
  const prev = new Map((previous.pages ?? []).map((p) => [key(p.url), p]));
  const cur = new Map((current.pages ?? []).map((p) => [key(p.url), p]));

  /** { prs, commit } when every changed string on this page came in through a PR merged inside the window. */
  const deliberate = (url) => {
    const p = prev.get(url);
    const c = cur.get(url);
    if (!p || !c) return null;
    const strings = [];
    if (p.title !== c.title) strings.push(c.title);
    if (p.metaDescription !== c.metaDescription) strings.push(c.metaDescription);
    if (!strings.length) return null;
    const prs = [];
    let commit = null;
    for (const text of strings) {
      const sha = introducedBy(repo, line, text);
      const pr = sha && prOf(repo, line, sha, firstParent);
      const at = pr && Date.parse(pr.at);
      if (!pr || !(at > from && at <= to)) return null;
      commit ??= sha;
      if (!prs.includes(pr.pr)) prs.push(pr.pr);
    }
    return { prs, commit };
  };

  const intentional = [];
  const out = [];
  for (const f of findings) {
    if (f.kind !== 'key-page-meta-changed' || f.direction !== 'technical') {
      out.push(f);
      continue;
    }
    const rows = [];
    for (const url of f.targets.map(key)) {
      const hit = deliberate(url);
      if (hit) intentional.push({ url, ...hit });
      else rows.push({ url, lines: pageChanges(prev.get(url), cur.get(url)).warning });
    }
    if (rows.length === f.targets.length) out.push(f);
    else if (rows.length) out.push(metaChangedFinding(rows, previous, current));
  }
  const log = intentional.length ? `有意改动：${intentional.map((i) => `${i.url} → ${i.prs.map((n) => `#${n}`).join('、')}`).join('；')}` : null;
  return { findings: out, intentional, log };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
    const [repo, a, b, f, since, until] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (!repo || !a || !b || !f || !since || !until)
      throw new Error('usage: seo-meta-provenance.mjs <仓库> <上一次.json> <本次.json> <发现.json> <上一次审计完成时间> <本次审计完成时间> [--branch=<ref>]');
    const branch = flags.find((x) => x.startsWith('--branch='))?.slice('--branch='.length);
    const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
    const findings = read(f);
    if (!Array.isArray(findings)) throw new Error('发现文件要是一个 JSON 数组');
    console.log(JSON.stringify(judge({ repo, previous: read(a), current: read(b), findings, since, until, branch }), null, 2));
  } catch (e) {
    console.error(String(e.stderr || e.message).trim());
    process.exit(1);
  }
}
