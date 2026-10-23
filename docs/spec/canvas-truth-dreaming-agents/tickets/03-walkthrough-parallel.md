# 03 — ui-reviewer 每轮走查对画布，跟 pr-reviewer 同时起

**Blocked by**：02 — 冻结只交画布，冻结后的设计变更由 designer 改画布
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里，pr-review 每跑一轮、需求有设计产物时：

- 编排者在**同一条消息**里起 `idea-loop:ui-reviewer`（模式「每轮走查」，原「每轮审查」改名，性质不变：只发现、不改）和 `idea-loop:pr-reviewer`。pr-reviewer 拿到的仍是发现文件的路径，此时文件可能还不存在：它照常起两个 Codex 进程，写汇报前等发现文件出现，记在它等 Codex 的同一个 20 分钟总预算里；到时没出现，或编排者在这一轮目录里写明 ui-reviewer 交回了 `incomplete`，UI 这一轴记「未完成」写进「没覆盖到的」。
- ui-reviewer 每轮走查的输入从 `delta/` 换成画布：要核的状态清单取冻结记录里的状态矩阵，加上「冻结后的变更」里新增的格；进入方式取 spec 的入口与 `prod/` 里已有的边，新状态在真实应用里自己找路，找不到记「进不去」；画面比对照旧对画布。没有画布、只有实现者记的「最小差异」的需求，照旧以 `delta/` 为清单。
- 发现文件形状不变；`decide` 的两个选项改成「改实现」与「接受实现，走设计变更」。真正的故障照旧是发现。ui-reviewer 不改画布、不改 `delta/`、不判该改哪边。
- 设计变更之后的核对就在下一轮的每轮走查里做；PR 开出前发生的变更在第一轮一起核。

依据与全貌：spec `docs/spec/canvas-truth-dreaming-agents/canvas-truth-dreaming-agents.md` 的「实现决策」3。

## 验收标准
- [ ] pr-review「跑一轮」写明两个审查者在同一条消息里起，不再「等它交回发现文件的路径」才起 pr-reviewer
- [ ] pr-reviewer 写明等发现文件、与 Codex 共用 20 分钟总预算、超时或 `incomplete` 记未完成
- [ ] ui-reviewer 的模式取值为「每轮走查 / 归档 / 对账」；每轮走查的清单、进入方式取自画布与冻结记录，最小差异的需求仍取 `delta/`；`decide` 选项已改名；仍写明只发现、不改
- [ ] README 里 ui-reviewer 与 pr-review 的描述跟上
- [ ] 全量测试 `node --test '*/scripts/*.test.mjs'` 通过

## 选中的存量回归
- `review-check.test.mjs`：UI 发现并进 Spec 候选的形状靠它校验，选项改名不能让它拒收
- `review-loop.test.mjs`：每轮条目的记法不变
- `archive-check-flag.test.mjs`：ui-reviewer 说明里的档案校验命令仍须带 `--no-used-by`
