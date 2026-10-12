#!/usr/bin/env node
/**
 * pr-inbox scan — which open PRs have a command from Harold that Claude has not answered yet.
 *
 * Harold works asynchronously: he delegates in the evening and answers on GitHub during the day,
 * often across several PRs. A local routine runs pr-inbox every 15 minutes; this script is its
 * first step and the only thing that runs when there is nothing to do, so an idle run costs a few
 * API reads and ends.
 *
 * A command is a message in one of idea-loop's own threads (pr-thread.mjs: pause or review) that
 * came after Claude last spoke there, written by one of the configured commanders. Anyone else's
 * message is reported as ignored, never acted on — on a public repository anybody can comment.
 * "After Claude last spoke" is the whole state: nothing is stored, so a run that was skipped, a
 * catch-up run after the laptop slept, or two scans in a row see the same thing and never repeat
 * work that was already answered.
 *
 * For each PR it also says where to work: an existing worktree that already has the PR's branch
 * checked out (it keeps the .tmp/ state implement left there), or none, in which case pr-inbox
 * creates one.
 *
 * Project-scoped, no config file: one routine per project, its working folder the project's
 * checkout. The repository is that checkout's `origin`; the commanders are the account gh is logged
 * in as (the human's own), plus any `--commander` given in the routine's instruction. Who may
 * command never goes into git. A user-scoped inbox across projects may come later.
 *
 * Deterministic core (inboxThreads, worktreeFor, repoFromRemote) is pure and unit-tested.
 *
 * Usage:  node pr-inbox.mjs scan [--commander <login>]...      (run inside the project's checkout)
 * Output: JSON { repo, checkout, commanders, items: [{ pr, title, url, head, worktree, threads: [...] }],
 *                ignored: [{ pr, rootId, author, at }] }
 * Exit:   0 = scanned, 1 = usage / API error, 3 = not inside a git checkout with a GitHub origin.
 */

import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ghApi } from './github-app.mjs';
import { pending, thread, threads } from './pr-thread.mjs';

/** owner/repo from a GitHub remote URL (https or ssh); null for anything else. */
export function repoFromRemote(url) {
  const m = String(url ?? '').trim().match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * idea-loop threads on one PR with commands still unanswered, split into what a commander said
 * (acted on) and what anyone else said (ignored).
 */
export function inboxThreads(comments, resolved, commanders) {
  const allowed = new Set(commanders.map((c) => c.toLowerCase()));
  const roots = Object.values(threads(comments)).flat();
  const act = [];
  const ignored = [];
  for (const root of roots) {
    const t = thread(root.rootId, comments);
    const said = pending(t);
    const mine = said.filter((m) => allowed.has(String(m.author).toLowerCase()));
    for (const m of said.filter((x) => !mine.includes(x))) ignored.push({ rootId: root.rootId, author: m.author, at: m.at });
    if (mine.length) {
      act.push({ rootId: root.rootId, url: root.url, kind: root.kind, round: root.round, resolved: resolved.get(root.rootId) ?? false, pending: mine });
    }
  }
  return { act, ignored };
}

/** The worktree that has `branch` checked out, from `git worktree list --porcelain`. */
export function worktreeFor(porcelain, branch) {
  for (const block of String(porcelain).split(/\n\s*\n/)) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (path && block.split('\n').includes(`branch refs/heads/${branch}`)) return path;
  }
  return null;
}

// ---------- gh / git boundary ----------

function resolvedById(repo, pr) {
  const [owner, name] = repo.split('/');
  const query = `query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved comments(first:1){nodes{databaseId}}}}}}}`;
  const res = ghApi('POST', 'graphql', { query, variables: { owner, name, pr: Number(pr) } });
  return new Map(res.data.repository.pullRequest.reviewThreads.nodes.map((t) => [t.comments.nodes[0]?.databaseId, t.isResolved]));
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function scan(extraCommanders) {
  let repo;
  let checkout;
  try {
    repo = repoFromRemote(git('remote', 'get-url', 'origin'));
    checkout = dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir')); // the main checkout, even from a worktree
  } catch {
    repo = null;
  }
  if (!repo) {
    console.error('not inside a git checkout whose origin is on GitHub — run pr-inbox from the project root (skills/pr-inbox/SKILL.md §1)');
    process.exit(3);
  }
  const commanders = [ghApi('GET', 'user').login, ...extraCommanders];
  const porcelain = git('-C', checkout, 'worktree', 'list', '--porcelain');
  const out = { repo, checkout, commanders, items: [], ignored: [] };
  for (const p of ghApi('GET', `repos/${repo}/pulls?state=open&per_page=100`, null, true).flat()) {
    const comments = ghApi('GET', `repos/${repo}/pulls/${p.number}/comments?per_page=100`, null, true).flat();
    if (!comments.some((c) => /<!-- idea-loop-thread /.test(c.body ?? ''))) continue;
    const { act, ignored } = inboxThreads(comments, resolvedById(repo, p.number), commanders);
    out.ignored.push(...ignored.map((i) => ({ pr: p.number, ...i })));
    if (act.length) out.items.push({ pr: p.number, title: p.title, url: p.html_url, head: p.head.ref, worktree: worktreeFor(porcelain, p.head.ref), threads: act });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const extra = rest.flatMap((a, i) => (a === '--commander' && rest[i + 1] ? [rest[i + 1]] : []));
  if (cmd !== 'scan' || rest.length !== extra.length * 2) {
    console.error('usage: node pr-inbox.mjs scan [--commander <login>]...');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(scan(extra), null, 2));
  } catch (error) {
    console.error(String(error.stderr || error.message).trim());
    process.exit(1);
  }
}
