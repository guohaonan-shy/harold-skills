#!/usr/bin/env node
/**
 * Which project is this session in, where is its project directory in home, and how do changes get into home?
 * One script, three entry points:
 *
 *   (no argument)                       the SessionStart hook: puts the project map of the repository (or worktree) the
 *                                       session opened in into the context, preceded by a `项目目录：<路径>` line
 *   where [--project <名字>]            prints the project's directory as JSON, or says on stderr why it cannot (exit 1)
 *   commit <消息> <文件>...             commits exactly those files of home to its main, then pull --rebase and push
 *
 * Inputs: the session's directory (its git top level and its `origin` remote), the project list — the `## 项目` section
 * of `<home>/AGENTS.md`, one line per project: `<名字>（<是什么>）: <本地路径>. Clone from <远端> if missing.` — and the map
 * `<home>/projects/<名字>/AGENTS.md`. The home is `~/home`; IDEA_LOOP_HOME overrides it (for tests).
 *
 * What the hook prints (nothing at all unless a line says so):
 *   not in a git repository, or no home directory   nothing
 *   the git top level is the home itself            nothing (the device map is loaded through the user-level CLAUDE.md)
 *   `origin` matches a line of the list, and the project's directory in home has a docs/
 *                                                   `项目目录：<路径>`, then that project's map; over 2,000 characters only the
 *                                                   first 2,000 and a notice line; map file missing: one line saying so
 *   the repository has idea-loop's bootstrap files or a docs/ but no project directory in home with a docs/
 *                                                   one line: not moved yet, run /idea-loop:setup to migrate
 *   matched, but nothing in home and nothing to migrate   the map alone, if there is one
 *   no `origin`, or no line matches                 nothing
 *
 * `where` decides the same way (project in the list and `projects/<名字>/docs/` exists: its directory; otherwise
 * exit 1 and a sentence on stderr). `commit` adds only the listed files, commits only them (other sessions' staged
 * files stay staged), waits a second and retries once on a held index.lock, and when home has an `origin` pulls
 * --rebase and pushes; a push that fails is a line `home 没推上去：<原因>`, still exit 0.
 *
 * Remotes are compared as `host/owner/repo`: protocol, `user@host:` form and a trailing `.git` dropped, host lowercased,
 * so the SSH and the HTTPS clone of one repository are one project. A worktree shares its main checkout's `origin`.
 * Characters are Unicode characters, not bytes. In hook mode, whatever goes wrong, nothing is printed and the exit code is 0:
 * a session must never fail to start because of this.
 *
 * Usage:
 *   node project-map.mjs
 *   node project-map.mjs where [--project <名字>]
 *   node project-map.mjs commit <消息> <文件>...
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAP_LIMIT = 2000;
export const TRUNCATED_NOTICE = `项目地图超过 ${MAP_LIMIT} 字，已截断`;

/** `host/owner/repo` for any spelling of a git remote, or null when there is nothing to compare. */
export function normalizeRemote(remote) {
  let rest = String(remote ?? '').trim();
  let host;
  let path;
  const url = rest.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?\/(.*)$/i);
  const scp = rest.match(/^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/);
  if (url) [, host, path] = url;
  else if (scp) [, host, path] = scp;
  else return null;
  path = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!host || !path) return null;
  return `${host.toLowerCase()}/${path}`;
}

/** The lines of the `## 项目` section of the device map, as `{ name, path, remote }`; lines in any other shape are skipped. */
export function parseProjects(agentsMd) {
  const projects = [];
  let inSection = false;
  for (const line of String(agentsMd ?? '').split('\n')) {
    const heading = line.match(/^##\s+(.*?)\s*$/);
    if (heading) {
      inSection = heading[1] === '项目';
      continue;
    }
    if (!inSection) continue;
    const m = line.match(/^\s*(?:[-*]\s+)?([^\s（]+)（[^）]*）[:：]\s*(.+?)\.\s+Clone from\s+(\S+)\s+if missing\.\s*$/);
    if (m) projects.push({ name: m[1], path: m[2], remote: m[3] });
  }
  return projects;
}

/** The project whose registered remote is the same repository as `origin`, or null. A name that is not one directory name never matches. */
export function findProject(projects, origin) {
  const want = normalizeRemote(origin);
  if (!want) return null;
  return projects.find((p) => !unsafeName(p.name) && normalizeRemote(p.remote) === want) ?? null;
}

/** The text to inject for a map: all of it, or its first MAP_LIMIT characters and a notice line. */
export function mapText(text) {
  const chars = Array.from(text.trimEnd());
  if (chars.length <= MAP_LIMIT) return `${chars.join('')}\n`;
  return `${chars.slice(0, MAP_LIMIT).join('')}\n${TRUNCATED_NOTICE}\n`;
}

export const NOT_MOVED = '这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移';
export const NOT_CONNECTED = '这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`';
export const IN_HOME = '当前目录是 home 本身，要带 --project <名字>';
/** idea-loop's generated bootstrap files; one of them, or a `docs/`, at the top of a code repository means it has not moved yet. */
export const BOOTSTRAP_FILES = ['DEVELOPMENT.md', 'REVIEW.md', 'CODING_STANDARDS.md', 'PRODUCT.md', 'ISSUE_TRACKER.md', 'GLOSSARY.md', 'DESIGN.md', 'SEO.md'];

export const homeOf = (env = process.env) => env.IDEA_LOOP_HOME || join(homedir(), 'home');

const isDir = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const hasBootstrap = (root) => BOOTSTRAP_FILES.some((f) => existsSync(join(root, f))) || isDir(join(root, 'docs'));

const unsafeName = (name) => /[/\\]|^\.\.?$/.test(name);

/** A leading `~` of a registered path, spelled out. */
const expandHome = (path, env) => path.replace(/^~(?=\/|$)/, env.HOME || homedir());

/**
 * Where is the project directory for a session in `cwd` (or for the project called `project`)?
 * `{ ok: true, project, projectDir, docs, repo, clone, cloneDir, inHome: true }`, or
 * `{ ok: false, code, message, project? }` with code 'in-home', 'not-moved', 'not-connected' or 'unlisted'
 * (`project` is the list entry when the repository is in the list but its directory in home has no docs/).
 * Throws when something unexpected breaks (an unreadable home, say).
 */
export function locate({ cwd = process.cwd(), env = process.env, project: name } = {}) {
  const home = homeOf(env);
  const fail = (code, message, extra) => ({ ok: false, code, message, ...extra });
  const agents = join(home, 'AGENTS.md');
  const list = existsSync(agents) ? parseProjects(readFileSync(agents, 'utf8')) : [];

  const resolveProject = (entry, codeRoot) => {
    const projectDir = join(home, 'projects', entry.name);
    const docs = join(projectDir, 'docs');
    if (!isDir(docs)) {
      const moved = hasBootstrap(codeRoot);
      return fail(moved ? 'not-moved' : 'not-connected', moved ? NOT_MOVED : NOT_CONNECTED, { project: entry });
    }
    const remote = normalizeRemote(entry.remote);
    return {
      ok: true,
      project: entry.name,
      projectDir,
      docs,
      repo: remote.slice(remote.indexOf('/') + 1),
      clone: entry.path,
      cloneDir: expandHome(entry.path, env),
      inHome: true,
    };
  };

  if (name !== undefined) {
    const entry = unsafeName(name) ? undefined : list.find((p) => p.name === name && normalizeRemote(p.remote));
    if (!entry) return fail('unlisted', `项目清单里没有「${name}」：${NOT_CONNECTED}`);
    return resolveProject(entry, expandHome(entry.path, env));
  }

  const git = (...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const top = git('rev-parse', '--show-toplevel');
  if (!top) return fail('not-connected', NOT_CONNECTED);
  if (existsSync(home) && realpathSync(top) === realpathSync(home)) return fail('in-home', IN_HOME);
  const origin = git('remote', 'get-url', 'origin');
  const entry = origin ? findProject(list, origin) : null;
  if (!entry) return hasBootstrap(top) ? fail('not-moved', NOT_MOVED) : fail('unlisted', NOT_CONNECTED);
  return resolveProject(entry, top);
}

/**
 * Which project does the directory `docs` belong to? `<home>/projects/<名字>/docs` is that project, answered as
 * `locate({ project: <名字> })` does. Any other directory (the docs/ of a code repository, a directory at random) is not
 * in home: 'not-moved' when the directory it sits in has idea-loop's bootstrap files or is itself a code repository's
 * docs/, 'not-connected' otherwise. Same result shape as `locate`.
 */
export function locateByDocs({ docs, env = process.env }) {
  const dir = realish(docs);
  const projectDir = dirname(dir);
  if (basename(dir) === 'docs' && dirname(projectDir) === realish(join(homeOf(env), 'projects'))) {
    return locate({ project: basename(projectDir), env });
  }
  return hasBootstrap(projectDir) ? { ok: false, code: 'not-moved', message: NOT_MOVED } : { ok: false, code: 'not-connected', message: NOT_CONNECTED };
}

function mapOf(dir, name) {
  const map = join(dir, 'AGENTS.md');
  if (!existsSync(map)) return `项目「${name}」在 home 里的目录是 ${dir}/，项目地图（AGENTS.md）还没写。\n`;
  return mapText(readFileSync(map, 'utf8'));
}

/** What the session starts with, for a session in `cwd`: '' or the text to inject. Throws when something unexpected breaks. */
export function projectMap({ cwd = process.cwd(), env = process.env } = {}) {
  const home = homeOf(env);
  if (!existsSync(home)) return '';
  const found = locate({ cwd, env });
  if (!found.ok) {
    if (found.code === 'not-moved') return `${found.message}\n`;
    // in the list, but nothing in home yet and nothing to migrate: the map alone, as before
    if (found.project) return mapOf(join(home, 'projects', found.project.name), found.project.name);
    return '';
  }
  return `项目目录：${found.projectDir}\n${mapOf(found.projectDir, found.project)}`;
}

// ---- commit: the listed files of home, onto its main -----------------------------------------------------------

const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The deepest existing ancestor made real (macOS /var → /private/var), the missing rest appended. */
function realish(path) {
  const rest = [];
  let cur = resolve(path);
  while (!existsSync(cur) && dirname(cur) !== cur) {
    rest.unshift(cur.slice(dirname(cur).length + 1));
    cur = dirname(cur);
  }
  return join(realpathSync(cur), ...rest);
}

/**
 * Commit exactly `files` (relative to `cwd`, or absolute) to the branch checked out in home, then pull --rebase and
 * push when home has an `origin`. Returns `{ committed, sha, lines }`: `lines` is what to tell the caller. Throws, and
 * commits nothing, when a file is not inside home, home is not a git repository, or git refuses.
 */
export function commitToHome({ message, files, cwd = process.cwd(), env = process.env }) {
  const home = homeOf(env);
  if (!message) throw new Error('commit 要带提交消息：commit <消息> <文件>...');
  if (!files.length) throw new Error('commit 要列出文件：commit <消息> <文件>...');
  if (!existsSync(home)) throw new Error(`home 不存在：${home}`);
  const realHome = realpathSync(home);
  const paths = files.map((f) => {
    const real = realish(isAbsolute(f) ? f : resolve(cwd, f));
    if (!real.startsWith(realHome + sep)) throw new Error(`${f} 不在 home（${home}）里，什么都没提交`);
    return real.slice(realHome.length + 1);
  });

  const git = (args, { timeout } = {}) =>
    spawnSync('git', args, { cwd: realHome, encoding: 'utf8', timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  // another session holds the index for a moment: wait a second and try once more
  const gitRetry = (args) => {
    let r = git(args);
    if (r.status !== 0 && /index\.lock/.test(r.stderr)) {
      sleepMs(1000);
      r = git(args);
    }
    return r;
  };
  const must = (r, what) => {
    if (r.status !== 0) throw new Error(`${what}失败：${(r.stderr || r.stdout).trim()}`);
    return r.stdout.trim();
  };

  if (git(['rev-parse', '--git-dir']).status !== 0) throw new Error(`${home} 不是 git 仓库`);
  must(gitRetry(['add', '--', ...paths]), 'git add ');
  const lines = [];
  let sha = null;
  if (!must(git(['status', '--porcelain', '--', ...paths]), 'git status ')) {
    lines.push('列出的文件没有改动，没提交');
  } else {
    must(gitRetry(['commit', '-q', '-m', message, '--', ...paths]), 'git commit ');
    sha = must(git(['rev-parse', 'HEAD']), 'git rev-parse ');
    lines.push(`已提交到 home：${sha.slice(0, 7)} ${message.split('\n')[0]}`);
  }

  if (git(['remote', 'get-url', 'origin']).status === 0) {
    const notPushed = (why) => lines.push(`home 没推上去：${why}`);
    const text = (r) => (r.stderr || r.stdout || r.error?.message || '').trim();
    const branch = git(['symbolic-ref', '--short', 'HEAD']).stdout.trim();
    if (!branch) {
      notPushed('home 不在任何分支上');
    } else {
      const onRemote = git(['ls-remote', '--exit-code', '--heads', 'origin', branch], { timeout: 60000 });
      let ok = true;
      if (onRemote.status === 0) {
        const pulled = git(['pull', '--rebase', '--autostash', 'origin', branch], { timeout: 60000 });
        if (pulled.status !== 0) {
          git(['rebase', '--abort']);
          notPushed(`pull --rebase 失败：${text(pulled)}`);
          ok = false;
        }
      } else if (onRemote.status !== 2) {
        // 2 = reachable, no such branch yet: nothing to rebase onto, just push
        notPushed(text(onRemote));
        ok = false;
      }
      if (ok) {
        const pushed = git(['push', '-u', 'origin', branch], { timeout: 60000 });
        if (pushed.status === 0) lines.push('已推送到 origin');
        else notPushed(text(pushed));
      }
    }
  }
  return { committed: sha !== null, sha, lines };
}

function whereMain(rest) {
  const at = rest.indexOf('--project');
  if (at >= 0 && !rest[at + 1]) throw new Error('--project 要带项目名：where --project <名字>');
  const found = locate({ project: at >= 0 ? rest[at + 1] : undefined });
  if (!found.ok) {
    process.stderr.write(`${found.message}\n`);
    process.exit(1);
  }
  const { ok, ...info } = found;
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
}

// import.meta.url is the real path, argv[1] is the path as given: through a symlink (macOS /var → /private/var) they differ
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined) {
    try {
      process.stdout.write(projectMap());
    } catch {
      // nothing printed, exit 0: a broken home must not stop a session from starting
    }
  } else {
    try {
      if (command === 'where') whereMain(rest);
      else if (command === 'commit') process.stdout.write(`${commitToHome({ message: rest[0], files: rest.slice(1) }).lines.join('\n')}\n`);
      else throw new Error('usage: project-map.mjs [where [--project <名字>] | commit <消息> <文件>...]');
    } catch (err) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
  }
}
