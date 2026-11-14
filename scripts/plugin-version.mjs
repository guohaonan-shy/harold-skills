/**
 * The rule behind scripts/plugin-version.test.mjs: a plugin whose directory has changes must have
 * a `version` larger than the one on the base ref. Pure — no git, no filesystem — so the test can
 * feed it constructed inputs.
 */

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** Compare two `x.y.z` strings numerically segment by segment. Returns <0, 0 or >0. */
export function compareVersions(a, b) {
  const pa = VERSION.exec(a);
  const pb = VERSION.exec(b);
  if (!pa || !pb) throw new Error(`not an x.y.z version: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  return 0;
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
        `${plugin}: 版本号不是 x.y.z（${baseRef} 上是 ${base}，当前是 ${current}），没法比大小；改成三段数字。`,
      );
      continue;
    }
    if (compareVersions(current, base) > 0) continue;

    violations.push(
      `${plugin}: 这个插件目录下有改动，但 version 是 ${current}，没有比 ${baseRef} 上的 ${base} 大。` +
        `没升过：按 REVIEW.md 的三档规则（major / minor / patch）从 ${base} 往上升。` +
        `升过但等于 ${base}（别的 PR 先合并，撞号）：从 ${baseRef} 的新版本 ${base} 重新按同一档升。`,
    );
  }
  return violations;
}
