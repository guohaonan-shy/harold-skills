# 13 — test 模块：跑插件测试、查 skill 文档

**Blocked by**：06 — design 模块（一）：设计档案、设计档案 MCP、test 夹具
**设计冻结**：不涉及 UI

## 要建什么

skill-doc-check 收成 `dyna test skill-doc`（查一份 skill 的主体字数和被指向的小节在不在）；新增 `dyna test run [匹配]`：跑插件自己的 `*.test.mjs`。整个模块只给测试、`REVIEW.md`、`DEVELOPMENT.md` 调。共用测试用具（设计档案夹具等）改经 `dyna test` 调。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [x] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [x] `dyna test run issues` 只跑名字含 issues 的测试文件并返回它们的结果
- [x] `dyna test skill-doc` 对超 5000 字的 skill 报红，字数量法与 AGENTS.md 一致（UTF-8 字符）
- [x] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `skill-doc-check.test.mjs`：行为基准
