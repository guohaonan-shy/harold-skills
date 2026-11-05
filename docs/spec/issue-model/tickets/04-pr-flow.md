# 04 — 实现一开始就开 PR，多仓库各一个 PR，合并全部才 done

**Blocked by**：01、02
**设计冻结**：不涉及 UI

## 要建什么

从 spec 到合并这一段照 spec「一个 issue 一个会话，PR 从实现开始就挂着」与「多仓库」改：

- to-spec：frontmatter 不写 `status`；不再 `handoff` / `route` / `spec-status set`；要人定的照旧写「需要 grill」「待定」，由会话在 triage 里定。
- to-ticket：不再翻 spec 状态；多仓库时每张工单写明改哪个仓库。
- implement：开工第一步就对每个要改的仓库 push 分支、开 draft PR（正文 `Refs <owner>/<repo>#<号>`，Linear 项目照 reference 写标题前缀与 `Linear:` 行）、`set in-progress`；implementer 在工单所属仓库的 worktree 里做；全部落地转 ready 时 `set in-review`。开存量问题的 issue 走 skill `issues` 的「开一个 issue」。
- pr、pr-review：一轮 review 看这个 issue 的全部 PR，汇报按仓库分节；deliver 不再翻 spec 状态；merge 逐个合并，最后一个合并后 `set done`。
- 设计相关 skill（uiux-imagine、uiux-refine、uiux-research）里提到旧状态的句子换掉。
- `review-loop.mjs`、`proposal-table-check.mjs` 里的旧状态名换掉。

## 验收标准
- [x] to-spec 的模板与步骤不再出现 spec 的 `status` 和 `spec-status` 命令
- [x] implement 写明开工即开 draft PR、多仓库各一个、ready 时翻 in-review
- [x] pr-review 的 merge 写明全部 PR 合并后 `set done`，deliver 不翻 spec 状态
- [x] 本刀碰的 skill 与脚本里没有旧中文状态名、`spec-status`
- [x] 相关文档测试全绿

## 选中的存量回归
- `to-spec-by-deliverable-doc.test.mjs`、`pr-by-deliverable-doc.test.mjs`、`pr-review-cross-skill-refs-doc.test.mjs`、`pr-review-slim-doc.test.mjs`：钉着 to-spec / pr / pr-review 的写法。
- `review-loop.test.mjs`、`proposal-table-check.test.mjs`：脚本改了状态名。
- `knowledge-base-landing-doc.test.mjs`：钉着「spec、设计跟代码一个 PR」，不能被改坏。
- [x] review 第 1 轮 S2（2026-11-05）：spec 提交后先给每个要改的仓库开 draft PR，再切工单；要改哪些仓库从 spec 的「实现决策」读，不等工单。issue-session 的 todo 会话段落顺序一起改成「spec 提交 → 开 draft PR → 切工单 → 实现」
- [ ] review 第 2 轮 C1（2026-11-05）：实现流程里开 draft PR 那一步只指向 idea-loop:pr 的「开 draft PR」，不复述命令、正文写法、Linear 前缀和一仓库一个（规则：writing-for-agents「每个意思只放在一个单一事实来源里」）；钉着复述内容的文档测试跟着改
