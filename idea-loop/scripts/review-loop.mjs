#!/usr/bin/env node
/**
 * The review loop of one PR — kept in a local markdown file, archived to the PR when it merges.
 *
 * Harold reviews and decides in his Claude session (desktop or phone), not on GitHub: a PR thread
 * is built for many people answering asynchronously, and moving each of his answers from GitHub
 * back into the session took a bot identity, round markers, a background watcher and a wake-up —
 * all to carry one person's words to the session he was already in. So every report the loop makes
 * (implement's stops, pr-review's rounds) is shown in the session and appended, in the same words,
 * to one file per PR; his rulings and what was done about them are appended under it. The file is
 * the loop's memory: a session that was compacted or reopened reads it and carries on. When Harold
 * says merge, each report is posted to the PR as one plain comment — a record, not a conversation —
 * and the local file is deleted. Layout and wording: skills/engineering/pr/references/review-loop.md,
 * skills/engineering/pr/references/stop-report.md and review-round.md.
 *
 * File: <worktree root>/.tmp/review-loop/<PR>.md
 *
 *   # PR #<N> 的 review loop
 *
 *   <!-- idea-loop-entry {"kind":"pause","round":1} -->
 *   ## 第 1 次停下 · …            ← the report, exactly as shown in the session
 *   ### 你的批示（<time>）         ← Harold's words, verbatim
 *   ### 做了什么                   ← what was done, with commit links
 *
 * An entry is settled once every 你的批示 has a 做了什么 after it. An entry that asks the human nothing
 * has no ruling to wait for and is settled by its 做了什么 alone: a review round with no 要你决定 in it
 * (every finding handled by rule), and a stop report with no 需要你决定 section. Unticked boxes under
 * 交付验收 do not hold a stop report: the human checks them in the final review report (pr-review,
 * 交审核报告), not mid-implementation. So the orchestrator can tell "everything is handled" and carry on
 * without waiting for a nod (implement's stops; pr-review, section 一轮之后往哪走). A stop report that
 * does ask waits for the human's ruling as before. Overturning
 * a handled-by-rule item is just one more 你的批示 in the same entry. `check` lists the unsettled ones
 * so the orchestrator can say so before a merge; it does not block the merge — Harold decides that.
 *
 * Figures in the file are local paths (the evidence directories under .tmp/): in the session they are
 * sent as files, because a chat cannot load images from a private repository. Archiving uploads every
 * local figure an entry uses to the PR's evidence branch (evidence.mjs) and rewrites the path to the
 * address that opens full size on GitHub.
 *
 * Identity for the archive: the repository's GitHub App when configured, else the gh login with a
 * line saying Claude posted it (github-app.mjs). Archiving is idempotent: an entry whose marker is
 * already on the PR is not posted again.
 *
 * Deterministic core (parseLoop, nextRound, unsettled, toArchive, archiveBody, withAuthorship,
 * localFigures, withFigureUrls) is
 * pure and unit-tested.
 *
 * Usage:
 *   node review-loop.mjs next    <file> <pause|review|replay> → prints the next round number
 *   node review-loop.mjs check   <file>                       → JSON: entries, and which are unsettled
 *   node review-loop.mjs archive <file> <owner/repo> <pr>     → posts each entry not yet on the PR
 * Exit: 0 = done, 1 = usage / io / API error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publish } from './evidence.mjs';
import { repoApi } from './github-app.mjs';

export const KINDS = ['pause', 'review', 'replay'];
const ENTRY = /^<!-- idea-loop-entry (\{.*?\}) -->$/;
const ARCHIVED = /<!-- idea-loop-archive (\{.*?\}) -->/;
const MAX_BODY = 65000;

/** Entries of a review-loop file, in order. Lines before the first entry (the title) are ignored. */
export function parseLoop(text = '') {
  const entries = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(ENTRY);
    if (m) {
      const rec = JSON.parse(m[1]);
      if (!KINDS.includes(rec.kind) || !Number.isSafeInteger(rec.round)) throw new Error(`bad entry marker: ${line}`);
      entries.push({ kind: rec.kind, round: rec.round, lines: [] });
    } else if (entries.length) {
      entries.at(-1).lines.push(line);
    }
  }
  return entries.map(({ kind, round, lines }) => {
    const body = lines.join('\n').trim();
    const rulings = (body.match(/^### 你的批示/gm) ?? []).length;
    const acted = (s) => /^### 做了什么/m.test(s);
    // An entry that asks the human nothing has no ruling to wait for: it is settled once it says what was
    // done. A review round asks when it carries a 要你决定; a stop report asks when it carries a 需要你决定
    // section (its unticked 交付验收 items wait for the review report instead); a replay asks when something
    // failed (it carries a 要你决定 until the human has ruled). A report that asks something needs the human's ruling.
    const asksHuman = /\*\*要你决定\*\*/.test(body) || (kind === 'pause' && /^#{2,4}\s*需要你决定/m.test(body));
    const askedNothing = rulings === 0 && !asksHuman;
    const settled = rulings > 0 ? acted(body.slice(body.lastIndexOf('### 你的批示'))) : askedNothing && acted(body);
    return { kind, round, body, rulings, settled };
  });
}

export const nextRound = (entries, kind) => Math.max(0, ...entries.filter((e) => e.kind === kind).map((e) => e.round)) + 1;

export const unsettled = (entries) => entries.filter((e) => !e.settled).map(({ kind, round }) => ({ kind, round }));

export const archiveMarker = (kind, round) => `<!-- idea-loop-archive ${JSON.stringify({ kind, round })} -->`;

/** Entries not yet posted to the PR, judged by the markers on its existing comments. */
export function toArchive(entries, comments) {
  const posted = new Set(comments.map((c) => c.body?.match(ARCHIVED)?.[1]).filter(Boolean).map((j) => {
    const r = JSON.parse(j);
    return `${r.kind}:${r.round}`;
  }));
  return entries.filter((e) => !posted.has(`${e.kind}:${e.round}`));
}

const FIGURE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Local figure paths an entry uses (anything that is not already a web address). */
export function localFigures(body) {
  return [...new Set([...String(body).matchAll(FIGURE)].map((m) => m[2]).filter((p) => !/^https?:\/\//.test(p)))];
}

/** Replace local figure paths with their uploaded addresses, keyed by file name. */
export function withFigureUrls(body, urls) {
  return String(body).replace(FIGURE, (all, alt, p) => (urls[basename(p)] ? `![${alt}](${urls[basename(p)]})` : all));
}

/** Without an App, the gh login posts — so the body has to say who really wrote it. */
export function withAuthorship(body, identity) {
  return identity === 'app' ? body : `> 🤖 由 Claude 代发（仓库未配置 GitHub App，借用 gh 当前登录的账号发出，不是本人所写）\n\n${body}`;
}

export function archiveBody(entry, identity) {
  const label = { pause: `第 ${entry.round} 次停下`, review: `review 第 ${entry.round} 轮`, replay: `规则回放第 ${entry.round} 次` }[entry.kind];
  const body = `${archiveMarker(entry.kind, entry.round)}\n${withAuthorship(`> 记录：${label}在会话里进行，下面是原样的汇报、批示和处理结果。\n\n${entry.body}`, identity)}`;
  if (body.length > MAX_BODY) throw new Error(`${label} is ${body.length} characters (limit ${MAX_BODY}); fold detail in the file before archiving`);
  return body;
}

// ---------- io / API boundary ----------

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');

async function main() {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (cmd === 'next' && file && KINDS.includes(rest[0])) return console.log(nextRound(parseLoop(read(file)), rest[0]));
  if (cmd === 'check' && file) {
    const entries = parseLoop(read(file));
    return console.log(JSON.stringify({ entries: entries.map(({ kind, round, rulings, settled }) => ({ kind, round, rulings, settled })), unsettled: unsettled(entries) }, null, 2));
  }
  const [repo, pr] = rest;
  if (cmd === 'archive' && file && /^[\w.-]+\/[\w.-]+$/.test(repo ?? '') && /^\d+$/.test(pr ?? '')) {
    if (!existsSync(file)) throw new Error(`no review-loop file at ${file}`);
    const api = await repoApi(repo);
    const existing = (await api('GET', `repos/${repo}/issues/${pr}/comments?per_page=100`, null, true)).flat();
    const posted = [];
    for (const entry of toArchive(parseLoop(read(file)), existing)) {
      const figures = localFigures(entry.body).map((p) => resolve(dirname(file), p));
      const urls = figures.length ? publish(repo, pr, figures) : {};
      const body = archiveBody({ ...entry, body: withFigureUrls(entry.body, urls) }, api.identity);
      const c = await api('POST', `repos/${repo}/issues/${pr}/comments`, { body });
      posted.push({ kind: entry.kind, round: entry.round, url: c.html_url });
    }
    return console.log(JSON.stringify({ posted, identity: api.identity }, null, 2));
  }
  throw new Error('usage: review-loop.mjs next <file> <pause|review|replay> | check <file> | archive <file> <owner/repo> <pr>');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
