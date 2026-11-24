/**
 * The SessionStart hook injects two sections at the start of every main session: the capability list (runtime/capabilities.md), and the whole description of the current runtime (`<name>.md`, found in the project, in home or in `~/.idea-loop/`).
 * The tests run the commands registered in hooks.json through a shell, exactly as the host does, and read stdout.
 *
 * Spec session-start-inject-rules, ticket 01. Spec dyna-app-layer-cleanup, ticket 03: the plugin carries no description of any
 * runtime, so every test here writes its own sample description into a temporary home and says nothing about what a real
 * runtime's description holds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynaBinary } from './dyna-test-bin.mjs';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hooks = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8')).hooks;
const entries = hooks.SessionStart;
const allCommands = entries.flatMap((e) => e.hooks).filter((h) => h.type === 'command').map((h) => h.command);
// the two `dyna runtime inject` sections; the project map is a third command of its own (home-map-hook.test.mjs)
const commands = allCommands.filter((c) => c.includes('bin/dyna" runtime inject '));

/** The limit Claude Code puts on one hook's output; past it the session keeps only a 2,000-character preview. */
const HOOK_OUTPUT_LIMIT = 10000;

/** A sample description: a marker line and one section, the least `inject` needs to find and print it. */
const sample = (name, marker, body = '样例推送做法') => `# ${name}\n\n标记：${marker ? `\`${marker}\`` : '没有'}\n\n## 推送\n\n${body}\n`;

/** A throw-away machine: a home, a user root and a directory to run in, none of them the real ones. */
function machine(setup = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'inject-machine-'));
  const m = { root, home: join(root, 'home'), userRoot: join(root, '.idea-loop'), cwd: join(root, 'work') };
  for (const d of [m.home, m.userRoot, m.cwd]) mkdirSync(d, { recursive: true });
  m.put = (dir, name, text) => {
    mkdirSync(join(dir, 'runtime'), { recursive: true });
    writeFileSync(join(dir, 'runtime', name), text);
  };
  setup(m);
  return m;
}

// The child gets exactly the env given here, so the machine running the test (maybe a magi session) cannot leak in.
// The plugin's launcher hands the call to a dyna built from this repository, not to the one installed in ~/.idea-loop/bin/.
const runAll = (m, env = {}) =>
  commands.map((command) =>
    spawnSync('sh', ['-c', command], {
      cwd: m.cwd,
      env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: pluginRoot, IDEA_LOOP_DYNA_BIN: dynaBinary(), HOME: m.root, IDEA_LOOP_HOME: m.home, ...env },
      encoding: 'utf8',
    }));

const withMachine = (setup, fn) => {
  const m = machine(setup);
  try {
    fn(m);
  } finally {
    rmSync(m.root, { recursive: true, force: true });
  }
};

test('SessionStart has no matcher, so startup, resume, clear, compact and fork all inject', () => {
  assert.ok(Array.isArray(entries) && entries.length > 0, 'SessionStart is registered');
  for (const e of entries) assert.ok(!('matcher' in e), `a matcher would limit the sources: ${JSON.stringify(e)}`);
});

test('two `dyna runtime inject` SessionStart commands, each its own output, and the project map is a separate command beside them', () => {
  assert.equal(commands.length, 2);
  assert.equal(allCommands.length, 3);
  assert.deepEqual(allCommands.slice(0, 2), commands);
  assert.deepEqual(commands.map((c) => c.split('runtime inject ')[1]), ['runtime --hook', 'reference --hook']);
  assert.equal(allCommands[2], '"${CLAUDE_PLUGIN_ROOT}/bin/dyna" home map --hook');
});

test('a description whose marker variable has a value: two sections, each under the hook output limit, in order runtime, reference', () => {
  withMachine((m) => m.put(m.home, 'sample.md', sample('sample', 'SAMPLE_MARKER', 'see ${CLAUDE_PLUGIN_ROOT}/x')), (m) => {
    const [runtime, reference] = runAll(m, { SAMPLE_MARKER: '1' });
    for (const r of [runtime, reference]) {
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.length > 0 && r.stdout.length < HOOK_OUTPUT_LIMIT, `section length ${r.stdout.length}`);
      assert.ok(!r.stdout.includes('${CLAUDE_PLUGIN_ROOT}'), 'the placeholder is expanded to the real plugin path');
    }

    // runtime: first line is the runtime, then the header, then the body
    assert.equal(runtime.stdout.split('\n')[0], '当前运行环境：sample');
    assert.match(runtime.stdout.split('\n')[1], /^以下是运行环境的能力清单，开场注入，不必再取/);
    assert.ok(runtime.stdout.includes('## 能力清单'));
    assert.doesNotMatch(runtime.stdout, /^name: /m);

    // reference: the whole description of this runtime
    assert.match(reference.stdout.split('\n')[0], /^以下是运行环境「sample」/);
    assert.ok(reference.stdout.includes(sample('sample', 'SAMPLE_MARKER', `see ${pluginRoot}/x`).trim()));
  });
});

test('the injected capability list carries no capability template (it is for writing a description, not for a session)', () => {
  withMachine((m) => m.put(m.home, 'sample.md', sample('sample', 'SAMPLE_MARKER')), (m) => {
    const [runtime] = runAll(m, { SAMPLE_MARKER: '1' });
    assert.ok(runtime.stdout.includes('## 能力清单') && runtime.stdout.includes('## 退路'));
    for (const gone of ['能力模板', '\n### ', '传入：']) assert.ok(!runtime.stdout.includes(gone), gone);
  });
});

test('the injected runtime body sends a sub-agent to `dyna runtime show`, and names neither the removed skill nor the old detect script', () => {
  withMachine(() => {}, (m) => {
    const [runtime] = runAll(m);
    assert.ok(runtime.stdout.includes('dyna runtime show'));
    for (const gone of ['idea-loop:runtime', 'runtime-detect.mjs']) assert.ok(!runtime.stdout.includes(gone), gone);
  });
});

test('no description anywhere: the sections still exit 0, say there is none and point at setup; nothing is made up', () => {
  withMachine(() => {}, (m) => {
    const [runtime, reference] = runAll(m);
    for (const r of [runtime, reference]) assert.equal(r.status, 0, r.stderr);
    assert.equal(runtime.stdout.split('\n')[0], '当前运行环境：没有（跑 /idea-loop:setup）');
    assert.ok(runtime.stdout.includes('## 能力清单'), 'the capability list is still injected, so every capability takes its fallback');
    assert.equal(reference.stdout.trim(), '没有运行环境说明，跑 `/idea-loop:setup`');
  });
});

test('a description without a marker is found through the name the human picked in `runtime/selected`', () => {
  withMachine((m) => {
    m.put(m.home, 'quiet.md', sample('quiet', null));
    m.put(m.home, 'selected', 'quiet\n');
  }, (m) => {
    const [runtime, reference] = runAll(m);
    assert.equal(runtime.stdout.split('\n')[0], '当前运行环境：quiet');
    assert.match(reference.stdout.split('\n')[0], /^以下是运行环境「quiet」/);
  });
});

test('IDEA_LOOP_RUNTIME=foo with no such description: both runtime sections exit non-zero with empty stdout', () => {
  withMachine((m) => m.put(m.home, 'sample.md', sample('sample', 'SAMPLE_MARKER')), (m) => {
    const [runtime, reference] = runAll(m, { IDEA_LOOP_RUNTIME: 'foo' });
    for (const r of [runtime, reference]) {
      assert.notEqual(r.status, 0);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /foo/);
    }
  });
});

test('IDEA_LOOP_RUNTIME forces the reference too', () => {
  withMachine((m) => {
    m.put(m.home, 'alpha.md', sample('alpha', 'ALPHA_MARKER', '甲的做法'));
    m.put(m.home, 'beta.md', sample('beta', 'BETA_MARKER', '乙的做法'));
  }, (m) => {
    const [runtime, reference] = runAll(m, { IDEA_LOOP_RUNTIME: 'beta', ALPHA_MARKER: '1' });
    assert.equal(runtime.stdout.split('\n')[0], '当前运行环境：beta');
    assert.ok(reference.stdout.includes('乙的做法') && !reference.stdout.includes('甲的做法'));
  });
});

test('the description is looked for in the project, then home, then the user root; the first place that has it wins whole', () => {
  withMachine((m) => {
    const project = join(m.root, 'project');
    mkdirSync(project);
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: project }).status, 0);
    m.cwd = project;
    m.put(join(project, '.idea-loop'), 'sample.md', sample('sample', 'SAMPLE_MARKER', '项目里的做法'));
    m.put(m.home, 'sample.md', sample('sample', 'SAMPLE_MARKER', 'home 里的做法'));
  }, (m) => {
    const env = { SAMPLE_MARKER: '1' };
    const injected = () => runAll(m, env)[1].stdout;
    assert.ok(injected().includes('项目里的做法') && !injected().includes('home 里的做法'));
    rmSync(join(m.cwd, '.idea-loop'), { recursive: true });
    assert.ok(injected().includes('home 里的做法'));
    rmSync(join(m.home, 'runtime'), { recursive: true });
    mkdirSync(join(m.userRoot, 'runtime'), { recursive: true });
    writeFileSync(join(m.userRoot, 'runtime', 'sample.md'), sample('sample', 'SAMPLE_MARKER', '用户根目录里的做法'));
    assert.ok(injected().includes('用户根目录里的做法'));
  });
});
