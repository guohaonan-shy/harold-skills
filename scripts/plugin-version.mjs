/**
 * The rule behind scripts/plugin-version.test.mjs: a plugin whose directory has changes must have
 * a `version` larger than the one on the base ref. Pure — no git, no filesystem — so the test can
 * feed it constructed inputs.
 */

// `x.y.z`, optionally with a semver prerelease suffix such as `-beta.1` (a beta of x.y.z).
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?$/;

/** Compare two prerelease suffixes the semver way: dot-separated, numbers numerically, words as text, numbers first. */
function comparePrerelease(a, b) {
  const xa = a.split('.');
  const xb = b.split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    if (xa[i] === undefined) return -1;
    if (xb[i] === undefined) return 1;
    const na = /^\d+$/.test(xa[i]);
    const nb = /^\d+$/.test(xb[i]);
    if (na && nb) {
      const d = Number(xa[i]) - Number(xb[i]);
      if (d !== 0) return d;
    } else if (na !== nb) {
      return na ? -1 : 1;
    } else if (xa[i] !== xb[i]) {
      return xa[i] < xb[i] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Compare two `x.y.z[-prerelease]` strings: the three numbers segment by segment, then a release
 * sorts after its own prereleases (`0.2.0-beta.1` < `0.2.0`). Returns <0, 0 or >0.
 */
export function compareVersions(a, b) {
  const pa = VERSION.exec(a);
  const pb = VERSION.exec(b);
  if (!pa || !pb) throw new Error(`not an x.y.z version: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  if (pa[4] === undefined && pb[4] === undefined) return 0;
  if (pa[4] === undefined) return 1;
  if (pb[4] === undefined) return -1;
  return comparePrerelease(pa[4], pb[4]);
}

/**
 * @param {object} input
 * @param {string[]} input.changedFiles  repo-relative paths changed since the fork point (working tree included)
 * @param {Record<string,string>} input.baseVersions     plugin dir -> version on the base ref (absent = new plugin)
 * @param {Record<string,string>} input.currentVersions  plugin dir -> version in the working tree
 * @param {string} [input.baseRef]  only used in messages
 * @returns {string[]} one message per violating plugin
 */
export function findViolations({ changedFiles, baseVersions, currentVersions, baseRef = 'origin/main' }) {
  const violations = [];
  for (const [plugin, current] of Object.entries(currentVersions)) {
    if (!(plugin in baseVersions)) continue;
    if (!changedFiles.some((f) => f.startsWith(`${plugin}/`))) continue;
    const base = baseVersions[plugin];

    if (!VERSION.test(current) || !VERSION.test(base)) {
      violations.push(
        `${plugin}: 版本号不是 x.y.z 或 x.y.z-<预发布>（${baseRef} 上是 ${base}，当前是 ${current}），没法比大小；改成三段数字（可带 -beta.1 这类后缀）。`,
      );
      continue;
    }
    if (compareVersions(current, base) > 0) continue;

    violations.push(
      `${plugin}: 这个插件目录下有改动，但 version 是 ${current}，没有比 ${baseRef} 上的 ${base} 大。` +
        `没升过：按 ~/home/projects/harold-skills/REVIEW.md 的三档规则（major / minor / patch）从 ${base} 往上升。` +
        `升过但等于 ${base}（别的 PR 先合并，撞号）：从 ${baseRef} 的新版本 ${base} 重新按同一档升。`,
    );
  }
  return violations;
}
