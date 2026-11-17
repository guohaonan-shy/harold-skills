# 07 — 冻结之后按会话类型分出口，triage 时不让切工单

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

真实发生过：一个 triage 状态的 issue 会话里，refine 冻结并提交后，编排者没有走「推送分支 → 翻 todo → 交给调度」，直接切了 10 张工单。人发现后说：「理论上spec冻结之后，issue的状态不是应该进入todo，等待下一次调度吗？怎么直接走到了ticket拆分」。结果 issue 停在 triage，分支上却已经有工单，也跳过了 todo 会话「先开 draft PR 再切工单」的顺序。

原因有两处：`uiux-refine` 冻结之后告诉人的那句话叫 issue 会话「换到实现阶段」，指向 `idea-loop:issue-session` 里并不存在的小节「换阶段」，同一句还把「自己调 to-ticket」列成选项；`idea-loop:to-ticket` 只核「没有待定」「设计已冻结」，不看 issue 状态。

这张工单之后：
- **冻结后的那句话按会话类型分**：triage 会话 → 回 `issue-session` 的「交给调度」（推送、翻 todo、收尾）；todo 会话 → 回 `issue-session` 的「实现」（先开 draft PR 再切工单）；不在 issue 会话里 → 人自己定。删掉「换阶段」，删掉「自己调 to-ticket」这个选项。
- `issue-session` 开头那句泛指的「换阶段」一并对齐成它真有的小节名。
- **to-ticket 加一条前提**：在 issue 会话里时，issue 还在 triage 就停下，指回 `issue-session` 的「交给调度」；issue 状态用 `idea-loop:issues` 的脚本查，不看 label。人直接调 to-ticket、不在 issue 会话里时，不核状态。

这张拥有 `uiux-refine` 的「冻结之后」那份参考；它里面「会话中断或重开」一段归 08 改，这张不动那段。

**回放用例**（#287 是规则改动）：照 retro 回放已有用例的格式加一个：在一个 triage 状态的 issue 会话里，refine 刚冻结提交，问编排者下一步做什么。是/否题：会话是否走「交给调度」而不切工单（或在会话里调 to-ticket 时被拦下）。改前判「否」、改后判「是」才算过。用例写通用描述，不写真实项目名。

> 人的决定（2026-11-17）：「D2 选择A」——删掉回放用例 to-ticket-triage-stop（改前改后都判「是」，证明不了改动有效），以文档守卫测试 after-freeze-exit-doc（改前全红、改后全绿）作这条规则改动的验收证据。

## 验收标准

- [x] 「冻结之后」参考里告诉人的话按三种会话类型分开写，每种指向 `issue-session` 里真实存在的小节；全插件搜「换阶段」没有指向不存在小节的引用
- [x] 不再出现「自己调 `idea-loop:to-ticket`」作为冻结后的选项
- [x] to-ticket 的前提里有「在 issue 会话里、issue 还在 triage 就停下，指回交给调度」，并写明人直接调用时不核
- [ ] ⏭ 延后 → 09：在示例项目上真跑 triage 会话冻结的端到端
- [x] 人的决定（2026-11-17）：回放用例 to-ticket-triage-stop 整个删掉，README 与回放相关的清单里不再提它；PR 交付验收里写明这条规则的证据是文档守卫测试（改前全红、改后全绿）

## 选中的存量回归

- `issue-session-implement-doc.test.mjs`、`issue-group-skills.test.mjs`：它们读 issue-session 的小节名和 to-ticket 的引用
- `pr-flow-doc.test.mjs`：它读 to-ticket 与 uiux-refine 的衔接
- `skill-edit-acceptance-doc.test.mjs`：它读 to-ticket
- `triage-autonomous-doc.test.mjs`、`dispatch-triage-cards-doc.test.mjs`：它们断言 triage 会话「交给调度」那条路
- `retro-case.test.mjs`：新用例的格式
