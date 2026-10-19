#!/usr/bin/env node
/**
 * Which tickets have landed on the integration branch — read from the `Ticket:` line of each commit.
 *
 * implement keeps no state file: a ticket has landed when the integration branch holds a commit whose
 * message carries `Ticket: <NN>-<slug>`. That line used to be read as a git trailer
 * (`%(trailers:key=Ticket)`), but git only treats the message's LAST paragraph as trailers, and the
 * environment an implementer commits from appends its own attribution paragraph (`Co-Authored-By: …`)
 * after a blank line. The Ticket line then sits in the second-to-last paragraph and the trailer read
 * comes back empty — the ledger silently loses a landed ticket. So the line is matched anywhere in the
 * message, on a line of its own, regardless of where the attribution lands.
 *
 * Deterministic core (ticketOf, parseLog) is pure and unit-tested.
 *
 * Usage:  node ticket-ledger.mjs landed <base-ref>   → tickets landed on HEAD since the merge-base
 *         node ticket-ledger.mjs of <commit>          → the ticket one commit belongs to
 * Output: landed → JSON [{ sha, ticket }] oldest first; of → the ticket name, or nothing
 * Exit:   0 = done; 1 = usage / git error; 2 (`of` only) = the commit has no Ticket line
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TICKET_LINE = /^Ticket:[ \t]*([0-9]{2}-[\w.-]+)[ \t]*$/m;

/** The ticket a commit message names, or null. A `wip(<NN>):` commit names none, by design. */
export function ticketOf(message) {
  return String(message ?? '').match(TICKET_LINE)?.[1] ?? null;
}

const RECORD = '\x1e';
const FIELD = '\x1f';

/** Output of `git log --format=%H%x1f%B%x1e` → [{ sha, ticket }] for the commits that name one. */
export function parseLog(raw) {
  return String(raw ?? '')
    .split(RECORD)
    .map((rec) => rec.replace(/^\n+/, ''))
    .filter(Boolean)
    .map((rec) => {
      const i = rec.indexOf(FIELD);
      return { sha: rec.slice(0, i).trim(), ticket: ticketOf(rec.slice(i + 1)) };
    })
    .filter((c) => c.sha && c.ticket);
}

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, ref] = process.argv.slice(2);
  try {
    if (cmd === 'landed' && ref) {
      const base = git(['merge-base', 'HEAD', ref]).trim();
      const raw = git(['log', '--reverse', `--format=%H${FIELD}%B${RECORD}`, `${base}..HEAD`]);
      console.log(JSON.stringify(parseLog(raw), null, 2));
    } else if (cmd === 'of' && ref) {
      const ticket = ticketOf(git(['log', '-1', '--format=%B', ref]));
      if (ticket) console.log(ticket);
      else process.exitCode = 2;
    } else {
      console.error('usage: node ticket-ledger.mjs landed <base-ref> | of <commit>');
      process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
