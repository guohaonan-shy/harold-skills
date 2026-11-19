# 19 — 收缩：删掉旧脚本与它们的行为测试，README 同步

**Blocked by**：15 — hooks.json 与 .mcp.json 改调 dyna；16、17、18 三张迁移工单
**设计冻结**：不涉及 UI

## 要建什么

所有调用方都改调 `dyna` 之后，删掉插件里旧的 `.mjs` 实现和测它们行为的测试（行为已由 `go test` 守着），codex-companion 和 mini-yaml 一起删；测 skill 文字的测试留下。plugin README 的命令写法同步改；setup 的预检改查 `codex` 命令在不在、在人同意后调 `self install` 装命令行。全仓再跑一遍扫描测试和全部测试。

## 验收标准

- [ ] 在插件的 skills、agents、hooks 里搜旧脚本全路径没有输出
- [ ] 插件里没有旧脚本实现，没有 import 它们的测试；剩下的 `node --test` 全绿，`go test ./...` 全绿
- [ ] README 里写的每条 `dyna …` 都过扫描测试
- [ ] setup 的预检不再提 companion

## 选中的存量回归

- 全量 `node --test`：删实现后剩下的 skill 文字测试不能因为找不到被删文件而红
- `setup-*-doc.test.mjs`、`readme-project-directory-doc.test.mjs`：断言 setup 和 README 的文字

> 补充（工单 03 交回，2026-11-19）：`home index` 的 spec 层和 `spec index` 各有一份生成代码，收缩时让 `home index` 改调 spec 包那份，只留一份。删旧 `glossary-check.mjs` 前，查目标仓库 CI 里有没有直接下载它的用法，有的改成命令或在交回里说明。

> 补充（工单 09 交回，2026-11-19）：删旧脚本时同步 `retro install` 的文件清单（project-map、runtime-detect 等），并把它打印和写进入口文件的「idea-loop:runtime 的『装与设置』」「scripts/retro-install.mjs」两处文字改成新的说法。工单 16 若挪动 dreaming 的提议表参考文档，dreaming 模块两条读它的 go test 随之改。

> 补充（工单 12 交回，2026-11-19）：uiux-research 的 eval runner 的形状检查仍起旧 research-check 脚本，删它之前改成 `dyna research submit`。
