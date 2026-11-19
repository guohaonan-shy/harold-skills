# 07 — design 模块（二）：lint、方向说明、critic、流程图、DESIGN.md

**Blocked by**：06 — design 模块（一）：设计档案、设计档案 MCP、test 夹具
**设计冻结**：不涉及 UI

## 要建什么

design-lint 收成 `dyna design lint`（只由 hook 调，带 `--hook` 时照现在的 PostToolUse 钩子回话）；direction-note-check 变成 `design note submit`；critic-score 变成 `design critic round`；flow-compose 收成 `design flow compose`。新增 `design md lint`（带 `--hook` 时代替现在的 DESIGN.md 钩子）、`design md diff`，包官方 DESIGN.md 工具。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [ ] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [ ] `design lint --hook`、`design md lint --hook` 对同一个 hook 事件的回话与旧钩子一致
- [ ] `design note submit` 对格式不对的方向说明拒绝并说出哪一条
- [ ] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `design-lint.test.mjs`、`design-lint-hook.test.mjs`、`design-md-hook.test.mjs`、`direction-note-check.test.mjs`、`critic-score.test.mjs`、`flow-compose.test.mjs`：行为基准
