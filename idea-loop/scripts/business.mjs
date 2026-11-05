#!/usr/bin/env node
/**
 * Where a business's knowledge base is, and how its changes land (skills/productivity/wiki-conventions/SKILL.md,
 * sections 业务与知识库 and 知识库落地).
 *
 * A business root is the git repository the knowledge base lives in; the business's code repositories are
 * cloned under it and ignored by it. From anywhere (a code repo, one of its worktrees wherever it sits, or
 * the knowledge base itself) the root is found the same way: go to the main checkout (a worktree's git
 * common dir points back to it), then up to the first directory that is itself the top of a git repo and
 * ignores the code repo.
 * When there is none, the main checkout is its own business root: a one-repo project whose knowledge base
 * still sits in the code repo (the layout before migration), or a session opened in the knowledge base.
 *
 * Changes to the knowledge base never go through a PR. Each piece of work gets a branch and a worktree at
 * <root>/.worktrees/<branch>/, is committed there, and `land` merges it into the knowledge base's main
 * (the branch the root checkout is on) when the work lands, then pushes if there is a remote and removes
 * the worktree and the branch. Half-done work never reaches main, so other worktrees never read it.
 *
 * Usage:
 *   node business.mjs root         [<dir>]           → JSON: { root, repo, repos, legacy }
 *   node business.mjs instructions [<dir>]           → JSON: which instruction file each code repo has, what
 *                                                      the business root should hold, the「两份都读」switch
 *   node business.mjs kb   <branch> [<dir>]          → the knowledge-base worktree for <branch> (created from main
 *                                                      if missing); in the legacy layout, the current checkout
 *   node business.mjs land <branch> [<dir>]          → merge <branch> into main, push, remove worktree and branch
 *
 * Exit: 0 = done, 1 = refused (dirty worktree, conflict, root off main, push failed; the reason on stderr),
 * 2 = bad arguments or not in a git repository.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORKTREES = '.worktrees';
export const SWITCH = { plugin: 'cc-plugin-agents-md@builtin', option: 'instructionFiles', both: 'claude-md-and-agents-md' };

function git(cwd, args, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

/** The main checkout of the repo around dir: for a linked worktree, the checkout its common git dir belongs to. */
export function mainCheckout(dir) {
  const top = tryGit(dir, ['rev-parse', '--show-toplevel']);
  if (!top) return null;
  const common = tryGit(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common && basename(common) === '.git') return dirname(common);
  return top;
}

/**
 * The business root above dir: the nearest ancestor (dir excluded) that is the top of a git repo and
 * ignores dir. An enclosing repo that does not ignore it (a dotfiles repo at ~, say) is not a business.
 */
function enclosingRepo(dir) {
  for (let d = dirname(dir); d !== dirname(d); d = dirname(d)) {
    if (!existsSync(join(d, '.git'))) continue;
    return tryGit(d, ['check-ignore', '-q', '--no-index', relative(d, dir)]) === null ? null : d;
  }
  return null;
}

/** The code repositories directly under a business root: subdirectories that are git repos themselves. */
export function codeRepos(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== WORKTREES && e.name !== '.git' && existsSync(join(root, e.name, '.git')))
    .map((e) => e.name)
    .sort();
}

/** { root, repo, repos, legacy } for dir; repo is null when dir is the knowledge base itself. */
export function businessRoot(dir = process.cwd()) {
  const main = mainCheckout(resolve(dir));
  if (!main) return null;
  const up = enclosingRepo(main);
  if (up) return { root: up, repo: relative(up, main).split(sep).join('/'), repos: codeRepos(up), legacy: false };
  const repos = codeRepos(main);
  // The main checkout is its own root: either the knowledge base (code repos sit under it) or the old layout.
  return { root: main, repo: repos.length ? null : basename(main), repos, legacy: repos.length === 0 };
}

/** Which instruction file a code repo carries: 'claude' (has CLAUDE.md), 'agents' (only AGENTS.md) or 'none'. */
export function instructionKind(repoDir) {
  if (existsSync(join(repoDir, 'CLAUDE.md'))) return 'claude';
  if (existsSync(join(repoDir, 'AGENTS.md'))) return 'agents';
  return 'none';
}

/** Whether the user settings turn the「两份都读」switch on. */
export function switchOn(settingsFile = join(homedir(), '.claude', 'settings.json')) {
  try {
    const s = JSON.parse(readFileSync(settingsFile, 'utf8'));
    return s?.pluginConfigs?.[SWITCH.plugin]?.options?.[SWITCH.option] === SWITCH.both;
  } catch {
    return false;
  }
}

/**
 * What the business root's instruction file should be. All repos with CLAUDE.md → CLAUDE.md; all with only
 * AGENTS.md → AGENTS.md; mixed → AGENTS.md and the switch, since without it one side is never read.
 */
export function recommendInstructions(kinds) {
  const present = new Set(Object.values(kinds).filter((k) => k !== 'none'));
  if (present.size === 0) return { file: 'AGENTS.md', needsSwitch: false };
  if (present.size === 1) return { file: present.has('claude') ? 'CLAUDE.md' : 'AGENTS.md', needsSwitch: false };
  return { file: 'AGENTS.md', needsSwitch: true };
}

export function instructions(dir, settingsFile) {
  const b = businessRoot(dir);
  if (!b) return null;
  const kinds = Object.fromEntries(b.repos.map((r) => [r, instructionKind(join(b.root, r))]));
  const rec = recommendInstructions(kinds);
  const current = ['CLAUDE.md', 'AGENTS.md'].filter((f) => existsSync(join(b.root, f)));
  return { root: b.root, repos: kinds, current, recommend: rec.file, needsSwitch: rec.needsSwitch, switchOn: switchOn(settingsFile) };
}

/**
 * The GitHub repo issues live in, from the「issue 所在仓库」line of ISSUE_TRACKER.md next to <docs>
 * (`- issue 所在仓库：\`owner/name\``), or null: then gh infers it from the checkout it runs in.
 */
export function issueRepo(docs) {
  const file = join(dirname(resolve(docs)), 'ISSUE_TRACKER.md');
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/issue 所在仓库[：:]\s*`([\w.-]+\/[\w.-]+)`/);
  return m ? m[1] : null;
}

/** The branch the root checkout is on: the knowledge base's main. */
function mainBranch(root) {
  return git(root, ['symbolic-ref', '--short', 'HEAD']);
}

/** The repo's default branch: origin's HEAD, else main or master, else the current branch. */
function defaultBranch(root) {
  const head = tryGit(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) return head.replace(/^origin\//, '');
  for (const b of ['main', 'master']) if (tryGit(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])) return b;
  return mainBranch(root);
}

function excludeWorktrees(root) {
  const exclude = join(git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']), 'info', 'exclude');
  const line = `/${WORKTREES}/`;
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (text.split('\n').includes(line)) return;
  mkdirSync(dirname(exclude), { recursive: true });
  appendFileSync(exclude, `${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`);
}

const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The worktree for <branch>, created from main when missing. Legacy layout: the current checkout. */
export function kb(branch, dir = process.cwd()) {
  if (!BRANCH.test(branch ?? '')) throw usage(`分支名不合法：${branch}`);
  const b = businessRoot(dir);
  if (!b) throw usage('不在 git 仓库里');
  if (b.legacy) return { path: git(resolve(dir), ['rev-parse', '--show-toplevel']), branch: null, legacy: true, created: false };
  const path = join(b.root, WORKTREES, branch);
  if (existsSync(path)) return { path, branch, legacy: false, created: false };
  excludeWorktrees(b.root);
  const exists = tryGit(b.root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  git(b.root, exists ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path, mainBranch(b.root)]);
  return { path, branch, legacy: false, created: true };
}

class Refused extends Error {}
function usage(msg) {
  const e = new Error(msg);
  e.usage = true;
  return e;
}

/** Merge <branch> into the knowledge base's main, push if there is a remote, remove its worktree and branch. */
export function land(branch, dir = process.cwd()) {
  if (!BRANCH.test(branch ?? '')) throw usage(`分支名不合法：${branch}`);
  const b = businessRoot(dir);
  if (!b) throw usage('不在 git 仓库里');
  if (b.legacy) throw new Refused('知识库还在代码仓库里（旧布局）：知识库改动照旧跟着这个仓库的 PR 走，迁移见 /idea-loop:setup');
  const { root } = b;
  if (!tryGit(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) throw new Refused(`知识库里没有分支 ${branch}`);
  const main = mainBranch(root);
  const def = defaultBranch(root);
  if (main !== def) throw new Refused(`业务根目录停在 ${main}，不在知识库 main（${def}）上：先切回 ${def}`);
  const wt = join(root, WORKTREES, branch);
  if (existsSync(wt)) {
    const dirty = git(wt, ['status', '--porcelain']);
    if (dirty) throw new Refused(`知识库 worktree 有没提交的改动，先提交：\n${dirty}`);
  }
  let merged = false;
  if (tryGit(root, ['merge-base', '--is-ancestor', branch, main]) === null) {
    try {
      git(root, ['merge', '--no-ff', '-m', `知识库：合入 ${branch}`, branch]);
      merged = true;
    } catch {
      const conflicts = tryGit(root, ['diff', '--name-only', '--diff-filter=U']) ?? '';
      tryGit(root, ['merge', '--abort']);
      throw new Refused(
        `${branch} 跟 ${main} 冲突，main 没动。在 ${existsSync(wt) ? wt : '知识库 worktree'} 里 git merge ${main}、解完冲突提交，再跑一次 land：\n${conflicts}`,
      );
    }
  }
  const remote = tryGit(root, ['remote', 'get-url', 'origin']);
  let pushed = false;
  if (remote) {
    try {
      git(root, ['push', 'origin', main]);
      pushed = true;
    } catch (e) {
      throw new Refused(`已在本地合进 ${main}，推送 origin 失败（worktree 与分支留着）：${String(e.stderr ?? e.message).trim()}`);
    }
  }
  if (existsSync(wt)) git(root, ['worktree', 'remove', wt]);
  git(root, ['branch', '-D', branch]);
  return { root, branch, main, merged, pushed };
}

function main(argv) {
  const [cmd, a, b] = argv;
  try {
    let out;
    if (cmd === 'root') out = businessRoot(a ?? process.cwd());
    else if (cmd === 'instructions') out = instructions(a ?? process.cwd());
    else if (cmd === 'kb') out = kb(a, b ?? process.cwd());
    else if (cmd === 'land') out = land(a, b ?? process.cwd());
    else throw usage('usage: business.mjs root|instructions [<dir>] | kb|land <branch> [<dir>]');
    if (out === null) throw usage('不在 git 仓库里');
    console.log(JSON.stringify(out, null, 2));
    return 0;
  } catch (e) {
    console.error(e.message);
    return e instanceof Refused ? 1 : 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
