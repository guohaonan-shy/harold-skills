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
 * Config: ~/.idea-loop/inbox.json
 *   { "commanders": ["<github login>"], "repos": { "<owner/repo>": { "checkout": "<abs path of a local clone>" } } }
 *
 * Deterministic core (inboxThreads, worktreeFor, readConfig) is pure and unit-tested.
 *
 * Usage:  node pr-inbox.mjs scan [--config <path>]
 * Output: JSON { items: [{ repo, pr, title, url, head, checkout, worktree, threads: [...] }],
 *                ignored: [{ repo, pr, rootId, author, at }], errors: [{ repo, error }] }
 * Exit:   0 = scanned, 1 = usage / API error, 3 = no config yet (first run: set it up with Harold).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ghApi } from './github-app.mjs';
import { pending, thread, threads } from './pr-thread.mjs';

export const CONFIG = `${homedir()}/.idea-loop/inbox.json`;

export function readConfig(text) {
  const cfg = JSON.parse(text);
  const commanders = Array.isArray(cfg.commanders) ? cfg.commanders.filter((c) => typeof c === 'string' && c) : [];
  const repos = Object.entries(cfg.repos ?? {}).filter(([r, v]) => /^[\w.-]+\/[\w.-]+$/.test(r) && typeof v?.checkout === 'string');
  if (!commanders.length) throw new Error('inbox.json: commanders is empty — nobody would be allowed to give commands');
  if (!repos.length) throw new Error('inbox.json: repos is empty — nothing to scan');
  return { commanders, repos: Object.fromEntries(repos) };
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

function scan(cfg) {
  const out = { items: [], ignored: [], errors: [] };
  for (const [repo, { checkout }] of Object.entries(cfg.repos)) {
    try {
      const prs = ghApi('GET', `repos/${repo}/pulls?state=open&per_page=100`, null, true).flat();
      for (const p of prs) {
        const comments = ghApi('GET', `repos/${repo}/pulls/${p.number}/comments?per_page=100`, null, true).flat();
        if (!comments.some((c) => /<!-- idea-loop-thread /.test(c.body ?? ''))) continue;
        const { act, ignored } = inboxThreads(comments, resolvedById(repo, p.number), cfg.commanders);
        out.ignored.push(...ignored.map((i) => ({ repo, pr: p.number, ...i })));
        if (!act.length) continue;
        let worktree = null;
        try {
          worktree = worktreeFor(execFileSync('git', ['-C', checkout, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' }), p.head.ref);
        } catch {
          // checkout missing or not a repository: pr-inbox reports it before doing anything
        }
        out.items.push({ repo, pr: p.number, title: p.title, url: p.html_url, head: p.head.ref, checkout, worktree, threads: act });
      }
    } catch (error) {
      out.errors.push({ repo, error: String(error.stderr || error.message).trim() });
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--config');
  const path = i === -1 ? CONFIG : args[i + 1];
  if (args[0] !== 'scan' || !path) {
    console.error('usage: node pr-inbox.mjs scan [--config <path>]');
    process.exit(1);
  }
  if (!existsSync(path)) {
    console.error(`no inbox config at ${path} — first run: set it up with Harold (skills/pr-inbox/SKILL.md §1)`);
    process.exit(3);
  }
  try {
    console.log(JSON.stringify(scan(readConfig(readFileSync(path, 'utf8'))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
