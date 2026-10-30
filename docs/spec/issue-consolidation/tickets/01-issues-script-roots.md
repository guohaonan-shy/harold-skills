# 01 — issue 脚本认得根 issue：候选、认领、根跟着最慢的子 issue、最后一个子 issue 关时关根

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 issue 状态脚本（`issues`）今天把每个 issue 当成独立的一件活。GitHub 上已经能把几个 issue 挂到一个根 issue 下面（原生 sub-issue），这张工单让脚本认得这种「一个根加它的子 issue」的组：

- **读 issue 的方式**：开着的 issue 改从仓库范围的 REST 列表读（`repos/<仓库>/issues?state=open`，分页，跳过 PR）。它一次给出每个 issue 的创建时间、父 issue（`parent_issue_url`）和子 issue 数（`sub_issues_summary`），本机不需要 GraphQL。「根」= 有子 issue 的 issue；「子 issue」= 有父 issue 的 issue。
- **取待验证候选**：跳过有父 issue 的子 issue（它跟着根出卡片）；跳过开了不到 6 小时的（整合定时任务每 6 小时跑一次，等它至少看过一次）。根 issue 照常作为候选，而且不受 6 小时限制：根本身就是整合任务开出来的。「现在」要能在测试里注入。
- **认领 / 翻状态**：对一个根号翻状态时，根和它开着的子 issue 一起翻，照现有的允许翻法逐个核。
- **根的状态跟着最慢的子 issue**：阶段顺序是 待验证 < 验证中 < 审核中 < 待设计 < 设计中 < 待实现 < 实现中。对账和一份 spec 合并后的推进（advance）都把根的 `status:*` 重算成它开着的、没搁置的子 issue 里最靠前的那个状态；子 issue 全都搁置时，根不动。
- **关根**：根下的子 issue 全都关了（根还开着、子 issue 数大于 0、没有开着的子 issue），对账和 advance 关掉根（completed），评论写明「子 issue 都已关闭」。
- **根不是孤儿**：根没有 spec 列着它，对账和取待设计 / 待实现队列都不再把它当成「有状态却没有 spec 列着」的问题报出来。
- **查一组**：新增一个命令 `group <docs> <号>`，给根号或子 issue 号都行，输出 JSON：根的号与标题，以及根下开着的子 issue（号、标题、状态）；不在任何组里的 issue，根就是它自己、子 issue 为空。调度和 issue 会话靠它认一组。
- **文档**：`spec-status` skill 的命令清单和「issue 的状态」一节补上：根跟着最慢的子 issue、候选的两条跳过规则、`group` 命令；脚本文件头的用法说明同步。

spec 的 frontmatter `issues:` 只写它对应的那一个子 issue，所以按 spec 翻的逻辑不变。

> 人的决定（2026-10-30）：「你先按照上面对于每个章节的意见来修改吧～」——spec-status 的 SKILL.md 按 writing-for-agents 的剪枝大幅简化，不靠挪进 references：
> - issue 状态表删掉「谁、什么时候翻」一列；「待」字头那段收成一句：「待」只由对账照主分支挂，「中」由会话挂。
> - `issues set` 的放行表整张删（脚本拒绝时会列出能翻成什么）。
> - 「根 issue 和子 issue」收成两句：给根号整组翻、`group` 查一组；根跟着最慢的子 issue、关根由脚本自己做。
> - 命令块保留，注释砍到半行。
> - spec 状态表删掉「脚本核的前提」一列，删掉放行规则那一行。
> - 「从旧状态机迁移」整节删掉，同时改掉别处指向它的两处（setup 与 dreaming 提议表参考资料里的指向）。
> - 「issue 的分类」「开一个待验证的 issue」保留（别的 skill 指向它们）。

## 验收标准

- [x] 一个根挂着两个待验证子 issue、另有一个开了 1 小时的待验证 issue 时，取候选只出根，不出两个子 issue，也不出开了 1 小时的那个（单元测试，假 `gh`）
- [x] 开了 6 小时以上、没有父 issue 的待验证 issue 照旧出现在候选里，现有候选测试（spec issue、spec 已列的、独立队列）照旧通过
- [x] 对根号翻「验证中」，根和两个子 issue 都变成验证中（单元测试）
- [x] 根下两个子 issue，一个已关闭、一个实现中；advance 关掉后一个之后，根也被关闭（单元测试）
- [x] 子 issue 分别处于审核中和实现中时，对账把根翻成审核中（单元测试）
- [x] 有状态 label 的根不出现在对账的「没有 spec 列着它」问题里，也不出现在待实现 / 待设计队列的问题里（单元测试）
- [x] `group` 对根号、对子 issue 号返回同一组；对不在组里的 issue 返回它自己（单元测试）
- [x] `issues.test.mjs` 全部通过；`spec-status` SKILL.md 写明新规则与 `group` 命令
- [x] 人的决定（2026-10-30）：spec-status SKILL.md 照上面的剪法改完，主体回到 5000 字以内（预计 3000 左右）；别处指向被删小节的引用都已改掉，没有悬空的「spec-status 的「…」」指向

## 选中的存量回归

- `idea-loop/scripts/issues.test.mjs` 全部：读 issue 的方式从 `gh issue list` 换成 REST，假 `gh` 要跟着换，每个读开着的 issue 的命令（candidates、queue、reconcile、advance、labels）都有风险。
- `idea-loop/scripts/spec-status.test.mjs`：`issues` 从它导入函数，确认没被连带改坏。
