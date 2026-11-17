# 效果报告怎么落地

`seo-scan` 的「效果报告」一节指到这里。`idea-loop:results-analyst` 把报告写在运行目录里：`<运行目录>/results/<今天>.md`，它引用的图在 `<运行目录>/results/assets/`（报告里写的是相对路径 `assets/<文件名>`）。这里把它们落成知识库里的台账 `docs/records/seo-results/`：只改 `docs/` 的 PR，没有代码可跟，所以照 `idea-loop:wiki-conventions` 的「知识库落地」自己开，检查全过就合并。

下文 `<日期>` 指今天（`YYYY-MM-DD`），`<主分支>` 取 `DEVELOPMENT.md` 的「分支」节，没有它就用 `git rev-parse --abbrev-ref origin/HEAD` 的结果。没有人在场，不提问；任何一步失败，记下原因，剩下的步骤不做，但第 7 步的清理照做。

1. **备环境**：`git fetch origin`，在 `.tmp/` 下开一个从主分支出的临时 worktree：`git worktree add <仓库根>/.tmp/seo-results-<日期> -b docs/seo-results-<日期> origin/<主分支>`。`.tmp/` 在开场已确认被忽略。这个分支或目录已经在（同一天跑过）：先 `git worktree remove --force` 再 `git branch -D` 清掉，重来。
2. **放文件**：在那个 worktree 里 `mkdir -p docs/records/seo-results/assets`，把报告 `cp` 成 `docs/records/seo-results/<日期>.md`，把 `results/assets/` 下的图 `cp` 到 `docs/records/seo-results/assets/`。报告的 frontmatter 已经是 `type: record`；`docs/` 下每个文件名全局唯一，图的文件名带日期，报告的文件名就是日期，不会撞。
3. **只提交 `docs/`**：`git add docs/records/seo-results`，`git commit -m "docs(seo-results): <日期> 效果报告"`（末尾带环境给的署名行）。`git status --short` 里有 `docs/records/seo-results` 以外的东西，说明备环境出了错：不提交，按失败处理。
4. **开 PR**：`git push -u origin docs/seo-results-<日期>`，`gh pr create --base <主分支> --title "SEO 效果报告 <日期>" --body "<数据截止日、整站近 7 天点击比上一个 7 天变了多少（带分子分母）、几条要做的事；只写大白话，不写文件路径和命令>"`。
5. **等检查、合并**：`gh pr checks <号> --watch`，全过（仓库没有配检查，也算过）就按 `DEVELOPMENT.md` 的「合并方式」`gh pr merge <号>`（`merge` 加 `--merge`，`squash` 加 `--squash`，`rebase` 加 `--rebase`，都带 `--delete-branch`）。检查没过：不合并，PR 留着。
6. **推送**：用『推送』（做法照 `idea-loop:runtime`）发一句：「SEO 效果报告 <日期> 出了：<PR 链接>」，后面接报告「本周要做什么」的第一条；检查没过、没合并的，写「检查没过，PR 没合并」。
7. **清理**：`git worktree remove --force <仓库根>/.tmp/seo-results-<日期>`，再 `git branch -D docs/seo-results-<日期>`（远端分支已随合并删掉）。

交回里「效果报告」一行：合并了写 PR 链接，没合并写链接和「检查没过」，没落成写失败的是哪一步和原因。
