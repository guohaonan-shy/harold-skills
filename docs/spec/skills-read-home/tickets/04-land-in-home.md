# 04 — 知识库的改动直接提交 home，issue 分支和代码 PR 只装代码

**Blocked by**：01 — 认项目脚本会答「项目目录在哪」和「把这几份文件提交进 home」
**设计冻结**：不涉及 UI

## 要建什么

现在的「知识库落地」规则（`idea-loop:wiki-conventions` 那一节，十几处 skill 引用它或直接写 `git add -f`）：spec、raw、冻结的设计、工单、设计档案归档都提交在需求的工作分支上，跟代码同一个 PR 合进主分支；没有代码 PR 可跟的改动，各开一个只改 `docs/` 的 PR 再自己合。

home 只有 main，改了直接提交，只 add 自己的文件（决定记录 Q12）。把规则和所有照着它做的 skill 改成：

| 产物 | 改成 |
|---|---|
| spec、raw | 写好就用 01 的 `commit` 提交到 home |
| 工单 | 切完提交到 home；代码 PR 合并后，由 pr-review 的合并步骤删掉这份 spec 的 `tickets/` 并提交到 home |
| 冻结的设计（画布、冻结记录、交互图） | 冻结时提交到 home |
| 设计档案归档（`prod/`） | 合并前只写 `delta/`、跑归档校验，review 看的就是 `delta/`；代码 PR 合并成功后才跑归档脚本，结果提交到 home |
| dreaming 的执行段、「不做」记录、retro 决定记录、SEO 的效果报告 | 直接提交到 home，出错 `git revert`；不再开只改 `docs/` 的 PR |

还有：

- **issue 分支只给代码用**：triage 会话不再切分支，起草的 spec 直接提交到 home；`set todo` 的评论写「spec 已提交到 home <提交号>」；todo 会话第一次要写代码时才从主分支切 `issue/<号>-<slug>`；`issues show` 在 triage 阶段返回 `branch: null` 是正常的（issue-session 的开场、triage 会话、todo 会话、先放着几段都跟着改）。
- **PR 描述不再链 spec 文件**：home 是私有的、公司虚拟机上的 home 没有远端。PR 描述的「参考」写 spec 的标题、在 home 里的路径和一句摘要，不放链接（pr skill 的开 draft PR 一步、description 格式）。
- **推送失败不挡**：`commit` 报「home 没推上去」时，在交给人的汇报里写这一句，流程照走。
- 执行方（implementer）的 worktree 从代码分支切出，读不到 home 里的工单，所以 implement 派工时把项目目录给它（跟 05 的子代理约定一致）。
- 「知识库落地」只在 wiki-conventions 写一次，别处指过去。SEO 自动合并那条例外：SEO 的内容改动仍是代码 PR（站点内容在代码仓库）；只有它的效果报告从「只改 `docs/` 的 PR」改成直接提交 home。

守这条规则的文档测试（知识库落地那个）改成新规则：不再出现「跟代码同一个 PR」「`git add -f`」「只改 `docs/` 的 PR」的说法；指向「知识库落地」的那几处仍指向它；wiki-conventions 写明直接提交 home。

## 验收标准

- [x] wiki-conventions 的「知识库落地」写的是上表的新规则，含 `commit` 只提交自己的文件、推送失败不挡
- [x] skill、agent、两份 README 里不再出现 `git add -f`、「跟代码同一个 PR / 同一个分支合进主分支」「开一个只改 `docs/` 的 PR」的写法（文档测试守）
- [x] issue-session：triage 会话不切分支、spec 提交到 home；todo 会话写代码前才切分支；`set todo` 评论写 home 的提交号
- [x] pr-review 合并步骤：代码 PR 合并成功后才跑归档脚本并提交 home、删 `tickets/` 并提交 home
- [x] pr skill：PR 描述的「参考」写 spec 标题、home 里路径、一句摘要，不放 spec 链接
- [x] dreaming、retro、SEO 扫描的效果报告：直接提交 home，不开 docs PR
- [x] 改了的每个 skill 调过 `idea-loop:writing-for-agents` 的写法（字数上限内：`awk 'f>=2; /^---$/{f++}' SKILL.md | LC_ALL=en_US.UTF-8 wc -m` < 5000）
- [x] 知识库落地的文档测试按新规则改写并全绿

## 选中的存量回归

- 知识库落地的文档测试：直接改写它。
- issue-session 实现段、pr 流程、pr-review 合并、dreaming 自主执行、SEO 自动合并相关的文档测试：它们钉着被改的段落里的原话。
