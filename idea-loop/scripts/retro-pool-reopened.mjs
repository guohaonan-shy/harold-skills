#!/usr/bin/env node
/**
 * Has a rejected retro candidate come up again since it was last rejected — answered from git history.
 *
 * A candidate in the pool (`docs/records/retro-candidates/`) that the human rejected keeps its file with
 * `- 状态：驳回（<理由>）`. `dreaming` puts it back on the proposal table only when a session it had not
 * counted before has come up since. The date of the rejection is not written in the file (the human decided
 * the date comes from git history), and dates are not compared either: a rejection and a new occurrence on
 * the same day cannot be told apart by date. Order is the order of commits.
 *
 *   - The rejection that counts is the latest commit that touched a `- 状态：驳回（` line, whatever it did
 *     to it (set it, changed its reason, replaced it): `git log -G`, not `-S`, because `-S` only fires when
 *     the number of matching lines changes and a second rejection with a new reason does not change it.
 *   - A session is new when it stands in the file now (an occurrence line not marked 已推翻) and was not
 *     named by any occurrence line, overturned or not, in the file as of that commit.
 *   - Rejecting a second time therefore has to leave a commit: the reason is rewritten (it names the
 *     occurrence it answers). A rejection that leaves the file byte for byte the same cannot be seen here.
 *
 * A file whose status is not 驳回, or whose rejection is not in the history (never committed), is reported
 * and the exit is non-zero: a guess here would either hide a candidate or put it on the table every week.
 *
 * Usage:  node retro-pool-reopened.mjs <candidate-file>   (the file lives in a git work tree)
 * Output: JSON { file, rejectedIn, reopened, newOccurrences: [<repo>#<number>] }
 * Exit:   0 = answered; 1 = usage; 2 = could not answer (message on stderr)
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const OVERTURNED = /[（(]已推翻[：:]/;
const SESSION = /^[-*]\s+([\w.\/-]+#\d+)/;
const REJECTED = /^[-*]\s*状态[：:]\s*驳回[（(]/m;

/** md → { all: Set of every session named in 出现, standing: Set of those with a line not marked 已推翻 } */
export function sessionsOf(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+出现\s*$/.test(l));
  const all = new Set();
  const standing = new Set();
  if (start < 0) return { all, standing };
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(l)) break;
    const session = l.match(SESSION)?.[1];
    if (!session) continue;
    all.add(session);
    if (!OVERTURNED.test(l)) standing.add(session);
  }
  return { all, standing };
}

class Unanswerable extends Error {}

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function reopened(file) {
  const abs = resolve(file);
  const dir = dirname(abs);
  const now = readFileSync(abs, 'utf8');
  if (!REJECTED.test(now)) throw new Unanswerable(`${file} 的状态不是驳回：不该来问它有没有重新出现`);

  let sha;
  let path;
  try {
    path = git(dir, 'rev-parse', '--show-prefix').trim() + basename(abs);
    sha = git(dir, 'log', '--topo-order', '--format=%H', '-G^- 状态：驳回（', '--', basename(abs)).split('\n')[0].trim(); // newest first; no -n1: git counts before the -G filter
  } catch (e) {
    throw new Unanswerable(`${file} 不在 git 仓库里或读不了历史：${String(e.stderr ?? e.message).trim()}`);
  }
  if (!sha) throw new Unanswerable(`${file} 的历史里没有「状态：驳回（」这一行的提交（驳回还没提交？）：取不到驳回的提交`);

  const before = sessionsOf(git(dir, 'show', `${sha}:${path}`)).all;
  const newOccurrences = [...sessionsOf(now).standing].filter((s) => !before.has(s));
  return { file, rejectedIn: sha, reopened: newOccurrences.length > 0, newOccurrences };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node retro-pool-reopened.mjs <candidate-file>');
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(reopened(file), null, 2));
  } catch (e) {
    if (!(e instanceof Unanswerable) && e.code !== 'ENOENT') throw e;
    console.error(`retro-pool-reopened: ${e.message}`);
    process.exit(2);
  }
}
