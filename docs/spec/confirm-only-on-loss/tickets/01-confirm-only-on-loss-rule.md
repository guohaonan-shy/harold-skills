# 01 — 设计参考加「只在会丢东西时才确认」条目

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 `uiux-refine` 设计参考里有一份 UI craft 清单（`ui-craft-checklist.md`），designer agent 签字前、Gate 2 评审时照它逐条过画面。它的「Practical craft checklist」一节现在只会问「该确认的地方有没有确认」：离开未保存的表单要提示、破坏性操作要确认或撤销。没有一条能把「什么都不守护的确认框」判成问题。

做完之后，评审拿这一节过一个离开 / 结束 / 关闭入口时：

1. 先写出此刻点下去会丢掉用户的什么：已交的答案、输入框里的非空白内容、进行中的录音或上传这类。
2. 有会丢的东西：要确认；能撤销就用撤销代替确认（沿用 `design-core.md`「Copy construction」里的 undo-over-confirm，不复述它）。
3. 没有会丢的东西：直接执行，不弹确认。弹了算一条 finding。
4. 按状态判，不按入口判：同一个入口在空状态和有内容的状态下表现不同，验收矩阵里两种状态都要看。

为什么要这条：守护不了任何东西的确认框会训练用户不看就点，等真会丢东西的那次就拦不住了。条目里把这句理由写上，让读者能判清单没列到的情形。

同时，这一节整体按 `idea-loop:writing-for-agents` 的写法重写：新条目和同节已有的条目（Forms、Touch、Performance、Navigation、Destructive actions、Copy mechanics）都过一遍，语义不变，只改写法。其中 Forms 里「warn before navigating away from an unsaved form」是新规则的特例，改成指向新条目；Destructive actions 加一句交叉引用，原有要求不变。

范围只到这一节：文件其余各节不动（另一份进行中的 spec 在改「DESIGN.md drift check」一节）。全文保持英文，跟文件其余部分一致。条目里只用通用的例子，不出现 Toeflair / TOEFLAIR 和它的产品细节（如「口语题交过至少一题」）——仓库 `AGENTS.md` 规定插件不硬编码 Toeflair。不加 `design-lint.mjs` 的机械检查：「会不会丢」regex 判不了。

## 验收标准

- [x] 「Practical craft checklist」一节有一条离开 / 结束确认的条目，含上面四点和一句理由
- [x] 该条目引用 `design-core.md` 的 undo-over-confirm，不复述其内容；`design-core.md` 未改动
- [x] Forms 里离开未保存表单那句改成指向新条目；Destructive actions 原有要求还在，并加了交叉引用
- [x] 这一节已按 `idea-loop:writing-for-agents` 重写：交付说明里逐条列出照它改了什么，每条改动语义不变
- [x] `git diff` 只落在 `ui-craft-checklist.md` 的「Practical craft checklist」一节（和这份 spec 的 tickets 目录）
- [x] 对 `ui-craft-checklist.md` 搜 `Toeflair` / `TOEFLAIR` 无结果
- [x] 全文仍是英文
- [x] review 第 1 轮 S1（2026-10-22）：Performance 里关于高频输入框的那句恢复成「优先」的语气（prefer uncontrolled inputs … over a controlled input that re-renders on every keystroke），不是硬性要求；重写只改写法，不收紧旧规则

## 选中的存量回归

无：这一刀只改给 agent 读的 Markdown 参考，仓库里没有覆盖这份文件内容的测试。
