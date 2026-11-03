# 05 — 一个需求跨几个仓库：每个仓库一个 PR，全部合并才往下翻

**Blocked by**：01 — knowledge-base.mjs；03 — 所有 skill 与 agent 去知识库找 docs 和设置
**设计冻结**：不涉及 UI

## 要建什么

业务里有两个以上代码仓库时，一份 spec 的实现按仓库分 PR。spec：`docs/spec/knowledge-base-repo/knowledge-base-repo.md` 的「多仓库需求」「每份 spec 什么时候算全部合并」。只有一个代码仓库的业务行为不变。

- **to-ticket**：业务有两个以上代码仓库（`knowledge-base.mjs business` 的 `repos`）时，工单模板多一行「**仓库**：<仓库名>」；只有一个时不写。「被谁挡着」照旧，跨仓库也只看它。
- **implement**：每个仓库一条集成分支，名字都等于会话分支：会话所在仓库就是会话 worktree，别的仓库用 `knowledge-base.mjs worktree <仓库名>` 开在 `.tmp/repos/<仓库名>/`。派工时给执行方它那张工单所在仓库的集成 worktree 与起点 SHA。落地、回收、账本（`ticket-ledger.mjs landed`）按仓库各算。工单勾格、`docs(tickets)` 提交、设计变更在知识库 worktree（`root --write`）里提交。「没活了就停下」：每个有落地提交的仓库各推送、各开一个 draft PR，知识库有改动也推送开一个；每个 PR 描述的 `reference` 区列出这份 spec 的全部 PR。
- **implementer**：工单写了「仓库」且不是派它时的 worktree 所在仓库时，它从给它的那个仓库集成 worktree 开自己的 worktree；工单文件在知识库里，勾格写回知识库那份文件，不进代码提交（交回时说明勾了哪些格），编排者落地时在知识库里提交。核对一节里「`git show <commit>:<工单>`」随之改成读知识库里那张工单。
- **pr-review**：一份 spec 有几个 PR 时，每个 PR 各跑 review；「合并」时合完这一个，用 `gh pr view` 逐个查 `reference` 里列的其余 PR，全都合并了才跑 `issues advance`，否则在汇报里写「还剩哪几个没合」、不翻 issue。删工单与设计归档在最后合并的那一个之前、在知识库 PR 里做。
- **issue-session**：「实现」一段收尾的条件同上（全部 PR 合并才进下一段）。

## 验收标准
- [x] 文档测试：to-ticket 的工单模板有「仓库」一行，且写明只有一个代码仓库时不写
- [x] 文档测试：implement 写了 `knowledge-base.mjs worktree`、每个仓库一个 PR、知识库一个 PR、`reference` 列全部 PR
- [x] 文档测试：pr-review 的合并写了「全部合并才 `issues advance`」与「还剩哪几个没合」
- [x] 文档测试：implementer 写了勾格写回知识库的工单、不进代码提交
- [x] 现有 `issue-session-implement-doc.test.mjs`、`pr-by-deliverable-doc.test.mjs`、`implement-reuse-blocked-doc.test.mjs`、`implementer-standards-doc.test.mjs` 改成守新说法后全绿
- [x] 插件全量 `node --test idea-loop/scripts/` 全绿
- [ ] review 第 1 轮 S1（2026-11-03）：to-ticket 给工单定「仓库」时按知识库 `AGENTS.md` 的「## 仓库」一节判（一刀横跨几个仓库的照旧按仓库拆）；没有这一节而业务有几个仓库时，停下让人跑 setup 补。文档测试守住

## 选中的存量回归
- `issue-session-implement-doc.test.mjs`、`pr-by-deliverable-doc.test.mjs`、`implement-reuse-blocked-doc.test.mjs`、`implementer-standards-doc.test.mjs`、`ticket-ledger.test.mjs`：守 implement / implementer / pr-review 现有规则
