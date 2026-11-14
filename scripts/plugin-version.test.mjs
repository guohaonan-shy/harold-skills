/**
 * Guard — a PR that touches a plugin directory must raise that plugin's `version`.
 *
 * Projects that install a plugin fetch it by `.claude-plugin/plugin.json` `version`; an unchanged
 * version means the change never reaches them. This file lives at the repo root (not inside any
 * plugin) because the rule is about how this repo ships, and a test inside a plugin would ship to
 * every project that installs it. Which tier (major / minor / patch) is right is not checked here;
 * the reviewer checks it against REVIEW.md.
 *
 * Base ref defaults to `origin/main`; set PLUGIN_VERSION_BASE to compare against another ref.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { findViolations, compareVersions } from './plugin-version.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- pure function ----------

test('a plugin with changes and an unchanged version is a violation naming the plugin and the base version', () => {
  const v = findViolations({
    changedFiles: ['idea-loop/skills/engineering/implement/SKILL.md'],
    baseVersions: { 'idea-loop': '0.1.14' },
    currentVersions: { 'idea-loop': '0.1.14' },
  });
  assert.equal(v.length, 1);
  assert.match(v[0], /idea-loop/);
  assert.match(v[0], /0\.1\.14/);
  assert.match(v[0], /三档/);
});

test('version equal to the base (another PR already took the number) tells the author to re-bump from the base version', () => {
  const v = findViolations({
    changedFiles: ['idea-loop/README.md'],
    baseVersions: { 'idea-loop': '0.1.14' },
    currentVersions: { 'idea-loop': '0.1.14' },
  });
  assert.equal(v.length, 1);
  assert.match(v[0], /撞号/);
  assert.match(v[0], /重新/);
});

test('a plugin with changes and a larger version is fine', () => {
  for (const current of ['0.1.15', '0.2.0', '1.0.0']) {
    assert.deepEqual(
      findViolations({
        changedFiles: ['idea-loop/agents/implementer.md'],
        baseVersions: { 'idea-loop': '0.1.14' },
        currentVersions: { 'idea-loop': current },
      }),
      [],
      current,
    );
  }
});

test('a version lower than the base is a violation too', () => {
  const v = findViolations({
    changedFiles: ['idea-loop/README.md'],
    baseVersions: { 'idea-loop': '0.1.14' },
    currentVersions: { 'idea-loop': '0.1.13' },
  });
  assert.equal(v.length, 1);
});

test('changes only under docs/ or at the repo root are fine', () => {
  assert.deepEqual(
    findViolations({
      changedFiles: ['docs/spec/x/x.md', 'AGENTS.md', 'REVIEW.md', 'scripts/plugin-version.test.mjs'],
      baseVersions: { 'idea-loop': '0.1.14', 'happy-life': '0.2.0' },
      currentVersions: { 'idea-loop': '0.1.14', 'happy-life': '0.2.0' },
    }),
    [],
  );
});

test('a plugin that does not exist on the base yet (new plugin) is not required to bump', () => {
  assert.deepEqual(
    findViolations({
      changedFiles: ['new-plugin/README.md', 'new-plugin/.claude-plugin/plugin.json'],
      baseVersions: { 'idea-loop': '0.1.14' },
      currentVersions: { 'idea-loop': '0.1.14', 'new-plugin': '0.1.0' },
    }),
    [],
  );
});

test('two plugins changed, only one bumped: only the one without a bump is reported', () => {
  const v = findViolations({
    changedFiles: ['idea-loop/README.md', 'happy-life/skills/a/SKILL.md'],
    baseVersions: { 'idea-loop': '0.1.14', 'happy-life': '0.2.0' },
    currentVersions: { 'idea-loop': '0.1.15', 'happy-life': '0.2.0' },
  });
  assert.equal(v.length, 1);
  assert.match(v[0], /happy-life/);
  assert.doesNotMatch(v[0], /idea-loop/);
});

test('a directory whose name merely starts with a plugin name is not that plugin', () => {
  assert.deepEqual(
    findViolations({
      changedFiles: ['idea-loop-notes/a.md'],
      baseVersions: { 'idea-loop': '0.1.14' },
      currentVersions: { 'idea-loop': '0.1.14' },
    }),
    [],
  );
});

test('versions compare as three numeric segments, not as strings', () => {
  assert.equal(compareVersions('0.1.10', '0.1.9') > 0, true);
  assert.equal(compareVersions('0.2.0', '0.1.99') > 0, true);
  assert.equal(compareVersions('1.0.0', '0.99.99') > 0, true);
  assert.equal(compareVersions('0.1.14', '0.1.14'), 0);
});

test('an unparsable version is reported instead of silently passing', () => {
  const v = findViolations({
    changedFiles: ['idea-loop/README.md'],
    baseVersions: { 'idea-loop': '0.1.14' },
    currentVersions: { 'idea-loop': 'next' },
  });
  assert.equal(v.length, 1);
  assert.match(v[0], /next/);
});

// ---------- real repository state ----------

const git = (...args) =>
  execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('every plugin changed on this branch has a version above the base ref', (t) => {
  const baseRef = process.env.PLUGIN_VERSION_BASE || 'origin/main';
  try {
    git('rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`);
  } catch {
    t.skip(`base ref ${baseRef} does not exist (no fetch yet?); cannot tell what changed, so the check is skipped`);
    return;
  }
  const fork = git('merge-base', 'HEAD', baseRef).trim();
  const changedFiles = [
    ...git('diff', '--name-only', fork).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean);

  const currentVersions = {};
  for (const name of readdirSync(repoRoot)) {
    const manifest = join(repoRoot, name, '.claude-plugin', 'plugin.json');
    if (existsSync(manifest)) currentVersions[name] = JSON.parse(readFileSync(manifest, 'utf8')).version;
  }
  const baseVersions = {};
  for (const name of Object.keys(currentVersions)) {
    try {
      baseVersions[name] = JSON.parse(git('show', `${baseRef}:${name}/.claude-plugin/plugin.json`)).version;
    } catch {
      // not on the base yet: a new plugin
    }
  }

  const violations = findViolations({ changedFiles, baseVersions, currentVersions, baseRef });
  assert.deepEqual(violations, [], `\n${violations.join('\n')}`);
});
