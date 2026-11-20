import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lowerBound, mentions, readRange, scanPlugin, scanText } from './dyna-scan.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const cmd = (command, caller = 'session', flags = []) => ({
  command, module: command.split(' ')[0], use: command, summary: 's', caller, next: '',
  args: [{ name: 'docs', kind: 'positional', required: true }, ...flags.map((name) => ({ name, kind: 'flag', value: 'string' }))],
});
const REGISTRY = {
  version: '0.4.0',
  commands: [
    cmd('issues show'), cmd('issues set', 'session', ['comment', 'skip-design']), cmd('issues guard', 'hook', ['hook']),
    cmd('issues block add'), cmd('registry', 'session', ['json']), cmd('test run', 'test'),
  ],
};

const scan = (name, text) => scanText({ name, text, registry: REGISTRY });

test('a skill that writes a command the registry has is fine, with its flags, in a span or a fenced block', () => {
  const md = [
    '# x', '', '先 `dyna issues show <docs> 12`，再：', '', '```sh', 'dyna issues set <docs> done 3 --comment="x" --skip-design', 'dyna issues block add <docs> 1 2 && echo ok', 'dyna registry --json | head', '```',
    '参数用 `dyna issues set --help` 查；`dyna issues --help` 看命令表。',
  ].join('\n');
  assert.deepEqual(scan('skills/a/SKILL.md', md), []);
});

test('a command the registry does not have is red with the file and the line', () => {
  const md = ['# x', '', '一段话', '跑 `dyna issues frobnicate <docs>` 就行', ''].join('\n');
  const v = scan('skills/a/SKILL.md', md);
  assert.equal(v.length, 1);
  assert.match(v[0], /^skills\/a\/SKILL\.md:4 /);
  assert.match(v[0], /frobnicate/);
  assert.match(v[0], /issues/);
});

test('an unknown module, an unknown subcommand under a deeper group, and a flag the command lacks are red', () => {
  assert.match(scan('a.md', '`dyna isues show x`')[0], /没有模块或命令「isues」/);
  assert.match(scan('a.md', '`dyna issues block nuke <docs>`')[0], /「issues block」下没有命令「nuke」/);
  assert.match(scan('a.md', '`dyna issues show <docs> --nope`')[0], /没有参数 --nope/);
  assert.deepEqual(scan('a.md', '`dyna issues show <docs> --help`'), []);
});

test('a command only a hook may call is red anywhere but hooks.json', () => {
  const v = scan('skills/a/SKILL.md', '`dyna issues guard --hook`');
  assert.equal(v.length, 1);
  assert.match(v[0], /只许 hooks\.json 引用/);
  const hooks = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}/bin/dyna" issues guard --hook' }] }] } }, null, 2);
  assert.deepEqual(scan('hooks/hooks.json', hooks), []);
  assert.match(scan('hooks/hooks.json', hooks.replace('guard', 'guardd'))[0], /hooks\/hooks\.json:\d+ .*guardd/);
});

test('a command only tests may call is red in the plugin', () => {
  const v = scan('agents/a.md', '```\ndyna test run foo\n```');
  assert.equal(v.length, 1);
  assert.match(v[0], /只许测试、REVIEW\.md、DEVELOPMENT\.md 引用/);
  assert.match(v[0], /^agents\/a\.md:2 /);
});

test('dyna self install and upgrade are the launcher\'s own and are not looked up in the registry; another self action is red', () => {
  assert.deepEqual(scan('README.md', '`dyna self install` 和 `dyna self upgrade --x`'), []);
  assert.match(scan('README.md', '`dyna self nuke`')[0], /只有 install \/ upgrade/);
});

test('prose that says dyna, placeholders and a bare --help name no command', () => {
  const md = ['dyna 是 idea-loop 的命令行，不是插件。', '`dyna <模块> <命令>`', '`dyna --help`', '写 dyna issues frobnicate 在代码外面不算（只读代码）。', '`.mcp.json` 里写 `bin/dyna` 的路径', '`dyna`'].join('\n');
  assert.deepEqual(scan('README.md', md), []);
});

test('mentions: stops at a pipe, a semicolon and a closing quote', () => {
  assert.deepEqual(mentions('x && dyna issues show d 1 | jq .'), [['issues', 'show', 'd', '1']]);
  assert.deepEqual(mentions('dyna issues show d; ls'), [['issues', 'show', 'd']]);
  assert.deepEqual(mentions('"${CLAUDE_PLUGIN_ROOT}/bin/dyna" issues guard --hook"'), [['issues', 'guard', '--hook']]);
  assert.deepEqual(mentions('see /usr/bin/dynamo and mydyna issues'), []);
});

test('the floor of a range, and the range of a file with comments', () => {
  assert.equal(lowerBound('>=0.4.0 <1.0.0'), '0.4.0');
  assert.equal(lowerBound('0.4.0'), '0.4.0');
  assert.equal(lowerBound('<1.0.0'), null);
  assert.equal(readRange('# note\n>=0.4.0 <1.0.0\n'), '>=0.4.0 <1.0.0');
});

// ---------- a whole plugin directory against stored registries ----------

function plugin({ range, files = {}, registries = { '0.4.0': REGISTRY } }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dyna-scan-')));
  const pluginRoot = join(root, 'idea-loop');
  const registryDir = join(root, 'dyna', 'registry');
  mkdirSync(registryDir, { recursive: true });
  mkdirSync(pluginRoot, { recursive: true });
  if (range !== null) writeFileSync(join(pluginRoot, 'dyna-version'), `${range}\n`);
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(pluginRoot, f)), { recursive: true });
    writeFileSync(join(pluginRoot, f), text);
  }
  for (const [v, reg] of Object.entries(registries)) writeFileSync(join(registryDir, `${v}.json`), JSON.stringify(reg));
  return { pluginRoot, registryDir };
}

test('a plugin is scanned against the registry of its lowest version: skills, agents, README, hooks.json and .mcp.json', () => {
  const p = plugin({
    range: '>=0.4.0 <1.0.0',
    files: {
      'skills/engineering/x/SKILL.md': '`dyna issues show <docs> 1`\n',
      'skills/engineering/x/references/r.md': '`dyna issues frobnicate`\n',
      'agents/a.md': '`dyna issues nope`\n',
      'README.md': '`dyna issues show --bad`\n',
      'hooks/hooks.json': '{"command": "\\"${CLAUDE_PLUGIN_ROOT}/bin/dyna\\" issues guard --hook"}\n',
      '.mcp.json': '{"mcpServers": {"x": {"command": "${CLAUDE_PLUGIN_ROOT}/bin/dyna", "args": ["issues", "zzz"]}}}\n',
    },
  });
  const v = scanPlugin(p);
  assert.equal(v.length, 4, v.join('\n'));
  assert.ok(v.some((x) => x.startsWith('.mcp.json:1 ') && /zzz/.test(x)));
  assert.ok(v.some((x) => x.startsWith('skills/engineering/x/references/r.md:1 ')));
  assert.ok(v.some((x) => x.startsWith('agents/a.md:1 ')));
  assert.ok(v.some((x) => x.startsWith('README.md:1 ') && /--bad/.test(x)));
});

test('a lowest version with no stored registry is red: it is not released yet', () => {
  const p = plugin({ range: '>=0.9.0 <1.0.0', registries: { '0.4.0': REGISTRY } });
  const v = scanPlugin(p);
  assert.equal(v.length, 1);
  assert.match(v[0], /最低版本 0\.9\.0 还没发布/);
});

test('no range file, or a range with no floor, is red', () => {
  assert.match(scanPlugin(plugin({ range: null }))[0], /没有这个文件/);
  assert.match(scanPlugin(plugin({ range: '<1.0.0' }))[0], /没有下限/);
});

test('a command added in a newer version is not accepted while the floor is older', () => {
  const older = { ...REGISTRY, version: '0.3.0', commands: REGISTRY.commands.filter((c) => c.command !== 'issues block add') };
  const p = plugin({ range: '>=0.3.0 <1.0.0', files: { 'skills/x/SKILL.md': '`dyna issues block add <docs> 1 2`\n' }, registries: { '0.3.0': older, '0.4.0': REGISTRY } });
  assert.match(scanPlugin(p)[0], /issues block/);
});

// ---------- the real plugin ----------

test('the real idea-loop plugin: everything it writes about dyna is in the registry of its lowest version, which is released', () => {
  const v = scanPlugin({ pluginRoot: join(repoRoot, 'idea-loop'), registryDir: join(repoRoot, 'dyna', 'registry') });
  assert.deepEqual(v, [], `\n${v.join('\n')}`);
});

test('the registry stored for the plugin\'s floor lists the issues module', () => {
  const floor = lowerBound(readRange(readFileSync(join(repoRoot, 'idea-loop', 'dyna-version'), 'utf8')));
  const reg = JSON.parse(readFileSync(join(repoRoot, 'dyna', 'registry', `${floor}.json`), 'utf8'));
  assert.equal(reg.version, floor);
  for (const c of ['issues show', 'issues set', 'issues guard', 'issues block add', 'issues block remove', 'issues block list']) {
    assert.ok(reg.commands.some((x) => x.command === c), c);
  }
});
