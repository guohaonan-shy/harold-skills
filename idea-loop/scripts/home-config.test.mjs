/**
 * home-config.mjs does the mechanical part of setup's "three user-level changes": enable the plugin in the
 * user-level settings.json, point autoMemoryDirectory at <home>/memory, turn the user-level CLAUDE.md into a
 * symlink to <home>/AGENTS.md. `plan` prints before/after and writes nothing; `apply` backs up first, then writes.
 *
 * Every test runs the command line under a temporary HOME (and IDEA_LOOP_HOME where it overrides), so the
 * machine's real ~/.claude and ~/home are never touched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeAgents, pluginKey } from './home-config.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(pluginRoot, 'scripts', 'home-config.mjs');
const marketplace = JSON.parse(readFileSync(join(pluginRoot, '..', '.claude-plugin', 'marketplace.json'), 'utf8')).name;
const KEY = `idea-loop@${marketplace}`;

const SETTINGS = {
  env: { SOME_TOKEN: 'secret-value', OTHER: '1' },
  enabledPlugins: { 'other@somewhere': true, 'off@somewhere': false },
  model: 'opus',
  permissions: { allow: ['Bash(ls:*)'] },
};
const CLAUDE_MD = '# 我的规矩\n\n- 用中文回复\n- 先说结论\n\n## 沟通\n\n别用缩写。\n';
const HOME_AGENTS = '# AGENTS\n\n## 设备地图\n\n去 projects/ 查项目事实。\n\n## 项目\n\n- example-app（示例）: ~/code/example-app. Clone from https://example.test/acme/example-app if missing.\n';

const sh = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

/** A temporary HOME with ~/.claude/{settings.json,CLAUDE.md} and a home repo at ~/home (the default location). */
function rig({ settings = SETTINGS, claudeMd = CLAUDE_MD, homeDir = 'home' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'home-config-'));
  const HOME = join(root, 'user');
  const claude = join(HOME, '.claude');
  const home = join(HOME, homeDir);
  mkdirSync(claude, { recursive: true });
  mkdirSync(home, { recursive: true });
  if (settings) writeFileSync(join(claude, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  if (claudeMd !== null) writeFileSync(join(claude, 'CLAUDE.md'), claudeMd);
  writeFileSync(join(home, 'AGENTS.md'), HOME_AGENTS);
  sh(home, 'init', '-q', '-b', 'main');
  sh(home, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  sh(home, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  return { root, HOME, claude, home, settingsPath: join(claude, 'settings.json'), claudeMdPath: join(claude, 'CLAUDE.md') };
}

// The child gets exactly this env, so the machine running the test cannot leak in.
const run = (r, args, extraEnv = {}) =>
  spawnSync(process.execPath, [script, ...args], { env: { PATH: process.env.PATH, HOME: r.HOME, ...extraEnv }, encoding: 'utf8' });

/** Every file and symlink under a directory (not .git), as path → content or `link:<target>`. */
function snapshot(dir, base = dir, out = {}) {
  for (const name of readdirSync(dir).sort()) {
    if (name === '.git') continue;
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out[p.slice(base.length)] = `link:${readlinkSync(p)}`;
    else if (st.isDirectory()) { out[p.slice(base.length) + '/'] = 'dir'; snapshot(p, base, out); }
    else out[p.slice(base.length)] = readFileSync(p, 'utf8');
  }
  return out;
}

const backups = (r) => (existsSync(join(r.home, '.backup')) ? readdirSync(join(r.home, '.backup')) : []);

test('plan lists before and after for the three places and writes nothing', () => {
  const r = rig();
  const before = snapshot(r.root);
  const res = run(r, ['plan']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, new RegExp(KEY.replace('.', '\\.')));
  assert.match(res.stdout, /autoMemoryDirectory/);
  assert.ok(res.stdout.includes(join(r.home, 'memory')));
  assert.ok(res.stdout.includes(join(r.home, 'AGENTS.md')));
  assert.deepEqual(snapshot(r.root), before);
});

test('apply backs up settings.json and CLAUDE.md byte for byte before changing them', () => {
  const r = rig();
  const settingsBefore = readFileSync(r.settingsPath, 'utf8');
  const res = run(r, ['apply']);
  assert.equal(res.status, 0, res.stderr);
  const dirs = backups(r);
  assert.equal(dirs.length, 1);
  assert.equal(readFileSync(join(r.home, '.backup', dirs[0], 'settings.json'), 'utf8'), settingsBefore);
  assert.equal(readFileSync(join(r.home, '.backup', dirs[0], 'CLAUDE.md'), 'utf8'), CLAUDE_MD);
});

test('apply changes settings.json by two keys only; every other key stays deep-equal (env included)', () => {
  const r = rig();
  assert.equal(run(r, ['apply']).status, 0);
  const after = JSON.parse(readFileSync(r.settingsPath, 'utf8'));
  const expected = structuredClone(SETTINGS);
  expected.enabledPlugins[KEY] = true;
  expected.autoMemoryDirectory = join(r.home, 'memory');
  assert.deepEqual(after, expected);
  assert.deepEqual(after.env, SETTINGS.env);
});

test('apply turns CLAUDE.md into a symlink to <home>/AGENTS.md and moves its text, whole, outside the two idea-loop sections', () => {
  const r = rig();
  assert.equal(run(r, ['apply']).status, 0);
  assert.ok(lstatSync(r.claudeMdPath).isSymbolicLink());
  assert.equal(resolve(dirname(r.claudeMdPath), readlinkSync(r.claudeMdPath)), join(r.home, 'AGENTS.md'));
  const agents = readFileSync(join(r.home, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes(CLAUDE_MD), 'original text, verbatim');
  assert.ok(agents.endsWith(HOME_AGENTS.slice(HOME_AGENTS.indexOf('## 设备地图'))), 'both idea-loop sections untouched');
  assert.ok(agents.indexOf(CLAUDE_MD) < agents.indexOf('## 设备地图'), 'the moved text is before them, not inside');
  assert.equal(readFileSync(r.claudeMdPath, 'utf8'), agents, 'reading the link gives the home file');
});

test('home .gitignore ignores .backup/, so git status never shows it', () => {
  const r = rig();
  assert.equal(run(r, ['apply']).status, 0);
  assert.match(readFileSync(join(r.home, '.gitignore'), 'utf8'), /^\.backup\/$/m);
  const status = sh(r.home, 'status', '--porcelain', '-uall').stdout;
  assert.ok(!status.includes('.backup'), status);
  assert.ok(status.includes('AGENTS.md'), 'sanity: the real changes do show');
});

test('an existing .gitignore keeps its lines and gets .backup/ added once', () => {
  const r = rig();
  writeFileSync(join(r.home, '.gitignore'), 'node_modules/\n');
  run(r, ['apply']);
  const lines = readFileSync(join(r.home, '.gitignore'), 'utf8').split('\n').filter(Boolean);
  assert.deepEqual(lines, ['node_modules/', '.backup/']);
});

test('running apply again: plan says "已是" three times, apply changes no file and makes no new backup', () => {
  const r = rig();
  assert.equal(run(r, ['apply']).status, 0);
  const before = snapshot(r.root);
  const plan = run(r, ['plan']);
  assert.equal(plan.stdout.match(/已是/g).length, 3, plan.stdout);
  const again = run(r, ['apply']);
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual(snapshot(r.root), before);
  assert.equal(backups(r).length, 1);
});

test('only items 1 and 3: autoMemoryDirectory is neither listed nor written', () => {
  const r = rig();
  const plan = run(r, ['plan', '--only', '1,3']);
  assert.ok(!plan.stdout.includes('autoMemoryDirectory'), plan.stdout);
  const res = run(r, ['apply', '--only', '1,3']);
  assert.equal(res.status, 0, res.stderr);
  const after = JSON.parse(readFileSync(r.settingsPath, 'utf8'));
  assert.equal(after.enabledPlugins[KEY], true);
  assert.ok(!('autoMemoryDirectory' in after));
  assert.ok(lstatSync(r.claudeMdPath).isSymbolicLink());
});

test('the second run of a subset is also a no-op, and the left-out item is still pending for a later run', () => {
  const r = rig();
  run(r, ['apply', '--only', '1,3']);
  const before = snapshot(r.root);
  assert.equal(run(r, ['plan', '--only', '1,3']).stdout.match(/已是/g).length, 2);
  run(r, ['apply', '--only', '1,3']);
  assert.deepEqual(snapshot(r.root), before);
  const later = run(r, ['apply', '--only', '2']);
  assert.equal(later.status, 0, later.stderr);
  assert.equal(JSON.parse(readFileSync(r.settingsPath, 'utf8')).autoMemoryDirectory, join(r.home, 'memory'));
});

test('CLAUDE.md already a symlink somewhere else: plan flags it for a human and apply leaves it alone', () => {
  const r = rig({ claudeMd: null });
  const elsewhere = join(r.root, 'elsewhere.md');
  writeFileSync(elsewhere, 'not ours\n');
  symlinkSync(elsewhere, r.claudeMdPath);
  const plan = run(r, ['plan']);
  assert.match(plan.stdout, /已是别处的软链，要人处理/);
  const agentsBefore = readFileSync(join(r.home, 'AGENTS.md'), 'utf8');
  const res = run(r, ['apply']);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(readlinkSync(r.claudeMdPath), elsewhere);
  assert.equal(readFileSync(elsewhere, 'utf8'), 'not ours\n');
  assert.equal(readFileSync(join(r.home, 'AGENTS.md'), 'utf8'), agentsBefore);
  assert.equal(JSON.parse(readFileSync(r.settingsPath, 'utf8')).enabledPlugins[KEY], true, 'the other two still go ahead');
  assert.match(res.stdout, /要人处理/);
});

test('no CLAUDE.md at all: the link is created and AGENTS.md is not touched', () => {
  const r = rig({ claudeMd: null });
  assert.equal(run(r, ['apply']).status, 0);
  assert.ok(lstatSync(r.claudeMdPath).isSymbolicLink());
  assert.equal(readFileSync(join(r.home, 'AGENTS.md'), 'utf8'), HOME_AGENTS);
  assert.ok(!existsSync(join(r.home, '.backup', backups(r)[0], 'CLAUDE.md')), 'nothing to back up');
});

test('values already in place are "已是": plugin enabled and memory dir set need no change, no backup is made', () => {
  const settings = { ...SETTINGS, enabledPlugins: { ...SETTINGS.enabledPlugins, [KEY]: true } };
  const r = rig({ settings });
  settings.autoMemoryDirectory = join(r.home, 'memory');
  writeFileSync(r.settingsPath, JSON.stringify(settings, null, 2) + '\n');
  const plan = JSON.parse(run(r, ['plan', '--json']).stdout);
  assert.deepEqual(plan.map((i) => i.status), ['already', 'already', 'todo']);
  run(r, ['apply', '--only', '1,2']);
  assert.equal(backups(r).length, 0);
});

test('IDEA_LOOP_HOME moves the home; the user-level config stays under HOME/.claude', () => {
  const r = rig({ homeDir: 'elsewhere-home' });
  const res = run(r, ['apply'], { IDEA_LOOP_HOME: r.home });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(readFileSync(r.settingsPath, 'utf8')).autoMemoryDirectory, join(r.home, 'memory'));
  assert.equal(backups(r).length, 1);
  assert.ok(!existsSync(join(r.HOME, 'home')), 'the default location was not created');
});

test('settings.json keeps its indentation and trailing newline', () => {
  const r = rig();
  writeFileSync(r.settingsPath, JSON.stringify(SETTINGS, null, 4));
  run(r, ['apply']);
  const text = readFileSync(r.settingsPath, 'utf8');
  assert.match(text, /\n {4}"env"/);
  assert.ok(!text.endsWith('\n'));
});

test('--json on plan gives one record per selected item', () => {
  const r = rig();
  const plan = JSON.parse(run(r, ['plan', '--json', '--only', '3,1']).stdout);
  assert.deepEqual(plan.map((i) => i.id), ['plugin', 'claude-md']);
  assert.ok(plan.every((i) => i.status === 'todo' && i.before && i.after));
});

test('refuses without writing: home missing, unknown --only item, unparsable settings.json, unknown command', () => {
  const r = rig();
  const bad = [
    [r, ['apply', '--only', '4']],
    [r, ['bogus']],
    [{ ...r, HOME: join(r.root, 'nowhere') }, ['apply']],
  ];
  for (const [rr, args] of bad) {
    const before = snapshot(r.root);
    const res = run(rr, args);
    assert.equal(res.status, 1, args.join(' '));
    assert.ok(res.stderr.length > 0);
    assert.deepEqual(snapshot(r.root), before);
  }
  writeFileSync(r.settingsPath, '{ not json');
  const before = snapshot(r.root);
  const res = run(r, ['apply']);
  assert.equal(res.status, 1);
  assert.deepEqual(snapshot(r.root), before);
});

test('pluginKey: <plugin>@<marketplace> from the install path, never hard-coded', () => {
  const root = mkdtempSync(join(tmpdir(), 'home-config-key-'));
  const at = (...p) => {
    const dir = join(root, ...p);
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'widget' }));
    return dir;
  };
  assert.equal(pluginKey(at('.claude', 'plugins', 'cache', 'acme-market', 'widget', '1.2.3')), 'widget@acme-market');
  assert.equal(pluginKey(at('.claude', 'plugins', 'marketplaces', 'acme-market', 'widget')), 'widget@acme-market');
  // a checkout: the marketplace is named by the marketplace.json one level up
  const checkout = at('checkout', 'widget');
  mkdirSync(join(root, 'checkout', '.claude-plugin'), { recursive: true });
  writeFileSync(join(root, 'checkout', '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: 'checkout-market' }));
  assert.equal(pluginKey(checkout), 'widget@checkout-market');
  // nothing says which marketplace: an error, not a guess
  assert.throws(() => pluginKey(at('loose', 'widget')), /marketplace/);
});

test('mergeAgents: puts the text before the first idea-loop section, once, and appends when there is none', () => {
  const merged = mergeAgents(HOME_AGENTS, CLAUDE_MD);
  assert.equal(merged, `# AGENTS\n\n${CLAUDE_MD}\n${HOME_AGENTS.slice(HOME_AGENTS.indexOf('## 设备地图'))}`);
  assert.equal(mergeAgents(merged, CLAUDE_MD), merged, 'already in there: not added twice');
  assert.equal(mergeAgents('# AGENTS\n', CLAUDE_MD), `# AGENTS\n\n${CLAUDE_MD}`);
  assert.equal(mergeAgents(HOME_AGENTS, ''), HOME_AGENTS);
});
