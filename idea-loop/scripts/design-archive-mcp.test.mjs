import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEC_SLUG, compliantFiles, writeRepo } from './design-archive-fixture.mjs';

const SERVER = fileURLToPath(new URL('./design-archive-mcp.mjs', import.meta.url));
const CLI = fileURLToPath(new URL('./design-archive-query.mjs', import.meta.url));
const MCP_JSON = fileURLToPath(new URL('../.mcp.json', import.meta.url));

const SIX = ['design_page', 'design_state', 'design_journey', 'design_diff', 'design_refs', 'design_keyword'];

// ---------- a stdio client: send every line, close stdin, read every response back ----------

/** The compliant fixture (plus optionally more files) as a real git repository; returns its realpath. */
function gitRepo(extra = {}) {
  const root = realpathSync(writeRepo({ ...compliantFiles(), ...extra }));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  return root;
}

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } };
const call = (id, name, args) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

/** Runs the server in `cwd` against these messages (objects or raw lines); responses by id. */
function session(cwd, messages) {
  const input = messages.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n') + '\n';
  const r = spawnSync('node', [SERVER], { cwd, input, encoding: 'utf8', timeout: 20000 });
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

test('stdio: initialize answers with the tools capability, tools/list returns the six tools with input schemas', () => {
  const s = session(gitRepo(), [INIT, { jsonrpc: '2.0', method: 'notifications/initialized' }, LIST]);
  assert.equal(s.status, 0);
  assert.equal(s.byId[1].result.protocolVersion, '2025-06-18');
  assert.ok(s.byId[1].result.capabilities.tools);
  assert.ok(s.byId[1].result.serverInfo.name);
  assert.equal(s.out.length, 2, 'the initialized notification gets no reply');

  const tools = s.byId[2].result.tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), [...SIX].sort());
  const required = (name) => tools.find((t) => t.name === name).inputSchema.required;
  const props = (name) => Object.keys(tools.find((t) => t.name === name).inputSchema.properties).sort();
  for (const t of tools) assert.equal(t.inputSchema.type, 'object', t.name);
  assert.deepEqual(required('design_page'), ['name']);
  assert.deepEqual(required('design_state'), ['name']);
  assert.deepEqual(required('design_journey'), ['name']);
  assert.deepEqual(required('design_refs'), ['name']);
  assert.deepEqual(required('design_keyword'), ['text']);
  assert.deepEqual(required('design_diff'), ['spec']);
  // every entry but the requirement diff can read "after the change"; the diff compares by itself
  for (const n of ['design_page', 'design_state', 'design_journey', 'design_refs', 'design_keyword']) {
    assert.ok(props(n).includes('delta'), n);
  }
  assert.deepEqual(props('design_diff'), ['spec']);
});

test('tools/list: each description says when to reach for the tool', () => {
  const s = session(gitRepo(), [INIT, LIST]);
  const d = Object.fromEntries(s.byId[2].result.tools.map((t) => [t.name, t.description]));
  for (const name of SIX) assert.match(d[name], /什么时候用|用于|当你|要.*时/, name);
  assert.match(d.design_state, /复现|测试/); // enter a state to reproduce or to write a test
  assert.match(d.design_diff, /需求|spec/i);
  assert.match(d.design_refs, /组件|动效/);
  assert.match(d.design_keyword, /不知道|不确定|模糊|关键词/);
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
  assert.equal(s.byId[4].result.tools.length, 6);
});

// ---------- tools/call equals the command line ----------

const DELTA = `docs/design/tmp/${SPEC_SLUG}/delta`;
const SHARE = `${DELTA}/pages/cookbook/cookbook--share-sheet.md`;
const shareSheet =
  '---\ntype: design-state\ntags: [cookbook]\nsummary: 分享面板\npage: "[[cookbook]]"\nedges: []\n---\n\n## 这一屏\n\n分享面板。\n\n## 应看到什么\n\n- 看到分享面板\n';

test('tools/call returns what the command line prints, for all six entries', () => {
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

test('the repository root is the git top level of the working directory, also from a subdirectory', () => {
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

test('outside a git repository every tool returns a clear error result instead of crashing', () => {
  const bare = realpathSync(mkdtempSync(join(tmpdir(), 'design-archive-mcp-nogit-')));
  const s = session(bare, [INIT, LIST, ...SIX.map((n, i) => call(10 + i, n, { name: 'x', text: 'x', spec: 'x' }))]);
  assert.equal(s.status, 0);
  assert.equal(s.byId[2].result.tools.length, 6, 'listing needs no repository');
  SIX.forEach((n, i) => {
    const res = s.byId[10 + i];
    assert.equal(res.result.isError, true, n);
    assert.match(textOf(res), /git/, n);
  });
});

test('a git repository without docs/ is reported, not crashed on', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'design-archive-mcp-nodocs-')));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const s = session(root, [INIT, call(2, 'design_page', { name: 'x' })]);
  assert.equal(s.byId[2].result.isError, true);
  assert.match(textOf(s.byId[2]), /docs/);
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

test('read only: nothing but the six lookups is offered, and a write-shaped call is refused', () => {
  const root = gitRepo();
  const s = session(root, [INIT, LIST, call(3, 'design_write', { path: 'docs/design/prod/x.md', content: 'x' })]);
  assert.deepEqual(s.byId[2].result.tools.map((t) => t.name).sort(), [...SIX].sort());
  assert.ok(s.byId[3].error);
  const status = spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: root, encoding: 'utf8' }).stdout;
  assert.equal(status.includes('docs/design/prod/x.md'), false);
});

// ---------- the plugin's MCP configuration ----------

test('.mcp.json: the plugin ships only the archive server; Playwright and Refero are user-level', () => {
  const cfg = JSON.parse(readFileSync(MCP_JSON, 'utf8'));
  const archive = cfg.mcpServers['design-archive'];
  assert.equal(archive.command, 'node');
  assert.deepEqual(archive.args, ['${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-mcp.mjs']);
  assert.deepEqual(Object.keys(cfg.mcpServers), ['design-archive']);
});
