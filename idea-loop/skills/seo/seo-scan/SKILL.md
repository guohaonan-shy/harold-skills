---
name: seo-scan
description: 跑一次 SEO 扫描：并行查站点各方向，把发现提成 GitHub issue，每 3 天出一份效果报告。每天的定时任务触发，人也可以手动跑。
argument-hint: "[<方向>...]（不给：按节奏挑；给了只跑这几个：technical pages keywords backlinks geo results）"
allowed-tools: Read, Write, Edit, Agent, PushNotification, Bash(git rev-parse:*), Bash(git check-ignore:*), Bash(mkdir:*), Bash(date:*), Bash(wc:*), Bash(dyna seo:*), Bash(dyna issues:*), Bash(git fetch:*), Bash(git worktree:*), Bash(dyna home commit:*), Bash(cp:*), Bash(node -e:*), mcp__plugin_idea-loop_openseo__whoami, mcp__plugin_idea-loop_openseo__get_project_context, mcp__plugin_idea-loop_openseo__update_project_context, mcp__plugin_idea-loop_openseo__find_serp_competitors
---

一次扫描：挑方向，每个方向起一个 agent 并行查，发现交给提 issue 命令，最后写研究日志。产出是 issue（当场分流）、评论、研究日志、外联跟进和每 3 天一份的效果报告；外联跟进表、效果报告和关卡里人确认过的 `SEO.md` 改动提交到 home。

可能没有人在场（定时任务触发）：任何一步缺数据，记下来接着往下走，跑到「交回」为止。只有四种情形停下：开场的三种，和「缺口关卡」里要用的项目信息缺了（等人确认）。

`dyna seo` 的命令都输出 JSON 到 stdout，出错退出码 1、原因在 stderr；参数靠 `--help` 查。

## 开场

项目目录照 `idea-loop:wiki-conventions` 的「项目目录」拿；`<docs>` 指 `<项目目录>/docs/`；运行目录是 `<工作根>/.tmp/seo-scan/<YYYYMMDD-HHMM>/`（工作根 = `git rev-parse --show-toplevel`）。四步（认项目、建运行目录、认 OpenSEO、取项目上下文）见 [references/opening.md](references/opening.md)：`<项目目录>/SEO.md` 不存在或读不出 `openseo.projectId` 就停下，交回原因和「先由人跑 `/idea-loop:seo-setup`」；会话里没有 OpenSEO 也停下（第 3 步）。

完成条件：拿到项目 id、一个运行目录、`context.json` 或它的失败原因。

## 方向

- `$ARGUMENTS` 不为空：就跑这几个。不在 `technical pages keywords backlinks geo results` 里的词，记成「不认识的方向」进研究日志，不跑。
- 为空（定时任务每天这样调一次）：`dyna seo due <运行目录>/context.json <YYYY-MM-DD>`，跑 `due` 里的方向。节奏由命令定：`results` 每 3 天，其余五个每 7 天；研究日志的前两行格式不能改（它读以前各次的「采集」行）。没有 `context.json`：跑全部六个。

完成条件：一个方向列表（可以为空：为空就跳过预算、派 agent、提 issue，研究日志只写一行）。

## 缺口关卡

这次方向要用的项目信息缺了，不拿推出来的值直接跑：推测、等人确认、写下来，再往下。

1. 方向列表为空：跳过。
2. `dyna seo gaps <项目目录>/SEO.md <运行目录>/context.json <方向>...`（没有 `context.json` 时第二个参数写 `-`），输出存到 `<运行目录>/gaps.json`。`gaps` 为空：进「预算」。
3. 有缺口，逐项推测，每项带出处：
   - 竞品：`find_serp_competitors`，花 credits。先按「预算」的做法跑一次 `whoami`（记作开始余额）和 `dyna seo allocate`；要竞品的方向没有一个 `allow` 大于 0，就不推，只问人要。调完再调一次 `whoami`，差值是关卡花的。
   - 品牌词：「站点」域名去掉后缀。
   - 业务概述、当前目标、定位：站点首页。
4. 用『推送』提醒（写明缺哪几项；做法照 `dyna runtime show 推送`），在会话里逐项列出缺什么、推测值、出处、哪些方向要它，一次最多三个问题，人一句「照推荐」就算确认，说「不需要」就是这项留空。然后停下，不派任何方向 agent，照 [references/stops.md](references/stops.md) 交回「停下等确认」。
5. 人回复后：
   - `SEO.md` 的项（竞品、品牌词）用 Edit 改 `<项目目录>/SEO.md`，改完 `commit` 到 home（人已确认过值）；人说留空的写 `无`。
   - 项目上下文的项用 `update_project_context` 的 `{ section, content }` 写回；人说不需要的，那一节也写 `无`，下次缺口检查就不再报。
   - 重新调 `get_project_context` 覆盖 `<运行目录>/context.json`（开场那份是旧的）。
   - 重跑第 2 步：`gaps` 为空就从「预算」往下跑，还有缺口回到第 3 步。

完成条件：`gaps` 为空，或已通知人并停下。

## 预算

1. 重新读一次余额：调 `whoami` 读 `creditsRemaining`。「开始余额」是本次扫描第一次读到的（关卡调过就是它那次），「已花」= 开始余额 − 余额。读不到或 `null`：余额传 `null`、记原因（付费全不放行）。
2. `dyna seo allocate <项目目录>/SEO.md <余额> <方向>... --spent <已花> --context <运行目录>/context.json --today <YYYY-MM-DD>`，输出存到 `<运行目录>/budget.json`。额度按周算，读法见 [references/budget.md](references/budget.md)。

`allow` 里的方向都派（额度是它能花的 credits，0 只做免费）。`skipped` 的原因原样进研究日志；本周份额不够的另用『推送』告诉人。

完成条件：每个要跑的方向在 `allow` 里有数，或在 `skipped` 里有原因。

## 竞品与重点页面同步

步骤见 [references/context-sync.md](references/context-sync.md)；失败只记原因，不拦下面派 agent。

## 派方向 agent

| 方向 | agent |
|---|---|
| `technical` | `idea-loop:technical-auditor` |
| `pages` | `idea-loop:page-optimizer` |
| `keywords` | `idea-loop:keyword-miner` |
| `backlinks` | `idea-loop:backlink-analyst` |
| `geo` | `idea-loop:geo-analyst` |
| `results` | `idea-loop:results-analyst` |

在**同一条消息里**用 Agent 工具把 `allow` 里的方向全部起好，并行跑。提示照 [references/findings.md](references/findings.md) 的「提示模板」填，不加别的。

每个 agent 交回一行（格式见 [references/findings.md](references/findings.md) 的「交回」）。逐个核对 `<运行目录>/<方向>.json`：没有合法文件的，你照 findings.md 的「未采集」替它写。

完成条件：每个派出去的方向都有一个合法的 `<方向>.json`。

## 提 issue

1. 合并：把各方向文件里的发现拼成 `<运行目录>/findings.json`、去掉 `uncollected` 对象，命令见 [references/merge-findings.md](references/merge-findings.md)。
2. `dyna seo file-issues <docs> <运行目录>/findings.json`，输出存到 `<运行目录>/issues.json`。拒收、合并、去重、打 `type:seo/<方向>` 都由命令做，不手动建 issue；新开的 issue 先是 backlog，下一节马上分流。
3. 命令失败：原因记下进研究日志，不重试、不手动建。

完成条件：`issues.json` 存在，或失败原因已记下。

## 分流

对 `issues.json` 里 `created` 的每个号（`commented` 的已在某个状态里，不分流）起一个 `idea-loop:issue-triager`，同时最多 5 个，照它交回的 `route` 翻：`canceled` 带结论翻 canceled，`triage` 翻 triage，`todo` 和判不了的 `backlog` 翻 todo，优先级照它的建议。备环境、命令、失败处理见 [references/routing.md](references/routing.md)。

完成条件：`created` 的每个号都翻过或失败原因已记下；`created` 为空就跳过。

## 研究日志

1. 再调一次 `whoami`，开始余额减去这次余额就是本次花费；任一次读不到写「未知」；份写 `扫描`。
2. 照 [references/research-log.md](references/research-log.md) 的模板把摘要写到 `<运行目录>/log.txt`，`wc -m` 不超过 1000 字符。
3. 调 `update_project_context`，`updates: [{ "appendResearchLog": { "summary": "<log.txt 的内容>" } }]`。失败就把 log.txt 的路径写进交回。

完成条件：研究日志写入成功，或交回里写明了没写成的原因和 log.txt 路径。

## 外联跟进

`<项目目录>/docs/records/outreach/` 下有跟进表时，用 Skill 工具调 `idea-loop:seo-outreach`，走它的「跟进」分支，不论这次跑了哪些方向；没有跟进表就跳过。

## 效果报告

跑了 `results` 且 `<运行目录>/results/<今天>.md` 写出来了：照 [references/results-report.md](references/results-report.md) 落成 `<项目目录>/docs/records/seo-results/<日期>.md`，直接 `commit` 到 home，推送报告路径。没跑、没有报告：跳过。失败只记原因。

## 交回

最后一条消息照这个模板，不加别的：

```
seo-scan <YYYY-MM-DD HH:MM> 跑完：<方向...>
- <方向>：<N> 条发现 | 未采集（<原因>） | 预算跳过（<原因>）
- issue：新建 <n>，评论 <n>，拒收 <n><；项目没有 seo 分类，跑一次 /idea-loop:seo-setup>
- 分流：todo <n>，triage <n>，canceled <n>
- 花费：<n | 未知> credits
- 效果报告：<报告路径 | 没跑 | 没落成（原因）>
- 研究日志：已写入 | 没写成（<原因>），摘要在 <log.txt 路径>
- SEO.md：这次改了（<哪几项>）| 没改
- 运行目录：<路径>
```

不发布审阅页：issue 和效果报告就是交付物。
