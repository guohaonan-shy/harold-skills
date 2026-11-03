import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC_SLUG, compliantFiles, marketingFiles, writeRepo } from './design-archive-fixture.mjs';

const SERVER = fileURLToPath(new URL('./design-archive-mcp.mjs', import.meta.url));
const CLI = fileURLToPath(new URL('./design-archive-query.mjs', import.meta.url));
const MCP_JSON = fileURLToPath(new URL('../.mcp.json', import.meta.url));

const TOOLS = ['design_page', 'design_state', 'design_journey', 'design_diff', 'design_refs', 'design_keyword', 'design_affected'];

// ---------- a stdio client: send every line, close stdin, read every response back ----------

/** What marks a git repository as a business's knowledge base (knowledge-base.mjs). */
const CONFIG = JSON.stringify({ business: 'biz', issues: 'o/app', repos: { app: 'o/app' } });

/** The compliant fixture (plus optionally more files) as a knowledge base: a real git repository with an idea-loop.json; returns its realpath. */
function gitRepo(extra = {}) {
  const root = realpathSync(writeRepo({ 'idea-loop.json': CONFIG, ...compliantFiles(), ...extra }));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  return root;
}

/** The marketing page's files on top of the compliant fixture (marketingFiles() is a superset of it). */
const marketingExtra = () => marketingFiles();

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } };
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

/** The machine-level mapping the tests use instead of the real ~/.idea-loop: an empty one unless `projects` says where the business lives. */
function ideaLoopHome(projects = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'design-archive-mcp-home-')));
  writeFileSync(join(home, 'projects.json'), JSON.stringify(projects));
  return home;
}

/** Runs the server in `cwd` against these messages (objects or raw lines); responses by id. `home`: its IDEA_LOOP_HOME. */
function session(cwd, messages, { home = ideaLoopHome() } = {}) {
  const input = messages.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n') + '\n';
  const r = spawnSync('node', [SERVER], { cwd, input, encoding: 'utf8', timeout: 20000, env: { ...process.env, IDEA_LOOP_HOME: home } });
  const out = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, stderr: r.stderr, out, byId: Object.fromEntries(out.map((o) => [o.id, o])) };
}

const textOf = (res) => res.result.content.map((c) => c.text).join('');
const cliJson = (root, ...args) => {
  const r = spawnSync('node', [CLI, root, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

// ---------- initialize and tools/list ----------

test('stdio: initialize answers with the tools capability, tools/list returns the seven tools with input schemas', () => {
  const s = session(gitRepo(), [INIT, { jsonrpc: '2.0', method: 'notifications/initialized' }, LIST]);
  assert.equal(s.status, 0);
  assert.equal(s.byId[1].result.protocolVersion, '2025-06-18');
  assert.ok(s.byId[1].result.capabilities.tools);
  assert.ok(s.byId[1].result.serverInfo.name);
  assert.equal(s.out.length, 2, 'the initialized notification gets no reply');

  const tools = s.byId[2].result.tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOLS].sort());
  const required = (name) => tools.find((t) => t.name === name).inputSchema.required;
  const props = (name) => Object.keys(tools.find((t) => t.name === name).inputSchema.properties).sort();
  for (const t of tools) assert.equal(t.inputSchema.type, 'object', t.name);
  assert.deepEqual(required('design_page'), ['name']);
  assert.deepEqual(required('design_state'), ['name']);
  assert.deepEqual(required('design_journey'), ['name']);
  assert.deepEqual(required('design_refs'), ['name']);
  assert.deepEqual(required('design_keyword'), ['text']);
  assert.deepEqual(required('design_diff'), ['spec']);
  assert.deepEqual(required('design_affected'), ['commit']);
  // every entry but the requirement diff can read "after the change"; the diff compares by itself
  for (const n of ['design_page', 'design_state', 'design_journey', 'design_refs', 'design_keyword', 'design_affected']) {
    assert.ok(props(n).includes('delta'), n);
  }
  assert.deepEqual(props('design_diff'), ['spec']);
});

test('tools/list: each description says when to reach for the tool', () => {
  const s = session(gitRepo(), [INIT, LIST]);
  const d = Object.fromEntries(s.byId[2].result.tools.map((t) => [t.name, t.description]));
  for (const name of TOOLS) assert.match(d[name], /什么时候用|用于|当你|要.*时/, name);
  assert.match(d.design_state, /复现|测试/); // enter a state to reproduce or to write a test
  assert.match(d.design_diff, /需求|spec/i);
  assert.match(d.design_refs, /组件|动效/);
  assert.match(d.design_keyword, /不知道|不确定|模糊|关键词/);
  assert.match(d.design_affected, /提交/); // asked with a commit
});

test('ping is answered; an unknown method is a JSON-RPC error, not a crash', () => {
  const s = session(gitRepo(), [
    INIT,
    { jsonrpc: '2.0', id: 2, method: 'ping' },
    { jsonrpc: '2.0', id: 3, method: 'resources/list' },
    { jsonrpc: '2.0', id: 4, method: 'tools/list' },
  ]);
  assert.deepEqual(s.byId[2].result, {});
  assert.equal(s.byId[3].error.code, -32601);
  assert.equal(s.byId[4].result.tools.length, 7);
});

// ---------- tools/call equals the command line ----------

const DELTA = `docs/design/tmp/${SPEC_SLUG}/delta`;
const SHARE = `${DELTA}/pages/cookbook/cookbook--share-sheet.md`;
const shareSheet =
  '---\ntype: design-state\ntags: [cookbook]\nsummary: 分享面板\npage: "[[cookbook]]"\nedges: []\n---\n\n## 这一屏\n\n分享面板。\n\n## 应看到什么\n\n- 看到分享面板\n';

test('tools/call returns what the command line prints, for the six lookups that need no history', () => {
  const root = gitRepo({ [SHARE]: shareSheet });
  const cases = [
    ['design_page', { name: 'cookbook' }, ['page', 'cookbook']],
    ['design_state', { name: 'cookbook--search-results' }, ['state', 'cookbook--search-results']],
    ['design_journey', { name: 'save-a-recipe' }, ['journey', 'save-a-recipe']],
    ['design_diff', { spec: SPEC_SLUG }, ['diff', SPEC_SLUG]],
    ['design_refs', { name: 'NavBar' }, ['refs', 'NavBar']],
    ['design_keyword', { text: '保存' }, ['keyword', '保存']],
  ];
  const s = session(root, [INIT, ...cases.map(([name, args], i) => call(10 + i, name, args))]);
  cases.forEach(([name, , cliArgs], i) => {
    const res = s.byId[10 + i];
    assert.ok(!res.result.isError, `${name}: ${JSON.stringify(res)}`);
    assert.deepEqual(JSON.parse(textOf(res)), cliJson(root, ...cliArgs), name);
  });
});

// design_affected compares the code repository the session started in; its tests are with the code repository ones below.

test('tools/call: design_refs with a section id or a section type returns what the command line prints; design_page lists the sections', () => {
  const root = gitRepo(marketingExtra());
  const cases = [
    ['design_refs', { name: 'mkt-pricing#hero' }, ['refs', 'mkt-pricing#hero']],
    ['design_refs', { name: 'mkt-pricing#feature-b' }, ['refs', 'mkt-pricing#feature-b']],
    ['design_refs', { name: '#feature' }, ['refs', '#feature']],
    ['design_page', { name: 'mkt-pricing' }, ['page', 'mkt-pricing']],
    ['design_state', { name: 'mkt-pricing--feature-b-expanded' }, ['state', 'mkt-pricing--feature-b-expanded']],
  ];
  const s = session(root, [INIT, ...cases.map(([name, args], i) => call(10 + i, name, args))]);
  cases.forEach(([name, args, cliArgs], i) => {
    const res = s.byId[10 + i];
    assert.ok(!res.result.isError, `${name} ${JSON.stringify(args)}: ${JSON.stringify(res)}`);
    assert.deepEqual(JSON.parse(textOf(res)), cliJson(root, ...cliArgs), `${name} ${JSON.stringify(args)}`);
  });
  assert.equal(JSON.parse(textOf(s.byId[13])).sections.length, 5);
});

test('tools/call: a section that is not there is an error result that lists the existing ones', () => {
  const s = session(gitRepo(marketingExtra()), [INIT, call(2, 'design_refs', { name: 'mkt-pricing#nowhere' })]);
  assert.equal(s.byId[2].result.isError, true);
  assert.match(textOf(s.byId[2]), /hero/);
});

test('tools/list: design_page and design_refs say they know about sections, and how to ask', () => {
  const s = session(gitRepo(), [INIT, LIST]);
  const tools = Object.fromEntries(s.byId[2].result.tools.map((t) => [t.name, t]));
  assert.match(tools.design_page.description, /分段/);
  assert.match(tools.design_refs.description, /分段/);
  assert.match(tools.design_refs.inputSchema.properties.name.description, /<页面>#<段>/);
  assert.match(tools.design_refs.inputSchema.properties.name.description, /#<段类型>/);
});

test('tools/call with delta reads the archive as it will be after the requirement', () => {
  const root = gitRepo({ [SHARE]: shareSheet });
  const s = session(root, [
    INIT,
    call(2, 'design_state', { name: 'cookbook--share-sheet' }),
    call(3, 'design_state', { name: 'cookbook--share-sheet', delta: SPEC_SLUG }),
    call(4, 'design_page', { name: 'cookbook', delta: SPEC_SLUG }),
  ]);
  assert.equal(s.byId[2].result.isError, true); // not in prod/
  assert.ok(!s.byId[3].result.isError);
  assert.deepEqual(JSON.parse(textOf(s.byId[3])), cliJson(root, 'state', 'cookbook--share-sheet', '--delta', SPEC_SLUG));
  assert.deepEqual(JSON.parse(textOf(s.byId[4])), cliJson(root, 'page', 'cookbook', '--delta', SPEC_SLUG));
});

test('the knowledge base is the git top level of the working directory when that is the knowledge base, also from a subdirectory', () => {
  const root = gitRepo();
  const s = session(join(root, 'docs', 'design'), [INIT, call(2, 'design_state', { name: 'cookbook--list' })]);
  assert.ok(!s.byId[2].result.isError, JSON.stringify(s.byId[2]));
  assert.deepEqual(JSON.parse(textOf(s.byId[2])), cliJson(root, 'state', 'cookbook--list'));
});

// ---------- errors come back as results, the process stays up ----------

test('an unknown object is an MCP error result that says what exists, and the next call still works', () => {
  const s = session(gitRepo(), [
    INIT,
    call(2, 'design_page', { name: 'no-such-page' }),
    call(3, 'design_page', { name: 'NavBar' }), // a component, not a page
    call(4, 'design_keyword', { text: 'zzzqqq' }),
    call(5, 'design_diff', { spec: 'no-such-spec' }),
    call(6, 'design_state', { name: 'cookbook--list' }),
  ]);
  assert.equal(s.status, 0);
  for (const id of [2, 3, 4, 5]) {
    assert.equal(s.byId[id].result.isError, true, `id ${id}`);
    assert.ok(textOf(s.byId[id]).length > 5, `id ${id}`);
  }
  assert.match(textOf(s.byId[3]), /NavBar/);
  assert.ok(!s.byId[6].result.isError);
});

test('outside a git repository every tool returns an error result that says to run setup, instead of crashing', () => {
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'design-archive-mcp-nogit-')));
  const s = session(bare, [INIT, LIST, ...TOOLS.map((n, i) => call(10 + i, n, { name: 'x', text: 'x', spec: 'x', commit: 'x' }))]);
  assert.equal(s.status, 0);
  assert.equal(s.byId[2].result.tools.length, 7, 'listing needs no repository');
  TOOLS.forEach((n, i) => {
    const res = s.byId[10 + i];
    assert.equal(res.result.isError, true, n);
    assert.match(textOf(res), /\/idea-loop:setup/, n);
  });
});

test('a knowledge base without docs/ is reported, not crashed on', () => {
  const root = realpathSync(writeRepo({ 'idea-loop.json': CONFIG }));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const s = session(root, [INIT, call(2, 'design_page', { name: 'x' })]);
  assert.equal(s.byId[2].result.isError, true);
  assert.match(textOf(s.byId[2]), /docs/);
});

// ---------- a code repository reads the business's knowledge base ----------

const POINTER = '# app\n\n## idea-loop\n\n- 业务：`biz`\n- 知识库：`o/biz-kb`\n\n这个仓库的 spec、设计档案都在知识库里。\n';
const commitAll = (cwd) => {
  const g = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(g('add', '-A').status, 0);
  assert.equal(g('commit', '-q', '-m', 'init').status, 0);
  return g;
};

/** A code repository with no docs/ at all (AGENTS.md says `pointer`, null: no AGENTS.md) and a worktree of it. */
function codeRepo(pointer) {
  const app = realpathSync(writeRepo({ 'README.md': 'app', ...(pointer === null ? {} : { 'AGENTS.md': pointer }) }));
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: app }).status, 0);
  const g = commitAll(app);
  const worktree = join(app, '.tmp', 'wt');
  assert.equal(g('worktree', 'add', '-q', '-b', 'feature/x', worktree).status, 0);
  return { app, worktree };
}

test('in a code repository configured into a business, the queries read the knowledge base\'s docs/design/prod, from the main checkout and from a worktree', () => {
  const kb = gitRepo();
  const { app, worktree } = codeRepo(POINTER);
  assert.ok(!existsSync(join(app, 'docs')), 'the code repository has no docs/ of its own');
  const home = ideaLoopHome({ biz: { knowledgeBase: kb, home: app, repos: { app } } });
  for (const cwd of [app, worktree]) {
    const s = session(cwd, [INIT, call(2, 'design_state', { name: 'cookbook--list' }), call(3, 'design_page', { name: 'cookbook' })], { home });
    assert.ok(!s.byId[2].result.isError, `${cwd}: ${JSON.stringify(s.byId[2])}`);
    assert.deepEqual(JSON.parse(textOf(s.byId[2])), cliJson(kb, 'state', 'cookbook--list'), cwd);
    assert.deepEqual(JSON.parse(textOf(s.byId[3])), cliJson(kb, 'page', 'cookbook'), cwd);
  }
});

test('an open .tmp/kb of the session\'s worktree is read before the main knowledge base checkout', () => {
  const kb = gitRepo();
  const g = commitAll(kb);
  const { app, worktree } = codeRepo(POINTER);
  const open = join(worktree, '.tmp', 'kb');
  assert.equal(g('worktree', 'add', '-q', '-b', 'feature/x', open).status, 0);
  mkdirSync(dirname(join(open, SHARE)), { recursive: true });
  writeFileSync(join(open, SHARE), shareSheet.replace('分享面板。', '这一支分支新加的分享面板。'));
  const home = ideaLoopHome({ biz: { knowledgeBase: kb, home: app, repos: { app } } });
  const s = session(worktree, [INIT, call(2, 'design_state', { name: 'cookbook--share-sheet', delta: SPEC_SLUG })], { home });
  assert.ok(!s.byId[2].result.isError, JSON.stringify(s.byId[2]));
  assert.match(textOf(s.byId[2]), /这一支分支新加的分享面板/);
});

test('in a repository that is not configured into any business, every tool says to run /idea-loop:setup', () => {
  const kb = gitRepo();
  const home = ideaLoopHome({ biz: { knowledgeBase: kb, home: kb, repos: {} } });
  for (const pointer of [null, '# app\n\n## idea-loop\n\n- 默认分支：main\n']) {
    const { app } = codeRepo(pointer);
    const s = session(app, [INIT, ...TOOLS.map((n, i) => call(10 + i, n, { name: 'x', text: 'x', spec: 'x', commit: 'x' }))], { home });
    TOOLS.forEach((n, i) => {
      const res = s.byId[10 + i];
      assert.equal(res.result.isError, true, n);
      assert.match(textOf(res), /\/idea-loop:setup/, n);
    });
  }
});

test('a pointer to a business this machine has no knowledge base for says to run /idea-loop:setup', () => {
  const { app } = codeRepo(POINTER);
  const s = session(app, [INIT, call(2, 'design_page', { name: 'cookbook' })], { home: ideaLoopHome({}) });
  assert.equal(s.byId[2].result.isError, true);
  assert.match(textOf(s.byId[2]), /\/idea-loop:setup/);
});

/** A code repository (pointer to the business `biz`) with two commits changing a registered page's code, and a worktree of it. */
function codeRepoWithHistory() {
  const app = realpathSync(writeRepo({ 'README.md': 'app', 'AGENTS.md': POINTER, 'src/pages/pantry.tsx': 'one\n' }));
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: app }).status, 0);
  const g = commitAll(app);
  const first = g('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(app, 'src', 'pages', 'pantry.tsx'), 'two\n');
  commitAll(app);
  const worktree = join(app, '.tmp', 'wt');
  assert.equal(g('worktree', 'add', '-q', '-b', 'feature/x', worktree).status, 0);
  return { app, worktree, first };
}

test('design_affected in a code repository configured into a business: the code changes of that checkout pick the states of the knowledge base, from the main checkout and from a worktree', () => {
  const kb = gitRepo();
  const { app, worktree, first } = codeRepoWithHistory();
  const home = ideaLoopHome({ biz: { knowledgeBase: kb, home: app, repos: { app } } });
  for (const cwd of [app, worktree]) {
    const s = session(cwd, [INIT, call(2, 'design_affected', { commit: first }), call(3, 'design_affected', { commit: 'no-such-commit' })], { home });
    assert.ok(!s.byId[2].result.isError, `${cwd}: ${JSON.stringify(s.byId[2])}`);
    const answer = JSON.parse(textOf(s.byId[2]));
    assert.deepEqual(answer, cliJson(kb, 'affected', first, '--code', cwd), cwd);
    assert.equal(answer.changedFileCount, 1, cwd);
    assert.deepEqual(answer.states.map((x) => x.id), ['pantry--empty', 'pantry--overview'], cwd);
    assert.equal(s.byId[3].result.isError, true);
    assert.match(textOf(s.byId[3]), /no-such-commit/);
  }
});

test('design_affected in the knowledge base itself says to ask from a code repository; the other tools still work there', () => {
  const kb = gitRepo();
  const s = session(kb, [INIT, call(2, 'design_affected', { commit: 'HEAD' }), call(3, 'design_state', { name: 'cookbook--list' })]);
  assert.equal(s.byId[2].result.isError, true);
  assert.match(textOf(s.byId[2]), /要在代码仓库里问/);
  assert.ok(!s.byId[3].result.isError);
});

test('bad input: missing argument is an error result, unknown tool is a protocol error, garbage line is a parse error', () => {
  const s = session(gitRepo(), [
    INIT,
    call(2, 'design_page', {}),
    call(3, 'design_page', { name: 7 }),
    call(4, 'design_diff', { spec: SPEC_SLUG, delta: SPEC_SLUG }),
    call(5, 'write_design', { name: 'x' }),
    '{ not json',
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: {} },
    call(7, 'design_state', { name: 'cookbook--list' }),
  ]);
  assert.equal(s.status, 0);
  assert.equal(s.byId[2].result.isError, true);
  assert.match(textOf(s.byId[2]), /name/);
  assert.equal(s.byId[3].result.isError, true);
  assert.equal(s.byId[4].result.isError, true); // diff does not take a delta
  assert.equal(s.byId[5].error.code, -32602);
  assert.equal(s.out.find((o) => o.id === null).error.code, -32700);
  assert.equal(s.byId[6].error.code, -32602);
  assert.ok(!s.byId[7].result.isError, 'still serving after the bad lines');
});

test('read only: nothing but the seven lookups is offered, and a write-shaped call is refused', () => {
  const root = gitRepo();
  const s = session(root, [INIT, LIST, call(3, 'design_write', { path: 'docs/design/prod/x.md', content: 'x' })]);
  assert.deepEqual(s.byId[2].result.tools.map((t) => t.name).sort(), [...TOOLS].sort());
  assert.ok(s.byId[3].error);
  const status = spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' }).stdout;
  assert.equal(status.includes('docs/design/prod/x.md'), false);
});

// ---------- the plugin's MCP configuration ----------

test('.mcp.json: the plugin ships the archive server and OpenSEO; Playwright and Refero are user-level', () => {
  const cfg = JSON.parse(readFileSync(MCP_JSON, 'utf8'));
  const archive = cfg.mcpServers['design-archive'];
  assert.equal(archive.command, 'node');
  assert.deepEqual(archive.args, ['${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-mcp.mjs']);
  assert.deepEqual(cfg.mcpServers.openseo, { type: 'http', url: 'https://app.openseo.so/mcp' });
  assert.deepEqual(Object.keys(cfg.mcpServers), ['design-archive', 'openseo']);
});
