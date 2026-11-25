# 效果报告怎么落地

`seo-scan` 的「效果报告」一节指到这里。`idea-loop:results-analyst` 把报告写在运行目录里：`<运行目录>/results/<今天>.md`，它引用的图在 `<运行目录>/results/assets/`（报告里写的是相对路径 `assets/<文件名>`）。这里把它们落成知识库里的台账 `<项目目录>/docs/records/seo-results/`：没有代码可跟，照 `idea-loop:wiki-conventions` 的「知识库落地」直接 `commit` 到 home，不开分支、不开 PR。

下文 `<日期>` 指今天（`YYYY-MM-DD`）。没有人在场，不提问；任何一步失败，记下原因，剩下的步骤不做。

1. **放文件**：`mkdir -p <项目目录>/docs/records/seo-results/assets`，把报告 `cp` 成 `<项目目录>/docs/records/seo-results/<日期>.md`，把 `results/assets/` 下的图 `cp` 到那个 `assets/`。报告的 frontmatter 已经是 `type: record`；`docs/` 下每个文件名全局唯一，图的文件名带日期，报告的文件名就是日期，不会撞。同一天跑过：覆盖同名文件。
2. **只提交这几个文件**：`dyna home commit "docs(seo-results): <日期> 效果报告" <报告> <每张图>`，只列这次放进去的文件。
3. **推送**：用『推送』（做法照 `dyna runtime show 推送`）发一句：「SEO 效果报告 <日期> 出了：<报告在项目目录里的路径>」，后面接报告「本周要做什么」的第一条；`commit` 输出里有「home 没推上去」的，再加一句这个。

交回里「效果报告」一行：提交了写报告路径，没落成写失败的是哪一步和原因；home 没推上去的带上这一句。
