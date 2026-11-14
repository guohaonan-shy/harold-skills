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
 * It also checks a landed hand-back against its commit (`skill-edit`): a commit that changes skills, agent
 * definitions or skill reference files must come with a hand-back whose 「读了哪几份写法规范」 line says it
 * CALLED writing-for-agents, and one 「杠杆」 line per changed file. Only the hand-back's own words are checked,
 * not whether the lever named is the right one (review judges that).
 *
 * Deterministic core (ticketOf, parseLog, isSkillEditFile, parseHandback, checkSkillEdit) is pure and unit-tested.
 *
 * Usage:  node ticket-ledger.mjs landed <base-ref>   → tickets landed on HEAD since the merge-base
 *         node ticket-ledger.mjs of <commit>          → the ticket one commit belongs to
 *         node ticket-ledger.mjs skill-edit <commit> <handback-file>  → does the hand-back cover the skill files the commit changed
 * Output: landed → JSON [{ sha, ticket }] oldest first; of → the ticket name, or nothing;
 *         skill-edit → `ok: …`, or one `- <reason>` line per problem
 * Exit:   0 = done; 1 = usage / git / file error; 2 (`of`) = the commit has no Ticket line;
 *         2 (`skill-edit`) = the hand-back does not cover the commit (reasons listed)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

/**
 * Does this path count as a skill, an agent definition or a skill reference file? The same rule to-ticket writes
 * into the ticket: a path ending in `SKILL.md`; or any `.md` under a `skills/` directory; or a `.md` directly
 * under an `agents/` directory (`.claude/agents/` too). Ticket files (`docs/spec/<slug>/tickets/`) never count.
 */
export function isSkillEditFile(path) {
  const p = String(path ?? '').replace(/^\.\//, '');
  if (/(^|\/)docs\/spec\/[^/]+\/tickets\//.test(p)) return false;
  return /(^|\/)SKILL\.md$/.test(p) || /(^|\/)skills\/.+\.md$/.test(p) || /(^|\/)agents\/[^/]+\.md$/.test(p);
}

export const skillEditFiles = (paths) => paths.filter(isSkillEditFile);

const STANDARDS_LINE = /^\s*(?:[-*]\s*)?读了哪几份写法规范\s*\|([^|]*)\|(.*)$/m;
const LEVER_LINE = /^\s*(?:[-*]\s*)?杠杆\s*\|([^|]*)\|(.*)$/gm;

/** The hand-back's 「读了哪几份写法规范」 line ({ method, names }, or null) and its 「杠杆」 lines ({ file, lever }). */
export function parseHandback(text) {
  const raw = String(text ?? '');
  const std = raw.match(STANDARDS_LINE);
  return {
    standards: std ? { method: std[1].trim(), names: std[2].trim() } : null,
    levers: [...raw.matchAll(LEVER_LINE)].map((m) => ({ file: m[1].trim().replace(/^`|`$/g, ''), lever: m[2].trim() })),
  };
}

const sameFile = (a, b) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

/** Why a hand-back does not cover the files its commit changed: [] when it does, or when no such file changed. */
export function checkSkillEdit({ files, handback }) {
  const changed = skillEditFiles(files ?? []);
  if (changed.length === 0) return [];
  const { standards, levers } = parseHandback(handback);
  const reasons = [];
  if (!standards) {
    reasons.push('交回里没有「读了哪几份写法规范」那一行：改了 skill、agent 定义或 skill 参考文件，要用 Skill 工具调 writing-for-agents，并在这一行写明');
  } else {
    if (!standards.method.includes('调')) {
      reasons.push(`「读了哪几份写法规范」那一行的方式是「${standards.method}」，没有「调」：改 skill、agent 定义、skill 参考文件的工单要用 Skill 工具调 writing-for-agents，读一句引文不算`);
    }
    if (!standards.names.includes('writing-for-agents')) {
      reasons.push('「读了哪几份写法规范」那一行的名单里没有 writing-for-agents');
    }
  }
  for (const file of changed) {
    if (!levers.some((l) => l.lever && sameFile(l.file, file))) {
      reasons.push(`${file} 没有杠杆行：要有一行「杠杆 | ${file} | <对的哪条杠杆>」，第三栏不能空`);
    }
  }
  return reasons;
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
    } else if (cmd === 'skill-edit' && ref && process.argv[4]) {
      const files = git(['diff-tree', '-r', '--root', '--no-commit-id', '--name-only', ref]).split('\n').filter(Boolean);
      const reasons = checkSkillEdit({ files, handback: readFileSync(process.argv[4], 'utf8') });
      if (reasons.length === 0) {
        const n = skillEditFiles(files).length;
        console.log(n ? `ok: ${n} 个 skill、agent 定义或 skill 参考文件，写法规范与杠杆行齐` : 'ok: 没改到 skill、agent 定义或 skill 参考文件');
      } else {
        console.log(reasons.map((r) => `- ${r}`).join('\n'));
        process.exitCode = 2;
      }
    } else {
      console.error('usage: node ticket-ledger.mjs landed <base-ref> | of <commit> | skill-edit <commit> <handback-file>');
      process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
