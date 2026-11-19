/**
 * Guard — a change to the command line (dyna/) must raise dyna's version.
 *
 * The plugin's `dyna-version` names the versions of dyna it works with, and a released dyna is fetched by version
 * (`dyna-v<version>` tag). An unchanged version means the change never reaches anyone. Same shape as
 * plugin-version.test.mjs; base ref defaults to `origin/main`, DYNA_VERSION_BASE picks another.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { VERSION_FILE, findViolations, isDynaChange, versionIn } from './dyna-version.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- pure function ----------

test('code changed and the version not raised is a violation naming both versions and the file', () => {
  const v = findViolations({ changedFiles: ['dyna/internal/issues/cmd.go'], baseVersion: '0.1.0', currentVersion: '0.1.0' });
  assert.equal(v.length, 1);
  assert.match(v[0], /0\.1\.0/);
  assert.match(v[0], /internal\/version\/version\.go/);
  assert.match(v[0], /登记表/);
});

test('a raised version is fine, a lower one is not', () => {
  for (const current of ['0.1.1', '0.2.0', '1.0.0']) {
    assert.deepEqual(findViolations({ changedFiles: ['dyna/go.mod'], baseVersion: '0.1.0', currentVersion: current }), [], current);
  }
  assert.equal(findViolations({ changedFiles: ['dyna/go.mod'], baseVersion: '0.2.0', currentVersion: '0.1.9' }).length, 1);
});

test('the release config and a stored registry count as command line changes', () => {
  for (const f of ['dyna/.goreleaser.yaml', 'dyna/registry/0.1.0.json', 'dyna/cmd/dyna/main.go']) {
    assert.equal(findViolations({ changedFiles: [f], baseVersion: '0.1.0', currentVersion: '0.1.0' }).length, 1, f);
  }
});

test('a Go test file alone, or changes outside dyna/, need no new version', () => {
  assert.equal(isDynaChange('dyna/internal/issues/issues_test.go'), false);
  assert.deepEqual(findViolations({ changedFiles: ['dyna/internal/issues/issues_test.go', 'idea-loop/README.md', 'docs/spec/x/x.md', 'dynamo/a.go'], baseVersion: '0.1.0', currentVersion: '0.1.0' }), []);
});

test('dyna/ not on the base yet (the first release) is not required to bump', () => {
  assert.deepEqual(findViolations({ changedFiles: ['dyna/go.mod', 'dyna/internal/version/version.go'], baseVersion: null, currentVersion: '0.1.0' }), []);
});

test('a version.go that cannot be read is reported instead of silently passing', () => {
  const v = findViolations({ changedFiles: ['dyna/go.mod'], baseVersion: '0.1.0', currentVersion: null });
  assert.equal(v.length, 1);
  assert.match(v[0], /读不出/);
});

test('versionIn reads a var or a const', () => {
  assert.equal(versionIn('package version\n\nvar Version = "0.1.0"\n'), '0.1.0');
  assert.equal(versionIn('const Version = "12.3.40"'), '12.3.40');
  assert.equal(versionIn('var Version = "next"'), null);
});

// ---------- real repository state ----------

const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('dyna on this branch has a version above the base ref when its code changed', (t) => {
  const baseRef = process.env.DYNA_VERSION_BASE || 'origin/main';
  try {
    git('rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`);
  } catch {
    t.skip(`base ref ${baseRef} does not exist (no fetch yet?); cannot tell what changed, so the check is skipped`);
    return;
  }
  const fork = git('merge-base', 'HEAD', baseRef).trim();
  const changedFiles = [...git('diff', '--name-only', fork).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean);
  let baseVersion = null;
  try {
    baseVersion = versionIn(git('show', `${baseRef}:${VERSION_FILE}`));
  } catch {
    // not on the base yet: the first release
  }
  const currentVersion = versionIn(readFileSync(join(repoRoot, VERSION_FILE), 'utf8'));
  const violations = findViolations({ changedFiles, baseVersion, currentVersion, baseRef });
  assert.deepEqual(violations, [], `\n${violations.join('\n')}`);
});
