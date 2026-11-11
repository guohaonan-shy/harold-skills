---
type: adr
status: 生效
tags: [design, design-reference, uiux-refine, confirmation]
summary: 设计参考加规则：离开 / 结束入口只在会丢用户成果时才弹确认，没东西可丢却弹了算 finding
related: ["[[0002-design-loop-v2-imagine-refine]]"]
---

# ADR-0018 — 设计参考：只有会丢东西时才弹确认

> 由 spec `confirm-only-on-loss` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

2026-10-22 对着当时主分支逐份读了 refine 的设计参考，并全文搜了 idea-loop 里所有「confirm / 确认 / unsaved / navigating away」的出现处（#56）。与离开、结束、破坏性操作的确认有关的规则一共四条（表单离开提示、破坏性操作要确认或撤销、能撤销就别弹确认、启发式清单里缺确认算问题），方向全是「要加确认或撤销」，没有任何一条说「没东西可丢时不该弹确认」。

后果：一道口语题还没开始答、用户点左上角结束，照旧清单，designer 和 Gate 2 评审看到「结束 = 放弃整个任务」，最稳的做法是一律加确认框，清单里找不到依据把这个确认判成问题。守护不了任何东西的确认框会训练用户不看就点，等真会丢东西的那次也拦不住。这条原则在某个产品的做题页已落地；2026-10-20 dreaming 蒸馏时 Harold 判定它属于通用设计原则、不进项目 `DESIGN.md`，只能落在插件的设计参考里。

## 2 决策（how）

- **在设计参考的「Practical craft checklist」里加一条 Leave / end confirmations**，能对着画面逐个入口检查：先写「此刻点下去会丢什么」（已交的答案、输入框里非空白内容、进行中的录音或上传）；有则要确认，能撤销就撤销；没有则直接执行，弹了算 finding；按状态判，不按入口判（空状态与有内容状态的验收矩阵都要看）。
- **原有 Forms 里「离开未保存表单要提示」改成指向新条目**（它是特例，免得两处说法走岔）；Destructive actions 一条加交叉引用，原要求不变。
- **只落一处**：`heuristics-checklist`（Nielsen 十条打分）、`design-core`（undo-over-confirm 讲保护方式）、`ui-master` / `ui-reviewer` 定义都不改，按参考文件判。
- **举例用通用说法**（已交的答案、非空白输入、进行中的录音），不写产品细节。
- **不加机械检查**：「会不会丢」要看状态和业务，`design-lint.mjs` 的正则判不了，只进模型判断的清单。
- 同时把这一节按 `writing-for-agents` 重写，语义不变。

## 3 结果（result）

- 实现于 PR #75（2026-10-22 合并）。后来设计参考由 16 份合成 6 份（PR #253），这条规则随之住进 refine 参考目录里的 `critique.md` 的「Practical craft checklist」一节（原 `ui-craft-checklist.md`），条目名仍是 Leave / end confirmations；Forms 与 Destructive actions 两条指向它；`design-law.md`（原 `design-core.md`）的 undo-over-confirm 原样保留并指向它。
- 文件里没有出现产品名或 PR 号。
- 相邻规则见 `ADR-0019`（结束入口的图标语义），与本条互相引用、不重叠。
- 没有测试：这是给模型读的清单，判得准不准只能在真实设计会话里看。
