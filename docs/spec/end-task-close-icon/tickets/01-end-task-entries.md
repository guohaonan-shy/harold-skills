# 01 — 设计清单加 End-task entries：结束整个任务的入口用 X

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的设计 agent（designer，以及 refine 的 G 阶段评审）在评审时读一份英文的「UI craft checklist」，它在 uiux-refine 的设计参考里。其中「Practical craft checklist」一节已有一条 **Leave / end confirmations**：每个离开、结束、关闭入口点下去会不会丢东西、要不要确认。

在这一条**之前**加一条 **End-task entries**，让评审过一个离开类入口时，能把「用后退箭头结束整个任务」判成 finding。条目内容（英文，格式照 Leave / end confirmations：编号的检查步骤加一段 Why）：

1. 先分清这个入口点下去是「回一步」，还是「结束整个任务」（放弃这场练习、退出整个流程、丢掉这次会话）。
2. 结束整个任务的入口用关闭符号（X），不用后退箭头；用了后退箭头算一条 finding。
3. 这个 X 配悬停 / 聚焦提示和无障碍名称，写明结束的是什么（如 "End practice"），不只写 "Close"。
4. 后退箭头只留给真的回到上一步、且不放弃整个任务的入口。
5. 点下去要不要确认，交给紧随其后的 Leave / end confirmations 判，这里不重复。

Why：箭头看起来像普通后退，用户不会意识到点下去会结束整场任务；X 让人明白这是一个要重视的按钮。

这一节开头那行列举本节内容的目录（Forms, touch, performance, navigation, destructive actions, leave / end confirmations, copy）同步加上 end-task entries，放在 leave / end confirmations 之前。

人的决定：落点就是这里，紧挨 Leave / end confirmations（原话「留在 ui-craft-checklist 的 Practical craft checklist，紧挨 Leave / end confirmations」）。其余条目、其余各节、别的参考文件都不改。不写任何具体产品名、页面或 PR 号（仓库规则：不硬编码 Toeflair）。

## 验收标准

- [ ] Practical craft checklist 里 Leave / end confirmations 之前有一条 End-task entries，含上面五点和一段 Why，英文，格式跟 Leave / end confirmations 一致
- [ ] 这一节开头的目录行列了 end-task entries，在 leave / end confirmations 之前
- [ ] Leave / end confirmations 及这份文件其余内容原样未动（diff 只有新增条目和目录行）
- [ ] 这份清单文件里搜 Toeflair / TOEFLAIR / #478 无结果

## 选中的存量回归

无：改的是给设计 agent 读的参考文档，仓库里没有覆盖它的测试。
