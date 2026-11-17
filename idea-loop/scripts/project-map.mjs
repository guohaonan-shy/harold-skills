#!/usr/bin/env node
/**
 * Which project is this session in, and where is its map? What the SessionStart hook runs to put the project map
 * of the repository (or worktree) the session opened in into the context.
 *
 * Inputs: the session's directory (its git top level and its `origin` remote), the project list — the `## 项目` section
 * of `<home>/AGENTS.md`, one line per project: `<名字>（<是什么>）: <本地路径>. Clone from <远端> if missing.` — and the map
 * `<home>/projects/<名字>/AGENTS.md`. The home is `~/home`; IDEA_LOOP_HOME overrides it (for tests).
 *
 * What it prints (nothing at all unless a line says so):
 *   not in a git repository, or no home directory   nothing
 *   the git top level is the home itself            nothing (the device map is loaded through the user-level CLAUDE.md)
 *   `origin` matches a line of the list             that project's map; over 2,000 characters only the first 2,000 and a notice line
 *   matched, but the map file is not there          one line: where the project's directory in home is, the map not written yet
 *   no `origin`, or no line matches                 nothing
 *
 * Remotes are compared as `host/owner/repo`: protocol, `user@host:` form and a trailing `.git` dropped, host lowercased,
 * so the SSH and the HTTPS clone of one repository are one project. A worktree shares its main checkout's `origin`.
 * Characters are Unicode characters, not bytes. Whatever goes wrong, nothing is printed and the exit code is 0:
 * a session must never fail to start because of this.
 *
 * Usage: node project-map.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
  return projects.find((p) => !/[/\\]|^\.\.?$/.test(p.name) && normalizeRemote(p.remote) === want) ?? null;
}

/** The text to inject for a map: all of it, or its first MAP_LIMIT characters and a notice line. */
export function mapText(text) {
  const chars = Array.from(text.trimEnd());
  if (chars.length <= MAP_LIMIT) return `${chars.join('')}\n`;
  return `${chars.slice(0, MAP_LIMIT).join('')}\n${TRUNCATED_NOTICE}\n`;
}

/** What the session starts with, for a session in `cwd`: '' or the text to inject. Throws when something unexpected breaks. */
export function projectMap({ cwd = process.cwd(), env = process.env } = {}) {
  const home = env.IDEA_LOOP_HOME || join(homedir(), 'home');
  if (!existsSync(home)) return '';
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const top = git('rev-parse', '--show-toplevel');
  if (!top) return '';
  if (realpathSync(top) === realpathSync(home)) return '';
  const origin = git('remote', 'get-url', 'origin');
  if (!origin) return '';
  const agents = join(home, 'AGENTS.md');
  if (!existsSync(agents)) return '';
  const project = findProject(parseProjects(readFileSync(agents, 'utf8')), origin);
  if (!project) return '';
  const dir = join(home, 'projects', project.name);
  const map = join(dir, 'AGENTS.md');
  if (!existsSync(map)) return `项目「${project.name}」在 home 里的目录是 ${dir}/，项目地图（AGENTS.md）还没写。\n`;
  return mapText(readFileSync(map, 'utf8'));
}

// import.meta.url is the real path, argv[1] is the path as given: through a symlink (macOS /var → /private/var) they differ
if (import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(projectMap());
  } catch {
    // nothing printed, exit 0: a broken home must not stop a session from starting
  }
}
