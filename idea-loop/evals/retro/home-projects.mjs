/**
 * How the replay runner reads and writes the project list of a copy of home: the `## 项目` section of its `AGENTS.md`,
 * and which spelling of a git remote is which repository. The same rules `dyna home` applies (`dyna/internal/home`), kept
 * here as the few pure functions the runner needs to build the home copy a replayed session starts in; the runner's tests
 * check that `dyna home where` finds the project in what these write.
 *
 * Like queue.mjs and replay.mjs this imports nothing from the plugin's other files: `dyna retro install` copies it to a
 * fixed place under ~/.idea-loop/bin/, away from the plugin.
 */

/** idea-loop's generated bootstrap files: one of them, or a `docs/` with a `spec/` or `adr/` in it, at the top of a code repository. */
export const BOOTSTRAP_FILES = ['DEVELOPMENT.md', 'REVIEW.md', 'CODING_STANDARDS.md', 'PRODUCT.md', 'ISSUE_TRACKER.md', 'GLOSSARY.md', 'DESIGN.md', 'SEO.md'];

/** `host/owner/repo` for any spelling of a git remote, or null when there is nothing to compare. */
export function normalizeRemote(remote) {
  const rest = String(remote ?? '').trim();
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
