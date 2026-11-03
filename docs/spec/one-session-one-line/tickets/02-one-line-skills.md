# 02 — skill 走一条线：定稿提交、不再单独开 spec / 设计 PR、四段阶段名

**Blocked by**：01 — issues.mjs 换成四段阶段
**设计冻结**：不涉及 UI

## 要建什么
跟着 issue 会话走一遍时，看到的是 spec「方案」里的那张时序图：开场认领进讨论中；issue-verify / to-spec 定稿时单独提交 `docs(spec): <slug> 定稿`、推送、开知识库 draft PR，不合并；uiux-refine 冻结只提交推送，不开设计 PR；换阶段不再拉主分支切新分支，只 `issues advance`；implement 全部落地后不转 ready、直接起 review 第一轮；pr-review 在 draft 上跑，交审核报告时把这条线的 PR 都转 ready、翻审核中；合并后 advance 关 issue。所有 skill、agent、README 里的阶段名都是讨论中、设计中、实现中、审核中，不再出现验证中、待设计、待实现，也不再有 spec / 设计经 PR 合进主分支的步骤。

## 验收标准
- [x] issue-session 的阶段表四行（讨论 / 设计 / 实现 / 审核），开场认领讨论中，换阶段不切分支；人直接调、会话分支上已有正式 spec 列着它时跳过 issue-verify
- [x] issue-verify 与 to-spec 的收尾是定稿提交加知识库 draft PR，不 merge；`land-on-main.md` 换成定稿的说明
- [x] uiux-refine 冻结只提交推送，不开、不合设计 PR
- [x] implement 全部落地后不 `gh pr ready`；知识库已有这条线的 draft PR 就复用
- [x] pr-review 的前提允许 draft；交审核报告时每个 PR `gh pr ready` 再 `issues set 审核中`
- [x] spec-status skill 的 issue 状态表与命令清单跟 01 一致（没有 `queue`，有 `migrate`）
- [x] issue-dispatch、README、dreaming、retro、wiki-conventions、seo、setup 的 issue-tracker / 整合 prompt 只换名字，不改出卡片逻辑
- [x] 文档测试：`idea-loop/skills`、`agents`、`README.md` 不出现验证中、待设计、待实现；issue-verify、to-spec、uiux-refine 里没有 `gh pr merge`；全量测试通过

## 选中的存量回归
- `to-spec-by-deliverable-doc.test.mjs`、`pr-review-cross-skill-refs-doc.test.mjs`、`issue-group-skills.test.mjs`、`issue-session-implement-doc.test.mjs`、`knowledge-base-doc.test.mjs`：断言了这些 skill 里的句子
