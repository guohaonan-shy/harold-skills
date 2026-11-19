/**
 * The plugin's launcher, `bin/dyna`: it hands the call to the installed command line together with the plugin's
 * directory and the version range, says what to run when the binary is missing or of the wrong version, and
 * installs / upgrades the binary from a release.
 *
 * Binaries of other versions are real dyna builds with the version overridden at link time (`-X`): the version
 * gate is the binary's, so that is what is being tested. A stand-in shell script plays the binary where only what
 * the launcher passes on matters. Releases are directories read through file:// URLs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pluginRoot, '..');
const hasGo = spawnSync('go', ['version']).status === 0;

const tmp = (what) => realpathSync(mkdtempSync(join(tmpdir(), `dyna-${what}-`)));

/** A plugin directory of its own: the real launcher, with the range file written as given. */
function pluginWith(range) {
  const root = tmp('plugin');
  mkdirSync(join(root, 'bin'));
  copyFileSync(join(pluginRoot, 'bin', 'dyna'), join(root, 'bin', 'dyna'));
  chmodSync(join(root, 'bin', 'dyna'), 0o755);
  writeFileSync(join(root, 'dyna-version'), `# a comment line\n${range}\n`);
  return root;
}

/** Runs the plugin's launcher with HOME at `home`; the binary is looked for in <home>/.idea-loop/bin/. */
function launch(root, home, args, env = {}) {
  const r = spawnSync(join(root, 'bin', 'dyna'), args, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function install(home, file) {
  mkdirSync(join(home, '.idea-loop', 'bin'), { recursive: true });
  const dest = join(home, '.idea-loop', 'bin', 'dyna');
  copyFileSync(file, dest);
  chmodSync(dest, 0o755);
}

/** A binary reporting `version`: dyna built with that version linked in. */
const built = new Map();
function dynaOf(version) {
  if (!built.has(version)) {
    const out = join(tmp('build'), 'dyna');
    const r = spawnSync('go', ['build', '-ldflags', `-X github.com/guohaonan-shy/harold-skills/dyna/internal/version.Version=${version}`, '-o', out, './cmd/dyna'], { cwd: join(repoRoot, 'dyna'), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    built.set(version, out);
  }
  return built.get(version);
}

test('without the binary: says to run /idea-loop:setup and exits 1; a hook gets the line and exit 0', () => {
  const root = pluginWith('>=0.0.1 <1.0.0');
  const home = tmp('home');
  const r = launch(root, home, ['issues', 'show']);
  assert.equal(r.code, 1);
  assert.equal(r.out, '');
  assert.match(r.err, /\/idea-loop:setup/);
  const hook = launch(root, home, ['issues', 'guard', '--hook']);
  assert.equal(hook.code, 0);
  assert.match(hook.err, /\/idea-loop:setup/);
  assert.equal(hook.err.trim().split('\n').length, 1);
});

test('it passes the plugin directory, the range (comments left out) and every argument on, and the binary\'s exit code back', () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  const stub = join(tmp('stub'), 'dyna');
  writeFileSync(stub, '#!/bin/sh\nprintf "root=%s\\nrange=%s\\nargs=%s\\n" "$IDEA_LOOP_PLUGIN_ROOT" "$IDEA_LOOP_CLI_RANGE" "$*"\nexit 7\n');
  install(home, stub);
  const r = launch(root, home, ['issues', 'show', 'a b', '--x=1']);
  assert.equal(r.code, 7);
  assert.deepEqual(r.out.trim().split('\n'), [`root=${root}`, 'range=>=0.4.0 <1.0.0', 'args=issues show a b --x=1']);
});

test('a binary below the range is not run: it says its version, the range, and to upgrade through /idea-loop:setup', { skip: !hasGo }, () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  install(home, dynaOf('0.3.2'));
  const r = launch(root, home, ['version']);
  assert.equal(r.code, 1);
  assert.equal(r.out, '', 'nothing ran');
  assert.match(r.err, /0\.3\.2/);
  assert.match(r.err, />=0\.4\.0 <1\.0\.0/);
  assert.match(r.err, /\/idea-loop:setup/);
  assert.match(r.err, /升级/);
});

test('a binary at or over the upper limit is not run: it says to update the plugin through /plugin', { skip: !hasGo }, () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  install(home, dynaOf('1.0.0'));
  const r = launch(root, home, ['version']);
  assert.equal(r.code, 1);
  assert.equal(r.out, '');
  assert.match(r.err, /1\.0\.0/);
  assert.match(r.err, /\/plugin/);
  assert.doesNotMatch(r.err, /\/idea-loop:setup/);
});

test('a binary inside the range runs', { skip: !hasGo }, () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  install(home, dynaOf('0.5.0'));
  const r = launch(root, home, ['version']);
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), '0.5.0');
});

test('a hook call with a binary of the wrong version is not stopped: one line on stderr, exit 0, nothing run', { skip: !hasGo }, () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  install(home, dynaOf('0.3.2'));
  const r = launch(root, home, ['issues', 'guard', '--hook']);
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.equal(r.err.trim().split('\n').length, 1);
  assert.match(r.err, /0\.3\.2/);
});

// ---------- self install / self upgrade ----------

const platform = () => {
  const os = { Darwin: 'darwin', Linux: 'linux' }[spawnSync('uname', ['-s'], { encoding: 'utf8' }).stdout.trim()];
  const arch = { arm64: 'arm64', aarch64: 'arm64', x86_64: 'amd64', amd64: 'amd64' }[spawnSync('uname', ['-m'], { encoding: 'utf8' }).stdout.trim()];
  return `${os}_${arch}`;
};

/** A release directory: for each version a package holding a `dyna` that prints its version, and the checksum file. */
function releaseWith(versions, { lie = false } = {}) {
  const dir = tmp('release');
  for (const v of versions) {
    const work = tmp('pack');
    writeFileSync(join(work, 'dyna'), `#!/bin/sh\necho "dyna ${v}"\n`);
    chmodSync(join(work, 'dyna'), 0o755);
    const sub = join(dir, `dyna-v${v}`);
    mkdirSync(sub);
    const archive = `dyna_${v}_${platform()}.tar.gz`;
    assert.equal(spawnSync('tar', ['-czf', join(sub, archive), '-C', work, 'dyna']).status, 0);
    const sum = lie ? '0'.repeat(64) : createHash('sha256').update(readFileSync(join(sub, archive))).digest('hex');
    writeFileSync(join(sub, `dyna_${v}_checksums.txt`), `${sum}  ${archive}\n`);
  }
  const tags = [...versions.map((v) => ({ tag_name: `dyna-v${v}` })), { tag_name: 'v9.9.9' }, { tag_name: 'idea-loop-v2.0.0' }];
  writeFileSync(join(dir, 'releases.json'), JSON.stringify(tags, null, 2));
  return { base: `file://${dir}`, api: `file://${join(dir, 'releases.json')}` };
}

const seams = (rel) => ({ IDEA_LOOP_RELEASE_BASE: rel.base, IDEA_LOOP_RELEASE_API: rel.api });
const installed = (home) => join(home, '.idea-loop', 'bin', 'dyna');
const outputOf = (file) => spawnSync(file, [], { encoding: 'utf8' }).stdout.trim();

test('self install takes the lowest version the range accepts, checks its checksum, and puts the binary in ~/.idea-loop/bin without the binary being there', () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  const rel = releaseWith(['0.4.0', '0.5.0']);
  assert.equal(existsSync(installed(home)), false);
  const r = launch(root, home, ['self', 'install'], seams(rel));
  assert.equal(r.code, 0, r.err);
  assert.equal(outputOf(installed(home)), 'dyna 0.4.0');
});

test('self install <version> takes that one', () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  const r = launch(root, home, ['self', 'install', '0.5.0'], seams(releaseWith(['0.4.0', '0.5.0'])));
  assert.equal(r.code, 0, r.err);
  assert.equal(outputOf(installed(home)), 'dyna 0.5.0');
});

test('a package whose checksum does not match is refused and an installed binary is left alone', () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  const stub = join(tmp('stub'), 'dyna');
  writeFileSync(stub, '#!/bin/sh\necho "dyna old"\n');
  install(home, stub);
  const r = launch(root, home, ['self', 'upgrade'], seams(releaseWith(['0.4.0'], { lie: true })));
  assert.equal(r.code, 1);
  assert.match(r.err, /校验和/);
  assert.equal(outputOf(installed(home)), 'dyna old');
  const fresh = tmp('home');
  assert.equal(launch(root, fresh, ['self', 'install'], seams(releaseWith(['0.4.0'], { lie: true }))).code, 1);
  assert.equal(existsSync(installed(fresh)), false, 'nothing installed on a bad checksum');
});

test('self upgrade takes the highest published version inside the range, not a newer major, not another project\'s tag', () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  const rel = releaseWith(['0.4.0', '0.5.0', '0.10.1', '1.0.0']);
  const r = launch(root, home, ['self', 'upgrade'], seams(rel));
  assert.equal(r.code, 0, r.err);
  assert.equal(outputOf(installed(home)), 'dyna 0.10.1');
});

test('self upgrade with nothing published inside the range fails and says so', () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const home = tmp('home');
  const r = launch(root, home, ['self', 'upgrade'], seams(releaseWith(['0.3.0', '1.0.0'])));
  assert.equal(r.code, 1);
  assert.match(r.err, />=0\.4\.0 <1\.0\.0/);
  assert.equal(existsSync(installed(home)), false);
});

test('self with no or an unknown action prints the usage and exits 1', () => {
  const root = pluginWith('>=0.4.0 <1.0.0');
  const r = launch(root, tmp('home'), ['self']);
  assert.equal(r.code, 1);
  assert.match(r.err, /self install/);
});

test('IDEA_LOOP_DYNA_BIN runs that binary instead of the installed one, and is not needed to be under HOME', () => {
  const root = pluginWith('>=0.0.1 <1.0.0');
  const stub = join(tmp('stub'), 'dyna-local');
  writeFileSync(stub, '#!/bin/sh\necho "local $*"\n');
  chmodSync(stub, 0o755);
  const r = launch(root, tmp('home'), ['a', 'b'], { IDEA_LOOP_DYNA_BIN: stub });
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), 'local a b');
});

test('the range file of the plugin itself is a range the launcher can read', () => {
  const text = readFileSync(join(pluginRoot, 'dyna-version'), 'utf8').split('\n').filter((l) => !/^\s*#/.test(l) && l.trim()).join(' ').trim();
  assert.match(text, /^>=\d+\.\d+\.\d+( <\d+\.\d+\.\d+)?$/);
});
