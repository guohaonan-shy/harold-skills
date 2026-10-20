#!/usr/bin/env node
/**
 * The design archive's MCP server: the query module's six entries as six read-only tools, over stdio.
 *
 * A thin forwarder (references/design-archive.md §8): each tool calls `query()` from
 * design-archive-query.mjs with the same arguments the command line takes and returns the same JSON,
 * so a tool call and the command line cannot drift apart. Nothing here writes — there is no tool that
 * touches the archive; `prod/` is changed only by the archiving script after a human has approved.
 *
 * Zero dependencies: the three methods an MCP client needs (initialize, tools/list, tools/call) plus
 * ping are spoken by hand as newline-delimited JSON-RPC 2.0. The plugin's `.mcp.json` starts it, so a
 * target project configures nothing; the repository is the git top level of the working directory the
 * session started in. A name that matches nothing, a directory outside git, a missing argument: each is
 * an MCP error *result* (`isError: true`) that says what is wrong, never a dead process.
 *
 *   node design-archive-mcp.mjs        (speaks MCP on stdin / stdout)
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { QueryError, query } from './design-archive-query.mjs';

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'design-archive', version: '1.0.0' };

const DELTA_PROP = {
  type: 'string',
  description:
    '可选：某个需求（spec）的名字。给了就把它的 docs/design/tmp/<spec>/delta/ 叠在线上档案上，读「改完之后的样子」；不给就读线上现状。',
};
const nameProp = (description) => ({ type: 'string', description });

/** Tool definitions: MCP name → { entry, arg (the input key that carries the entry's argument), … }. */
const TOOLS = [
  {
    name: 'design_page',
    entry: 'page',
    arg: 'name',
    description:
      '查一个页面的全部设计：区域与组件、它所有的状态及其进出的边、经过它的用户路径、用到的动效、所有决定与候选。' +
      '什么时候用：要改某个页面、给页面加一块、或要先弄清这个页面现在长什么样、有哪些状态时，先用它，不要自己翻 docs/design。',
    properties: { name: nameProp('页面名（档案里页面对象的 id）'), delta: DELTA_PROP },
  },
  {
    name: 'design_state',
    entry: 'state',
    arg: 'name',
    description:
      '查一个状态：怎么进到这个状态（入口地址、前置条件、沿途每一步的操作，进不去时说清缺什么、试过什么）、进去之后应看到什么、截图路径。' +
      '什么时候用：要进某个状态复现问题、写测试、或核对实现的界面该是什么样时。',
    properties: { name: nameProp('状态名（形如 页面--状态）'), delta: DELTA_PROP },
  },
  {
    name: 'design_journey',
    entry: 'journey',
    arg: 'name',
    description:
      '查一条用户路径：用户的意图加有序步骤，每一步怎么触发（边的定位与操作，或系统行为怎么让它发生）、到了应看到什么。' +
      '什么时候用：要走通一整段用户流程（端到端测试、验收、复现一串操作）时。',
    properties: { name: nameProp('用户路径名'), delta: DELTA_PROP },
  },
  {
    name: 'design_diff',
    entry: 'diff',
    arg: 'spec',
    description:
      '查一个需求（spec）的设计差异：它的 delta/ 相对线上档案新增、改动（给出字段级与小节级差异）、删除了哪些对象。' +
      '什么时候用：要知道这个需求的设计到底改了什么、实现或审查要对着哪些变化时。本工具自己比较 delta/ 与线上，不接 delta 参数。',
    properties: { spec: nameProp('需求（spec）的名字，即 docs/spec/ 下的目录名') },
  },
  {
    name: 'design_refs',
    entry: 'refs',
    arg: 'name',
    description:
      '反查：谁引用了这个组件（按名字或代码路径）或这个动效——边、状态、用户路径、页面。' +
      '什么时候用：要改一个组件或动效、想知道它的影响面（哪些页面、哪些状态、哪些用户路径会跟着变）时；也可以拿代码文件路径反查它对应的组件。',
    properties: { name: nameProp('组件名、组件的代码路径，或动效名'), delta: DELTA_PROP },
  },
  {
    name: 'design_keyword',
    entry: 'keyword',
    arg: 'text',
    description:
      '关键词搜索：名字、summary、正文里含有这些词的对象，按命中位置（名字 > summary > 正文）排序，每条带命中片段。' +
      '什么时候用：不知道对象叫什么、只记得一两个词或一个说法，想先找到相关的页面、状态、组件时；找到名字之后再用上面的精确查询。',
    properties: { text: nameProp('一段文字；空格分开的每个词都会参与匹配'), delta: DELTA_PROP },
  },
].map((t) => ({
  ...t,
  inputSchema: {
    type: 'object',
    properties: t.properties,
    required: [t.arg],
    additionalProperties: false,
  },
}));
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

const listing = () =>
  TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));

// ---------- running a tool ----------

const textResult = (text, isError = false) => ({
  content: [{ type: 'text', text }],
  ...(isError ? { isError: true } : {}),
});

/** The git top level of the working directory, or a thrown QueryError that says why not. */
function repoRoot(cwd = process.cwd()) {
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new QueryError(`当前目录 ${cwd} 不在 git 仓库里：设计档案只读目标仓库的 docs/design，请在仓库里启动会话`, 'no-repo');
  }
  if (!root || !existsSync(join(root, 'docs'))) {
    throw new QueryError(`${root || cwd} 下没有 docs/：这个 git 仓库里没有设计档案`, 'no-repo');
  }
  return root;
}

/** One tools/call. Returns an MCP result; every expected failure is an `isError` result. */
export function callTool(tool, args, cwd = process.cwd()) {
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const value = input[tool.arg];
  if (typeof value !== 'string' || !value.trim()) {
    return textResult(`缺少参数 ${tool.arg}（字符串）：${tool.inputSchema.properties[tool.arg].description}`, true);
  }
  if (input.delta !== undefined && (typeof input.delta !== 'string' || !input.delta.trim())) {
    return textResult('参数 delta 要是需求（spec）的名字，或者不给', true);
  }
  const delta = input.delta ?? null;
  try {
    const result = query(repoRoot(cwd), tool.entry, value, { delta });
    // the command line treats "nothing matched" as a failure; so does the tool
    if (tool.entry === 'keyword' && !result.matches.length) return textResult(`没有对象匹配「${result.query}」`, true);
    return textResult(JSON.stringify(result, null, 2));
  } catch (e) {
    if (e instanceof QueryError) return textResult(e.message, true);
    return textResult(`查询出错：${e.message}`, true);
  }
}

// ---------- JSON-RPC over stdio ----------

const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** One parsed message → the response to write, or null (notifications get none). */
export function handle(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.method !== 'string') {
    return fail(msg && msg.id !== undefined ? msg.id : null, -32600, 'Invalid Request');
  }
  const isNotification = msg.id === undefined;
  const { id, method, params } = msg;
  if (isNotification) return null; // notifications/initialized, notifications/cancelled, …: nothing to answer

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return ok(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: '设计档案的只读查询：六个工具对应页面、状态、用户路径、需求差异、反查、关键词六种问法。',
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, { tools: listing() });
    case 'tools/call': {
      const tool = typeof params?.name === 'string' ? BY_NAME.get(params.name) : null;
      if (!tool) return fail(id, -32602, `没有这个工具：${params?.name ?? '(未给名字)'}；可用：${TOOLS.map((t) => t.name).join('、')}`);
      return ok(id, callTool(tool, params.arguments));
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

function serve() {
  const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write(fail(null, -32700, 'Parse error'));
      return;
    }
    try {
      const res = handle(msg);
      if (res) write(res);
    } catch (e) {
      write(fail(msg?.id ?? null, -32603, `Internal error: ${e.message}`));
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) serve();
