# 02 — skill `issues`：通用的 issue 实体，GitHub / Linear 各一份对照

**Blocked by**：01
**设计冻结**：不涉及 UI

## 要建什么

skill `spec-status` 改名 `issues`，正文写通用的 issue 实体，读完的 agent 不看平台也知道一件事走到哪、谁来翻：

- 字段：号、标题、正文、状态、类型、模块、优先级、blocked by、挂着的 PR、评论。
- 七个状态、谁在什么时候翻（spec「方案」的两张表），没开 Triage 的团队跳过 triage。
- issue 正文格式（spec「issue 正文」）：标题一句现象；问题、证据、影响范围、从哪发现必填，背景、已确认原因可选；类型、模块、优先级不进正文。
- 先放着回 backlog 带评论；blocked 用平台的 blocked by；不用父子关系归组。
- 「开一个 issue」这一节：开成 backlog、正文按上面的格式（统一入口留给 #243，这里只换状态和格式）。
- 脚本命令一览（01 的命令）。

两份 reference：GitHub（label、关闭 reason、dependencies、PR 正文的 `Refs`）；Linear（workflow state、单选 label 组、blocks、PR 标题前缀 `[<号>]` 与正文 `Linear: <号>`、In Progress / In Review / Done 由集成推；写明 MCP 操作和 setup 归 #226，这次只写对照）。

同时把项目侧的说明换掉：setup 写进目标仓库的 `ISSUE_TRACKER.md` 模板换成七个状态的表，加一行「triage：用 / 跳过」，加「仓库」一节（仓库名、本地路径、主分支、管什么，第一行是知识库所在的仓库）；harold-skills 根目录的 `ISSUE_TRACKER.md` 照模板改；根 `AGENTS.md` 的「issue 分类」加类型（`kind:*`）一句，并把「参考资料归谁」等处的 `spec-status` 名字换成 `issues`（含 `idea-loop/AGENTS.md`）。

## 验收标准
- [x] skill `issues` 存在、`spec-status` 不存在；description 只做路由
- [x] 正文写了七个状态与翻法、正文格式（四个必填节）、先放着、blocked by、脚本命令
- [x] GitHub 与 Linear 两份 reference 各自写清状态、类型、模块、PR 挂 issue 的表达
- [x] `ISSUE_TRACKER.md` 模板与 harold-skills 根目录那份都是七个状态、带 triage 用不用和「仓库」节
- [x] 插件里没有别处再指向 `idea-loop:spec-status`（02–05 合起来满足，这一格查本刀碰的文件）

## 选中的存量回归
- `setup-single-source.test.mjs`：setup 模板的单一来源检查，改模板可能触发。
- `skill-private-references.test.mjs`：skill 改名后 references 的归属检查。
- `no-project-leak.test.mjs`：reference 里举例不能出现真实项目名（Linear 对照不能写 FA、fishaudio）。
