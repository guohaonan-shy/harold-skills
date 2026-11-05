# 03 — issue 会话与调度换成新阶段

**Blocked by**：01、02
**设计冻结**：不涉及 UI

## 要建什么

issue 会话和调度照 spec「一个 issue 一个会话，PR 从实现开始就挂着」改：

- 会话认的单位是一个 issue（不再有根、组、整合），标题「<仓库名>#<号> <标题>」。
- 侧边栏 section 是 triage、in-progress、in-review（独立队列前面加分类名）。
- triage 会话（人开的）：认领 triage，起草 spec、grill、设计；做完 push 分支、`set todo`、在 issue 上评论分支名，归档。
- todo 会话（调度派的）：认领 in-progress；有分支就接着，没有就自己起草 spec（冒出要人定的就翻回 triage 并评论）；之后走实现与 review（04 改的那部分）；全部 PR 合并后 done。
- 先放着：`set backlog --comment=<停在哪、分支名>`，归档。
- 调度一个 todo issue 一张卡片，候选来自 `candidates`；「没有会话的 issue」报 triage、in-progress、in-review 却没有同号会话的；每轮对账跑 `reconcile`。整合定时任务的说法全部删掉。
- `issue-verify`：只在 triage 会话里用（复现、起草、grill），状态名换成新的；收尾不再走 `advance`。

## 验收标准
- [x] issue-session 写清 triage 会话与 todo 会话两条路、先放着、多仓库时在每个仓库开 worktree 的指引
- [x] issue-dispatch 只派 todo，section 名、没有会话的判定、对账都按新状态
- [x] 两个 skill 与 issue-verify 里没有旧中文状态名、根 / 子 issue、整合、`advance` / `group`
- [x] 现有关于这几个 skill 的文档测试改成新模型后全绿
- [x] `issue-group-skills.test.mjs` 里「文中写到的 issues 命令」那条测试中给已删命令（advance、group、drop 等）开的豁免删掉，三份 skill 里不再写它们（继承自 01）

## 选中的存量回归
- `issue-group-skills.test.mjs`：钉着「一组」的说法，要改成「一个 issue」的版本。
- `issue-session-implement-doc.test.mjs`：钉着会话进实现阶段的写法。
