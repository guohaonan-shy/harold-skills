/**
 * The rule behind scripts/dyna-version.test.mjs: a change to dyna (the command line in dyna/) must raise the
 * version written in dyna/internal/version/version.go above the one on the base ref. Pure — no git, no filesystem.
 *
 * Test files (`*_test.go`) are not "the command line": a test can be added without a release. Everything
 * else under dyna/ is, including the stored registries and the release config.
 */
import { compareVersions } from './plugin-version.mjs';

export const VERSION_FILE = 'dyna/internal/version/version.go';

/** The version written in version.go: `var Version = "0.1.0"` (or a const). */
export function versionIn(source) {
  return /\bVersion\s*=\s*"(\d+\.\d+\.\d+)"/.exec(String(source))?.[1] ?? null;
}

/** Whether a changed path is dyna code (anything under dyna/ that is not a Go test file). */
export const isDynaChange = (file) => file.startsWith('dyna/') && !file.endsWith('_test.go');

/**
 * @param {object} input
 * @param {string[]} input.changedFiles   repo-relative paths changed since the fork point
 * @param {string|null} input.baseVersion version on the base ref; null when dyna/ is not there yet (new)
 * @param {string|null} input.currentVersion version in the working tree
 * @param {string} [input.baseRef]
 * @returns {string[]}
 */
export function findViolations({ changedFiles, baseVersion, currentVersion, baseRef = 'origin/main' }) {
  if (baseVersion === null) return [];
  if (!changedFiles.some(isDynaChange)) return [];
  if (currentVersion === null) return [`dyna: 读不出 ${VERSION_FILE} 里的版本号（要写成 Version = "x.y.z"）。`];
  if (compareVersions(currentVersion, baseVersion) > 0) return [];
  return [
    `dyna: 命令行目录下有改动，但版本是 ${currentVersion}，没有比 ${baseRef} 上的 ${baseVersion} 大。` +
      `改了命令行代码就必须升 ${VERSION_FILE} 的版本（语义化版本：只加不删升小版本，删或改含义升大版本），` +
      `并把新版本的登记表存进 dyna/registry/（dyna registry --json）。` +
      `升过但等于 ${baseVersion}（别的 PR 先合并，撞号）：从 ${baseRef} 的新版本重新升。`,
  ];
}
