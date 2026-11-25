# 01 — spec 检查认七节顺序和「杠杆诊断」，写 spec 时当场报

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

agent 写或改一份 spec 文件（知识库 `spec/<slug>/<slug>.md`）的那一刻，插件的写文件后钩子跑 `dyna spec check --hook`：七节（问题陈述、方案、User Stories、实现决策、测试决策、Out of scope、关联）缺了或顺序错，或 frontmatter 写了 `changes_agent_docs: true` 却没有标题为「杠杆诊断」的一节（`##` 或 `###`；「杠杆诊断」可插在任意两节之间，不算顺序错），钩子退出码 2，stderr 写缺什么、错在哪，和下一步「照 `idea-loop:to-spec` 的模板补」。写的不是 spec 文件（raw 讨论、工单、别的文件）或 spec 干净时静默退出 0。不带 `--hook` 的全量 `dyna spec check <docs>` 同样报这两类问题。

钩子的读法、静默规则、退出码照现有的 `dyna spec skill-lint --hook` 和它的测试。插件的钩子配置在 PostToolUse `Write|Edit` 下加这一行。

顺带删掉没人调用的判词解析（`Verdicts`、`AllAbsent`）及其测试。dyna 版本在集成分支当时的版本上升一档（现在 0.0.15 → 0.0.16；合并前若集成分支已更高，取它的下一档），按 `DEVELOPMENT.md`「命令行 dyna」重存登记表、提插件要的下限。

## 验收标准

- [x] 七节齐、顺序对的夹具 spec 喂给 `--hook`：静默退出 0；调换「方案」「User Stories」后退出 2，stderr 写顺序错和「照 `idea-loop:to-spec` 的模板补」。
- [x] frontmatter 有 `changes_agent_docs: true`、没有「杠杆诊断」的夹具：退出 2，报缺「杠杆诊断」；加上 `### 杠杆诊断` 后退出 0；去掉标记、也没有这一节时退出 0。
- [x] 写到 raw 讨论、写到 spec 的 tickets 目录下的工单：都静默退出 0。
- [x] 对本分支的 `docs/` 跑全量 `dyna spec check docs`：存量 spec 和本 spec 都不报结构问题。
- [x] 判词解析的代码和测试已删，`go test ./...`、`go vet ./...` 全过。
- [x] 钩子配置里有这一行；dyna 版本已升一档，`scripts/dyna-version.test.mjs` 与插件版本相关测试全过。

## 选中的存量回归

- `dyna/internal/spec` 的 `cmd_test.go`、`spec_test.go`：spec check 现有的报告不能因加规则而变。
- `dyna/internal/spec` 的 `skilllint_test.go`：`--hook` 照它写，别把共用的钩子读法改坏。
- `scripts/dyna-version.test.mjs`：改了 dyna 必须升版本。
