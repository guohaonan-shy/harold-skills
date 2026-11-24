---
type: ticket
spec: "[[setup-modules]]"
blocked_by: []
---

# 01 setup 的「模块」改成设计、SEO、评测三段，正文压到 ≤4000 字

一张工单做完整份 spec：改动都在 `idea-loop/skills/engineering/setup/` 和一条新的文档测试，拆开会让同一份 SKILL.md 被几张工单轮流改。

## 做什么

- 「模块」一节：设计 → SEO → 评测三段，一张表（段、出题看哪个 skill、推荐「接」的依据、步骤文件），每段一道「接 / 以后再说」；没装的段不出题、交回写一行怎么接；已接过的照样出题、推荐「接」。
- 新参考文件 `references/design.md`（LFS 规则、Mobbin 查法）、`references/eval.md`（调 `ai-eval:eval-setup`，`EVAL.md` 在代码仓库根、setup 不提交）。
- 从核心挪走：问人清单的「做不做 UI 设计」、预检表的 Mobbin 一行、「写」里 LFS 一条。
- 「规则回放 runner」「每周对账」「每周分拣」「调度」并成「定时任务」一节：一张表，一条完成条件。
- 「交回」只留按节的骨架，细项挪进 `references/handback.md`。
- frontmatter description、`idea-loop/README.md` 的 setup 一行跟着改。
- 不碰 `references/runtime-env.md`（#490 在改）。

## 验证

- 新文档测试 `idea-loop/scripts/setup-modules-doc.test.mjs`：先对改前的文本（`SETUP_MODULES_DOCS_ROOT` 指向旧插件）看它失败，再对改后看它过。
- 读 setup 的现有文档测试照旧过（措辞挪了位置的，测试跟着改读的文件）。
- `dyna spec skill-lint --changed origin/release/idea-loop-0.2.0` 过；按 `AGENTS.md` 量法主体 ≤4000 字。
- 手动走查照 spec「测试决策」，结果写进 PR 描述。
