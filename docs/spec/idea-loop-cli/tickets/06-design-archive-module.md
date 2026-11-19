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

> 人的决定（2026-11-19）：S1 B，换现成库

- [x] review 第 1 轮 S1（2026-11-19）：读文件开头元数据改用现成的 YAML 库，删掉自写的小解析器，所有用它的模块（设计档案、评委一轮、方向说明、retro 候选池等）一起换；不带引号的 `[[链接]]`、以 `{` 开头的值不再容错，改为报错，报错说出文件、行和「引用要加引号」；日期照旧读成原文字符串、字段照文件里的顺序输出，其余命令输出不变；本机真实设计档案（TOFEL-demo 的设计档案目录）跑档案检查照旧通过（人的决定 2026-11-19「A，去改 8 处」：真实档案里 8 处值不合 YAML，已在 guohaonan-shy/Tofelair#1031 的分支上加了引号，在那个分支上跑 `design archive check` 通过（413 个对象），与已发 0.0.1 一致；Tofelair#1031 合并后才在它的 main 上通过）

> 人的决定（2026-11-19）：S1 A，S2 A

- [ ] review 第 2 轮 S2（2026-11-19）：读文件开头元数据时，库报语法错（如 did not find expected ',' or '}'、mapping values are not allowed in this context），在原文后面补一句中文「值里有冒号、问号或花括号时要加引号」，文件和行号照旧；拿 TOFEL-demo 主分支那 8 个文件各验一次都带这句
- [ ] review 第 2 轮 C1 补（2026-11-19）：dyna 自己的输出和 --help 里指代 dyna 命令的「脚本」改成「命令」（设计档案写入与检查、dreaming 提议表那几处「归档脚本」「脚本不代改」），0.0.2 的登记表从命令树重新生成；版本仍是 0.0.2，不再升
