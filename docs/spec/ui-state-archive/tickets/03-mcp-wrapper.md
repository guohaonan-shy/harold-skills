# 03 — 档案查询的 MCP 包装

**Blocked by**：02 — 档案查询模块：六个入口 + 命令行
**设计冻结**：不涉及 UI

## 要建什么

让所有 Claude 侧 agent 能通过 MCP 读设计档案：一个只走 stdio 的 MCP server，把 02 的六个入口暴露成六个工具，入参与返回和命令行一致，只做转发。**只读**：不提供任何写档案的工具。

- 不引入第三方依赖：插件脚本目前都是零依赖的 node，MCP 的 JSON-RPC（initialize、tools/list、tools/call）手写。
- 声明在**插件自己的** MCP 配置里，和已有的 headless 浏览器并列，目标项目零配置。仓库根取当前工作目录的 git 顶层；不在 git 仓库里时工具返回明确的错误。
- 不为 Codex 配置任何东西。
- 每个工具的描述写清楚「什么时候用它」（例如单个状态：要进某个状态复现或写测试时）。

## 验收标准
- [x] 起子进程走 stdio，initialize 与 tools/list 返回六个工具及入参 schema
- [x] 对 02 的同一组夹具，六个工具的 tools/call 返回与命令行输出等价
- [x] 找不到对象、不在 git 仓库里时返回 MCP 的错误结果而不是让进程崩
- [x] 插件 MCP 配置里新增这个 server，已有的浏览器 server 不受影响
- [x] 全量 node 测试套件全绿

## 选中的存量回归
无 test-cases 库。跑全量 `*/scripts/*.test.mjs`。
