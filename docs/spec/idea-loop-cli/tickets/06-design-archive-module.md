# 06 — design 模块（一）：设计档案、设计档案 MCP、test 夹具

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

把设计档案的解析做成共用包；design-archive-check / query / write / sections 收成 `dyna design archive …`。设计档案 MCP 做成单独的 Go 包，由 `dyna mcp design-archive` 起，七个查询工具的名字、参数、返回不变，查询逻辑跟 `design archive query` 共用一份。design-archive-fixture 收成 `dyna test fixture design-archive <目录>`（只给测试调）。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [x] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [x] `dyna test fixture design-archive <空目录>` 后 `dyna design archive check <那个目录>` 退出 0
- [x] 用 MCP 客户端对同一份档案调七个工具，返回与旧 MCP 服务器一致
- [x] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `design-archive-check.test.mjs`、`design-archive-query.test.mjs`、`design-archive-write.test.mjs`、`design-archive-sections.test.mjs`、`design-archive-mcp.test.mjs`：行为基准
- `design-archive-sections-browser.test.mjs`：碰浏览器，搬时确认它在本机能跑
