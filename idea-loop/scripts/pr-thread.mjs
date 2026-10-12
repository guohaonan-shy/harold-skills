#!/usr/bin/env node
/**
 * Claude's threads on a PR — one review thread per report, posted by the project's bot.
 *
 * Two kinds of report open a NEW thread each time:
 *   pause  — implement stopped for Harold during the draft phase (decisions, delivery evidence)
 *   review — one pr-review round (the Spec and Standards findings)
 * Harold answers and asks inside the thread, as himself; the orchestrator replies there with what
 * it did. PR conversation comments are flat on GitHub — only review comments take replies and can
 * be resolved — so a report is a file-level review comment, anchored on a ticket file in the PR's
 * diff. Resolving a thread is Harold's sign-off, not the bot's (a GitHub App cannot resolve review
 * threads without Contents write, and should not need it). Layout: references/pr-description.md.
 *
 * Identity: the GitHub App configured for the repository speaks (github-app.mjs). Without one, the
 * gh login posts and every body says up front that Claude posted it — the bot never passes as the
 * human.
 *
 * A report can be rewritten in place (edit) — the root of a review thread after Harold asks for it to
 * read differently, say. The thread marker on the root's first line is carried over from the comment
 * on GitHub, never from the new text, so an edit cannot turn a thread into a non-thread or move it to
 * another round.
 *
 * Harold answers on GitHub, not in the session, so the orchestrator has to hear about it: `wait`
 * polls the threads it is told to watch and exits once there is something to act on — a human
 * message newer than Claude's last word in a thread, after a quiet spell (so a reply typed as
 * several comments arrives as one batch), or every watched thread resolved. Run it in the
 * background; its exit wakes the session. It is stateless: "new" is always "after the bot last
 * spoke", so a restart never loses or repeats anything.
 *
 * Deterministic core (threadMarker, parseThread, pickAnchor, thread, threads, withAuthorship,
 * editedBody, pending, settled) is pure and unit-tested.
 *
 * Usage:
 *   node pr-thread.mjs open  <owner/repo> <pr> <pause|review> <round> <body.md> <preferred-anchor>...
 *   node pr-thread.mjs read  <owner/repo> <pr> <root-comment-id>
 *   node pr-thread.mjs reply <owner/repo> <pr> <root-comment-id> <body.md>
 *   node pr-thread.mjs edit  <owner/repo> <pr> <comment-id> <body.md>
 *   node pr-thread.mjs list  <owner/repo> <pr>
 *   node pr-thread.mjs wait  <owner/repo> <pr> <root-comment-id>... [--quiet <seconds>] [--every <seconds>]
 * Exit: 0 = done, 1 = usage / API error.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { repoApi } from './github-app.mjs';

export const KINDS = ['pause', 'review'];
const MARK = /<!-- idea-loop-thread (\{.*?\}) -->/;
const MAX_BODY = 65000;

export const threadMarker = (kind, round) => `<!-- idea-loop-thread ${JSON.stringify({ kind, round })} -->`;

export function parseThread(body = '') {
  const m = body.match(MARK);
  if (!m) return null;
  try {
    const rec = JSON.parse(m[1]);
    return KINDS.includes(rec.kind) && Number.isSafeInteger(rec.round) ? rec : null;
  } catch {
    return null;
  }
}

/** Without an App, the gh login posts — so the body has to say who really wrote it. */
export function withAuthorship(body, identity) {
  return identity === 'app' ? body : `> 🤖 由 Claude 代发（仓库未配置 GitHub App，借用 gh 当前登录的账号发出，不是本人所写）\n\n${body}`;
}

/** New text for an existing comment, keeping the thread marker the comment already has (if any). */
export function editedBody(oldBody, text, identity) {
  const m = String(oldBody ?? '').match(MARK);
  const body = withAuthorship(String(text).replace(MARK, '').trim(), identity);
  return m ? `${m[0]}\n${body}` : body;
}

/** First preferred anchor that is a file in the PR's diff; review comments can only sit on those. */
export function pickAnchor(preferred, prFiles) {
  const live = prFiles.filter((f) => f.status !== 'removed');
  const inDiff = new Set(live.map((f) => f.filename));
  return preferred.find((p) => inDiff.has(p)) ?? live.find((f) => /docs\/spec\/tickets\/.+\.md$/.test(f.filename))?.filename ?? null;
}

/** The root comment plus its replies, oldest first, with who wrote each. */
export function thread(rootId, comments) {
  const root = comments.find((c) => c.id === rootId);
  if (!root) return null;
  const replies = comments.filter((c) => c.in_reply_to_id === rootId).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  // The bot is the App (type Bot), or the gh login carrying the authorship line withAuthorship adds.
  const who = (c) => (c.user?.type === 'Bot' || MARK.test(c.body) || /由 Claude 代发/.test(c.body) ? 'claude' : c.user?.login);
  return {
    url: root.html_url, path: root.path, ...parseThread(root.body),
    messages: [root, ...replies].map((c) => ({ id: c.id, author: who(c), at: c.created_at, body: c.body })),
  };
}

/** Human messages in one thread that came after Claude last spoke there. */
export function pending(t) {
  const lastBot = t.messages.map((m) => m.author).lastIndexOf('claude');
  return t.messages.slice(lastBot + 1).filter((m) => m.author !== 'claude');
}

/**
 * Whether the watch is over: every thread resolved, or new human messages with none in the last
 * quietMs (Harold may still be typing the next one).
 */
export function settled(watched, nowMs, quietMs) {
  if (watched.length && watched.every((w) => w.resolved)) return 'resolved';
  const fresh = watched.flatMap((w) => w.pending);
  if (!fresh.length) return null;
  return nowMs - Math.max(...fresh.map((m) => Date.parse(m.at))) >= quietMs ? 'replied' : null;
}

/** Every Claude thread on the PR, grouped by kind and ordered by round. */
export function threads(comments) {
  const found = comments
    .map((c) => ({ c, rec: parseThread(c.body) }))
    .filter(({ c, rec }) => rec && !c.in_reply_to_id)
    .map(({ c, rec }) => ({ kind: rec.kind, round: rec.round, rootId: c.id, url: c.html_url }))
    .sort((a, b) => a.round - b.round);
  return Object.fromEntries(KINDS.map((k) => [k, found.filter((t) => t.kind === k)]));
}

// ---------- API boundary ----------

const pullComments = async (api, repo, pr) => (await api('GET', `repos/${repo}/pulls/${pr}/comments?per_page=100`, null, true)).flat();

async function resolvedById(api, repo, pr) {
  const [owner, name] = repo.split('/');
  const query = `query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved comments(first:1){nodes{databaseId}}}}}}}`;
  const res = await api('POST', 'graphql', { query, variables: { owner, name, pr: Number(pr) } });
  return new Map(res.data.repository.pullRequest.reviewThreads.nodes.map((t) => [t.comments.nodes[0]?.databaseId, t.isResolved]));
}

const capped = (body) => {
  if (body.length > MAX_BODY) throw new Error(`comment is ${body.length} characters (limit ${MAX_BODY}); fold detail or split the figures`);
  return body;
};

async function main() {
  const [cmd, repo, pr, ...rest] = process.argv.slice(2);
  if (!['open', 'read', 'reply', 'edit', 'list', 'wait'].includes(cmd) || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^\d+$/.test(pr ?? '')) {
    throw new Error('usage: pr-thread.mjs open|read|reply|edit|list|wait <owner/repo> <pr> ...');
  }
  const api = await repoApi(repo);

  if (cmd === 'wait') {
    const flag = (name, fallback) => {
      const i = rest.indexOf(name);
      return i === -1 ? fallback : Number(rest.splice(i, 2)[1]);
    };
    const quietMs = flag('--quiet', 120) * 1000;
    const everyMs = flag('--every', 60) * 1000;
    const ids = rest.map(Number);
    if (!ids.length || !ids.every(Number.isSafeInteger)) throw new Error('usage: wait <owner/repo> <pr> <root-comment-id>... [--quiet <s>] [--every <s>]');
    for (;;) {
      try {
        const comments = await pullComments(api, repo, pr);
        const resolved = await resolvedById(api, repo, pr);
        const watched = ids.map((id) => {
          const t = thread(id, comments);
          if (!t) throw new Error(`no review comment ${id} on PR ${pr}`);
          return { rootId: id, url: t.url, kind: t.kind, round: t.round, resolved: resolved.get(id) ?? false, pending: pending(t) };
        });
        const why = settled(watched, Date.now(), quietMs);
        if (why) return console.log(JSON.stringify({ why, threads: watched }, null, 2));
      } catch (error) {
        if (/no review comment/.test(error.message)) throw error;
        console.error(`poll failed, retrying: ${error.message}`); // a network blip must not end the watch
      }
      await new Promise((r) => setTimeout(r, everyMs));
    }
  }

  if (cmd === 'list') {
    const all = threads(await pullComments(api, repo, pr));
    const resolved = await resolvedById(api, repo, pr);
    const out = Object.fromEntries(KINDS.map((k) => [k, all[k].map((t) => ({ ...t, resolved: resolved.get(t.rootId) ?? false }))]));
    const next = Object.fromEntries(KINDS.map((k) => [k, (all[k].at(-1)?.round ?? 0) + 1]));
    return console.log(JSON.stringify({ ...out, next, identity: api.identity }, null, 2));
  }
  if (cmd === 'open') {
    const [kind, round, file, ...preferred] = rest;
    if (!KINDS.includes(kind) || !/^\d+$/.test(round ?? '') || !file) {
      throw new Error('usage: open <owner/repo> <pr> <pause|review> <round> <body.md> <preferred-anchor>...');
    }
    if (threads(await pullComments(api, repo, pr))[kind].some((t) => t.round === Number(round))) {
      throw new Error(`${kind} round ${round} already has a thread; reply in it or open round ${Number(round) + 1}`);
    }
    const pull = await api('GET', `repos/${repo}/pulls/${pr}`);
    const anchor = pickAnchor(preferred, (await api('GET', `repos/${repo}/pulls/${pr}/files?per_page=100`, null, true)).flat());
    if (!anchor) throw new Error('no ticket file in the PR diff to anchor the thread on');
    const body = capped(`${threadMarker(kind, Number(round))}\n${withAuthorship(readFileSync(file, 'utf8').trim(), api.identity)}`);
    const c = await api('POST', `repos/${repo}/pulls/${pr}/comments`, { body, commit_id: pull.head.sha, path: anchor, subject_type: 'file' });
    return console.log(JSON.stringify({ kind, round: Number(round), rootId: c.id, url: c.html_url, anchor, identity: api.identity }, null, 2));
  }
  const rootId = Number(rest[0]);
  if (!Number.isSafeInteger(rootId)) throw new Error('comment id must be a number');
  if (cmd === 'edit') {
    if (!rest[1]) throw new Error('usage: edit <owner/repo> <pr> <comment-id> <body.md>');
    const old = await api('GET', `repos/${repo}/pulls/comments/${rootId}`);
    if (String(old.pull_request_url ?? '').split('/').pop() !== String(pr)) throw new Error(`comment ${rootId} is not on PR ${pr}`);
    const body = capped(editedBody(old.body, readFileSync(rest[1], 'utf8'), api.identity));
    const c = await api('PATCH', `repos/${repo}/pulls/comments/${rootId}`, { body });
    return console.log(JSON.stringify({ id: c.id, url: c.html_url, thread: parseThread(c.body) }, null, 2));
  }
  if (cmd === 'read') {
    const t = thread(rootId, await pullComments(api, repo, pr));
    if (!t) throw new Error(`no review comment ${rootId} on PR ${pr}`);
    return console.log(JSON.stringify({ ...t, resolved: (await resolvedById(api, repo, pr)).get(rootId) ?? false }, null, 2));
  }
  if (!rest[1]) throw new Error('usage: reply <owner/repo> <pr> <root-comment-id> <body.md>');
  const body = capped(withAuthorship(readFileSync(rest[1], 'utf8').trim(), api.identity));
  const c = await api('POST', `repos/${repo}/pulls/${pr}/comments/${rootId}/replies`, { body });
  console.log(JSON.stringify({ id: c.id, url: c.html_url }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
