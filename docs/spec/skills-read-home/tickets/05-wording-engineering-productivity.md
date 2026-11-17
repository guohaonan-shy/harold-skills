# 05 — engineering 与 productivity 的 skill 写成「项目目录」，子代理从调用方拿项目目录

**Blocked by**：04 — 知识库的改动直接提交 home（两张改同一批 skill 文件）
**设计冻结**：不涉及 UI

## 要建什么

skill 和 agent 的文字把位置写死在代码仓库里：`<docs>` 定义为「当前 worktree 的 `docs/`」，引导文件写成「仓库根目录的 `DEVELOPMENT.md`」之类。改成只有一种写法：

- **项目目录**：主会话开在代码 worktree 里，从 SessionStart 注入的「项目目录：<路径>」一行拿；开在 home 里，用 `where --project <名字>` 拿；拿不到（`where` 报没搬或没接上）就照那句话停下，不去读代码仓库。
- `<docs>` 是 `<项目目录>/docs/`；`DEVELOPMENT.md` `REVIEW.md` `CODING_STANDARDS.md` `PRODUCT.md` `ISSUE_TRACKER.md` `GLOSSARY.md` `DESIGN.md` `SEO.md` 在 `<项目目录>` 下。
- 代码（读源码、跑测试、起服务、开分支和 PR）仍在代码 worktree 里。
- 起子代理时，调用方在 prompt 里给出项目目录。
- 「issue 分类」改住在 `ISSUE_TRACKER.md` 的「分类 label」一节（不再在代码仓库的 `AGENTS.md`）；`ISSUE_TRACKER.md` 不再有「仓库」一节，一个 issue 只改一个仓库：implement、issue-session、pr 里「多个仓库各开 PR / 各开 worktree」的分支删掉。

这张工单改 `skills/engineering/` 和 `skills/productivity/` 下所有 skill 与参考（setup 的模板文件除外，归 08；dreaming 的项目对账一节归 07，本张只改 dreaming 里的位置写法）。项目目录这个词第一次出现的地方（wiki-conventions）写清它是什么、怎么拿到，别处指过去。

新加一个文档测试：在 skill、agent 的文字里 grep，下面几种都不能再出现——「当前 worktree 的 `docs/`」、「仓库根（目录）的 <引导文件>」、「`git add -f`」。本张让测试覆盖 `skills/engineering/` 和 `skills/productivity/`；06 把覆盖扩到全部。写法照仓库现有的「插件里不出现项目信息」那个测试。

## 验收标准

- [ ] engineering 和 productivity 下不再出现「当前 worktree 的 `docs/`」「仓库根（目录）的 <引导文件>」（新文档测试守）
- [ ] wiki-conventions 写明项目目录是什么、主会话 / home 里的会话 / 子代理各从哪拿、拿不到就停
- [ ] 起子代理的地方（implement、pr-review、issue-triage、dreaming、retro 等）给子代理的 prompt 里带项目目录
- [ ] 多仓库分支已删，issue 分类的位置改成 `ISSUE_TRACKER.md`「分类 label」
- [ ] 改了的每个 SKILL.md 主体 < 5000 字，并调过 `idea-loop:writing-for-agents`
- [ ] 现有文档测试全绿（钉着被改原话的，按新写法改测试，意图不变）

## 选中的存量回归

- 插件不出现项目信息的测试：改文字时容易带进真实项目名。
- issue-session、implement、pr、issues、linear 文档、dreaming 各组文档测试：都钉着这些 skill 的原话。
