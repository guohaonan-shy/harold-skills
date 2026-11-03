# 04 — 想法入口：「新想法，开聊」

**Blocked by**：03 — 开 issue 时挂模块根、判 P0
**设计冻结**：不涉及 UI

## 要建什么

人在一个带 worktree 的新会话里说「新想法，开聊：<一句想法>」，issue 会话就被叫起：照「开一个待验证的 issue」开一个 issue，打 `Idea` label，标题写想法本身，正文照录人的原话，挂根、判 P0 照做；接着把自己当成这个 issue 的会话，照「人直接调的你」从审核开始（认领成验证中、归位、改标题）。不在 worktree 里：issue 先开好、号码交给人，停下让人开带 worktree 的会话再接。

验证遇到带 `Idea` 的 issue 不复现，结论写「存在：这是一个想法，不复现」，直接跟人 grill、照常起草 spec。

## 验收标准

- [ ] issue 会话的 description 带「新想法，开聊」触发词，正文有这条入口的步骤
- [ ] issue-verify 写明带 `Idea` 的不复现及结论写法
- [ ] 全量测试通过

## 选中的存量回归

- `issue-group-skills.test.mjs`、`issue-session-implement-doc.test.mjs`：守着 issue 会话的文字
