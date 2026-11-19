# 10 — seo 模块

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

12 个 seo 脚本（seo-md、baseline、budget、check、content-scope、context、due、gaps、issues、live-check、live-record、meta-provenance）收成 `dyna seo …`；`seo check` 带 `--hook` 时代替现在的 seo 钩子（PreToolUse、PostToolUse 两处）。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [ ] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [ ] `seo check --hook` 对同一个 hook 事件的回话与旧钩子一致
- [ ] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `seo-scripts.test.mjs`、`seo-check.test.mjs`、`seo-content-scope.test.mjs`、`seo-gaps.test.mjs`、`seo-issues.test.mjs`、`seo-live-check.test.mjs`、`seo-live-record.test.mjs`、`seo-meta-provenance.test.mjs`、`seo-results-findings.test.mjs`：行为基准
