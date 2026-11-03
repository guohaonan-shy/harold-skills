#!/usr/bin/env node
/**
 * Where a business's knowledge base is, from any checkout (spec: knowledge-base-repo, 「每台机器怎么找到它」and
 * 「一个会话怎么拿到知识库」). Every skill and script asks this file, none of them assumes `docs/` is next to the code.
 *
 * A knowledge base is a git repository with an `idea-loop.json` at its root:
 *   { "business": "<业务>", "issues": "<owner/name>", "repos": { "<仓库名>": "<owner/name>" } }
 *
 * A code repository says which business it belongs to in a pointer block, the `## idea-loop` section of its AGENTS.md
 * (else CLAUDE.md) at the git root:
 *   - 业务：`<业务>`
 *   - 知识库：`<owner/name>`
 * Where this machine keeps things is `~/.idea-loop/projects.json` (`$IDEA_LOOP_HOME/projects.json` when that variable
 * is set, which is how the tests stay off the real one), paths only:
 *   { "<业务>": { "knowledgeBase": "<main checkout>", "home": "<where sessions run>", "repos": { "<仓库名>": "<main checkout>" } } }
 *
 * Usage (all work on the current directory; `--cwd <dir>` works on another one):
 *   node knowledge-base.mjs root [--write]       → the knowledge base to read from; with --write, the one to write to:
 *                                                  .tmp/kb of the current git root, opened on the current branch
 *   node knowledge-base.mjs worktree <仓库名>    → .tmp/repos/<仓库名> of the current git root: that repository's worktree on the current branch
 *   node knowledge-base.mjs business             → JSON: business, knowledgeBase, home, repos: { <仓库名>: { path, github } }
 * Exit: 0 = done, 1 = refused (not configured, unknown repository, git failed; the reason on stderr), 2 = usage.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONFIG_FILE = 'idea-loop.json';
export const SETUP = '/idea-loop:setup';

/** A refusal with a reason a person can act on; the command line prints it and exits 1. */
export class KnowledgeBaseError extends Error {}

/** Where the machine-level mapping lives: `$IDEA_LOOP_HOME`, else `~/.idea-loop`. */
export const ideaLoopHome = () => process.env.IDEA_LOOP_HOME || join(homedir(), '.idea-loop');

const projectsFile = (home) => join(home, 'projects.json');
const shownProjectsFile = (home) => (process.env.IDEA_LOOP_HOME ? projectsFile(home) : '~/.idea-loop/projects.json');

function git(cwd, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw new KnowledgeBaseError(`git ${args.join(' ')}（在 ${cwd}）失败：${String(e.stderr || e.message).trim()}`);
  }
}

const real = (p) => {
  try { return realpathSync(p); } catch { return resolve(p); }
};

/** The top of the git working tree `cwd` is in, or null outside a repository. */
export const gitRoot = (cwd) => git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true });

/** `$IDEA_LOOP_HOME/projects.json` parsed; null when the file does not exist. */
export function readProjects(home = ideaLoopHome()) {
  const file = projectsFile(home);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new KnowledgeBaseError(`${shownProjectsFile(home)} 不是合法的 JSON：${e.message}`);
  }
}

/** A knowledge base's `idea-loop.json`, parsed. */
export function readBusinessConfig(kbRoot) {
  const file = join(kbRoot, CONFIG_FILE);
  if (!existsSync(file)) throw new KnowledgeBaseError(`${kbRoot} 里没有 ${CONFIG_FILE}，它不是知识库`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new KnowledgeBaseError(`${file} 不是合法的 JSON：${e.message}`);
  }
}

const isKnowledgeBase = (dir) => existsSync(join(dir, CONFIG_FILE));

export const POINTER_HEADING = '## idea-loop';

/**
 * The pointer block of a code repository: the `## idea-loop` section of `<top>/AGENTS.md`, else `<top>/CLAUDE.md`, that
 * carries both a「业务：`<业务>`」and a「知识库：`<owner/name>`」line. `{ business, knowledge }` or null. A section
 * without those two lines (the older kind that only lists settings) is not a pointer.
 */
export function readPointer(top) {
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const path = join(top, file);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf8').split('\n');
    const start = lines.findIndex((l) => l.trim() === POINTER_HEADING);
    if (start < 0) continue;
    const section = [];
    for (const line of lines.slice(start + 1)) {
      if (/^#{1,2} /.test(line)) break;
      section.push(line);
    }
    const pick = (key) => section.map((l) => l.match(new RegExp(`^\\s*[-*]\\s*${key}[：:]\\s*\`([^\`]+)\``))).find(Boolean)?.[1];
    const business = pick('业务');
    const knowledge = pick('知识库');
    if (business && knowledge) return { business, knowledge };
  }
  return null;
}

const notConfigured = (where) => new KnowledgeBaseError(
  `这个仓库还没配进任何业务：跑 ${SETUP}\n（${where} 的 AGENTS.md、CLAUDE.md 里没有「业务」「知识库」两行齐全的 ${POINTER_HEADING} 块）`,
);

/**
 * The business the checkout at `cwd` belongs to, and where this machine keeps its knowledge base. A code repository
 * names its business in its pointer block; the knowledge base itself in its `idea-loop.json`. `projects.json` then gives
 * the paths: `{ name, github, knowledgeBase, home, repos }` (`github`: the knowledge base's owner/name, null when `cwd`
 * is in the knowledge base). Refuses with "run setup" when there is no pointer, or this machine has no clone.
 */
export function businessOf(cwd, { home = ideaLoopHome() } = {}) {
  const top = gitRoot(cwd);
  if (!top) throw notConfigured(resolve(cwd));
  let name;
  let github = null;
  if (isKnowledgeBase(top)) {
    name = readBusinessConfig(top).business;
  } else {
    const pointer = readPointer(top);
    if (!pointer) throw notConfigured(top);
    ({ business: name, knowledge: github } = pointer);
  }
  const entry = readProjects(home)?.[name];
  if (!entry?.knowledgeBase || !existsSync(entry.knowledgeBase)) {
    const what = github ? `知识库 ${github}` : `业务 ${name} 的知识库`;
    throw new KnowledgeBaseError(`这台机器还没 clone ${what}：跑 ${SETUP}\n（${shownProjectsFile(home)} 里没有业务 ${name}，或它的 knowledgeBase 路径不存在）`);
  }
  return { name, github, knowledgeBase: entry.knowledgeBase, home: entry.home, repos: entry.repos || {} };
}

const branchExists = (repo, ref) => git(repo, ['show-ref', '--verify', '--quiet', ref], { allowFail: true }) !== null;

/** What a new branch in `repo` starts from: origin's default branch, else a local main / master, else HEAD. */
function baseRef(repo) {
  const head = git(repo, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true });
  if (head && branchExists(repo, `refs/remotes/${head}`)) return head;
  for (const name of ['main', 'master']) {
    if (branchExists(repo, `refs/remotes/origin/${name}`)) return `origin/${name}`;
  }
  for (const name of ['main', 'master']) {
    if (branchExists(repo, `refs/heads/${name}`)) return name;
  }
  return 'HEAD';
}

/**
 * Makes sure `dest` is a worktree of the repository whose main checkout is `repo`, on `branch`. An existing one on
 * that branch is returned as it is; on another branch (the session moved on, e.g. from review to implementation) it is
 * switched, refusing before any change when it has uncommitted changes to tracked files. Otherwise stale worktree
 * records are pruned, then the branch is used if it exists locally or on origin, and cut from the default branch if
 * not. Returns `dest`.
 */
export function ensureWorktree(repo, dest, branch) {
  if (existsSync(dest)) {
    const same = git(dest, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { allowFail: true });
    if (!same || real(dirname(same)) !== real(repo)) {
      throw new KnowledgeBaseError(`${dest} 已经存在，但不是 ${repo} 的 worktree：删掉它再重试`);
    }
    const current = git(dest, ['branch', '--show-current']);
    if (current === branch) return dest;
    if (git(dest, ['status', '--porcelain', '--untracked-files=no'])) {
      throw new KnowledgeBaseError(`${dest} 在分支 ${current || '（detached HEAD）'} 上有没提交的改动，切不到当前会话的分支 ${branch}：先在那里提交或丢弃，再重试`);
    }
    git(repo, ['fetch', '--quiet', 'origin'], { allowFail: true });
    if (branchExists(repo, `refs/heads/${branch}`)) {
      git(dest, ['switch', '--quiet', branch]);
    } else if (branchExists(repo, `refs/remotes/origin/${branch}`)) {
      git(dest, ['switch', '--quiet', '-c', branch, `origin/${branch}`]);
    } else {
      git(dest, ['switch', '--quiet', '--no-track', '-c', branch, baseRef(repo)]);
    }
    return dest;
  }
  git(repo, ['worktree', 'prune']);
  git(repo, ['fetch', '--quiet', 'origin'], { allowFail: true });
  if (branchExists(repo, `refs/heads/${branch}`)) {
    git(repo, ['worktree', 'add', '--quiet', dest, branch]);
  } else if (branchExists(repo, `refs/remotes/origin/${branch}`)) {
    git(repo, ['worktree', 'add', '--quiet', '-b', branch, dest, `origin/${branch}`]);
  } else {
    git(repo, ['worktree', 'add', '--quiet', '--no-track', '-b', branch, dest, baseRef(repo)]);
  }
  return dest;
}

function currentBranch(cwd) {
  const branch = git(cwd, ['branch', '--show-current']);
  if (!branch) throw new KnowledgeBaseError(`${cwd} 没有在任何分支上（detached HEAD），没有分支名可以用来开 worktree`);
  return branch;
}

/**
 * The knowledge base root for `cwd`. In the knowledge base itself that is its git root. Otherwise `.tmp/kb` of the
 * current git root when it is open, else the business's knowledge base main checkout. With `write`, `.tmp/kb` is opened
 * first (a worktree of the knowledge base, on the current branch), so what is written is this session's own branch.
 */
export function knowledgeBaseRoot(cwd = process.cwd(), { write = false, home = ideaLoopHome() } = {}) {
  const top = gitRoot(cwd);
  if (top && isKnowledgeBase(top)) return top;
  const open = top && join(top, '.tmp', 'kb');
  if (!write && open && isKnowledgeBase(open)) return open;
  const biz = businessOf(cwd, { home });
  if (!write) return biz.knowledgeBase;
  return ensureWorktree(biz.knowledgeBase, open, currentBranch(top));
}

/** `.tmp/repos/<name>` of the current git root: worktree of that code repository on the current branch. */
export function repoWorktree(cwd, name, { home = ideaLoopHome() } = {}) {
  const biz = businessOf(cwd, { home });
  if (!biz.repos[name]) {
    throw new KnowledgeBaseError(`这台机器上没有仓库 ${name} 的 checkout：跑 ${SETUP}\n（${shownProjectsFile(home)} 里业务 ${biz.name} 的 repos 只有：${Object.keys(biz.repos).join('、') || '无'}）`);
  }
  const top = gitRoot(cwd);
  return ensureWorktree(biz.repos[name], join(top, '.tmp', 'repos', name), currentBranch(top));
}

/**
 * The business as one object: its name, knowledge base, home and each repository's local path and GitHub name. A
 * repository the knowledge base lists but this machine has no checkout of has `path: null`; one only this machine
 * knows has `github: null`.
 */
export function businessInfo(cwd = process.cwd(), { home = ideaLoopHome() } = {}) {
  const biz = businessOf(cwd, { home });
  const github = readBusinessConfig(knowledgeBaseRoot(cwd, { home })).repos || {};
  const names = [...new Set([...Object.keys(github), ...Object.keys(biz.repos)])];
  return {
    business: biz.name,
    knowledgeBase: biz.knowledgeBase,
    home: biz.home,
    repos: Object.fromEntries(names.map((name) => [name, { path: biz.repos[name] ?? null, github: github[name] ?? null }])),
  };
}

function usage() {
  return [
    '用法：node knowledge-base.mjs <子命令> [--cwd <目录>]',
    '  root [--write]    知识库根（--write：开出 .tmp/kb，写用）',
    '  worktree <仓库名> .tmp/repos/<仓库名>：那个代码仓库的 worktree',
    '  business          业务、知识库、home、各仓库的本机路径与 GitHub 名（JSON）',
  ].join('\n');
}

export function main(argv) {
  const args = [...argv];
  let cwd = process.cwd();
  const at = args.indexOf('--cwd');
  if (at >= 0) {
    cwd = resolve(args[at + 1] ?? '');
    args.splice(at, 2);
  }
  const write = args.includes('--write');
  const [cmd, ...rest] = args.filter((a) => a !== '--write');
  const known = ['root', 'worktree', 'business'];
  if (!known.includes(cmd) || (write && cmd !== 'root') || rest.length > 1 || (cmd === 'worktree' && !rest.length) || (['root', 'business'].includes(cmd) && rest.length)) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
  try {
    const out = {
      root: () => knowledgeBaseRoot(cwd, { write }),
      worktree: () => repoWorktree(cwd, rest[0]),
      business: () => JSON.stringify(businessInfo(cwd), null, 2),
    }[cmd]();
    process.stdout.write(`${out}\n`);
    return 0;
  } catch (e) {
    if (!(e instanceof KnowledgeBaseError)) throw e;
    process.stderr.write(`${e.message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
