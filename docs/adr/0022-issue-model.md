---
type: adr
status: 生效
tags: [idea-loop, issue-workflow, issue-model, linear]
summary: issue 状态是唯一真相：七个状态对上 Linear，实现开始即开 draft PR，一个仓库一个 PR，不用父子归组，正文四节必填
related: ["[[2026-11-05-issue-model-regrill]]", "[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0022 — issue 模型：状态只在 issue 上，GitHub 与 Linear 同一个实体

> 由 spec `issue-model` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#242。对着 0.1.9 核出三件事：

1. **一件事两套状态**：spec 的 frontmatter `status`（草稿→…→完成）由 `spec-status.mjs` 写，issue 的 `status:*` 中文 label 由 `issues.mjs` 写；spec 那套没人维护——2026-11-04 未完成的 9 份 spec 里 7 份写“实现中”，它们的 issue 早已关闭。
2. **子 issue 被当成“归成一组”用**：整合定时任务（ADR-0021）把改同一处的 issue 挂到根下，开着的 10 个根下 27 个子 issue 并非从根拆出；Linear 上同样有汇总单下挂一堆不相干的 issue。
3. **状态名对不上 Linear**：八个中文状态把设计、实现各拆成“待/中”；Linear 团队的 In Progress / In Review / Done 由 PR 推，而 idea-loop 要等 PR 合并才翻状态、PR 在实现全部做完才开；一个 issue 常在多个仓库各一个 PR，idea-loop 一个会话只认一个仓库。

## 2 决策（how）

- **七个状态**：backlog → triage → todo → in-progress → in-review → done，另有 canceled。GitHub 上开着的四个状态各一个 `status:*` label（backlog 是开着且没有 `status:*`，done/canceled 只看关闭 reason）；Linear 上对 workflow state。团队没开 Triage 的在 `ISSUE_TRACKER.md` 写“triage：跳过”，backlog 直接到 todo。
- **spec 没有状态**：frontmatter 只留 `issues:`，spec 了结 = 它列的 issue 全关。`spec-status.mjs` 删除，读 spec 的函数移进 `spec.mjs`；翻状态的前提（triage→todo 时 spec 没有“需要 grill”“待定”、碰 UI 的设计已冻结；→done 时挂着的 PR 全部合并）由 `issues check` 判，`set` 先跑它。
- **实现一开始就开 draft PR**：spec 提交后立刻对每个要改的仓库开 draft PR，正文写 `Refs <owner>/<repo>#<号>`（不写 `Closes`，合一个就会关 issue；Linear 用标题前缀 `[<号>]` 与正文 `Linear: <号>`）。全部转 ready 进 in-review，全部合并进 done。一个 issue 每个要改的仓库各一个 PR，一个会话做完；`ISSUE_TRACKER.md` 加“仓库”一节列出产品的仓库。
- **不用父子关系归组**：一个 issue 一个会话、一份 spec；版本用 milestone，模块用分类 label，关联写正文链接；平台上已有的父子关系照常读、不当成组。整合下线。
- **issue 正文统一格式**：问题、证据、影响范围、从哪发现四节必填，背景、已确认原因可选；类型/模块/优先级不写在正文里。
- **分类 label**：模块沿用 `type:*`（不改已有 54 个 issue），类型新增 `kind:bug|feature|improvement`。没选的方案：模块改名 `module:*`，代价是迁移全部已打的分类 label。
- **blocked 与先放着不设状态**：被挡用平台的 blocked by，调度跳过还被挡着的 todo；先放着回 backlog，评论写停在哪个阶段、分支名。
- **旧 label 迁移**：`issues migrate [--apply]`，默认只列出；旧“验证中/审核中/待设计/设计中”→triage，“待实现”→todo，“实现中”→in-progress（挂着 ready PR 的为 in-review），“搁置”→backlog 并补评论，spec 的 `status` 行删掉，整合出的父子关系解除。没选的：留给后续版本、脚本把旧 label 当别名读。
- **skill `spec-status` 改名 `issues`**：正文写通用实体，GitHub、Linear 各一份 reference。

## 3 结果（result）

- 脚本：`idea-loop/scripts/issues.mjs`（`labels`、`type`、`show`、`check`、`set`、`candidates`、`reconcile`、`queues`、`migrate` 等；`advance`、`resume`、`handoff`、`group` 等旧命令已删）与 `idea-loop/scripts/spec.mjs`（`index`、`check`）；`spec-status.mjs` 已不存在。
- skill：`idea-loop:issues`（`references/github.md`、`references/linear.md`）；`issue-session`、`issue-dispatch`、`pr`、`pr-review`、`setup` 等入口已换新模型；`pr` 的“开 draft PR”写了 `Refs` 约定；仓库根的 `ISSUE_TRACKER.md` 有状态表与“仓库”一节。
- 守护：`idea-loop/scripts/issue-model-tripwire.test.mjs` 断言插件里不再出现 `spec-status`、八个旧状态名、“整合”及 `consolidation-prompt.md`。
- 已知限制：不支持各仓库各一份知识库；跨仓库联调的先后由人在 spec 里定，脚本不排序。

## 取代线索

- 取代 ADR-0021（整合任务与按根出会话）整份。
- ADR-0002 的 §2.3、§2.6 用 spec 状态 `等设计冻结` 描述“碰 UI 才走 imagine/refine”；spec 状态已不存在，该条件现在落成“triage→todo 前提：碰 UI 的设计已冻结”。这是措辞层面，两次触碰的设计决定不变。
- 后续被细化、不冲突：每周分拣与优先级派发（ADR-0023）；“调度只派 todo、triage 会话由人开”被 ADR-0025 改为也给 triage 出卡片；候选顺序后来加入指派人维度（ADR-0026，#264）。
