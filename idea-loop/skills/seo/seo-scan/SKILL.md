---
name: seo-scan
description: 跑一次 SEO 扫描：并行查站点各方向，把发现提成 GitHub issue。每周的定时任务触发，人也可以手动跑。
disable-model-invocation: true
argument-hint: "[<方向>...]（不给：按节奏挑；给了只跑这几个：technical pages keywords backlinks geo）"
allowed-tools: Read, Write, Agent, Bash(git rev-parse:*), Bash(git check-ignore:*), Bash(mkdir:*), Bash(date:*), Bash(wc:*), Bash(node *seo-md.mjs:*), Bash(node *seo-due.mjs:*), Bash(node *seo-budget.mjs:*), Bash(node *seo-context.mjs:*), Bash(node *seo-issues.mjs:*), Bash(node -e:*), mcp__plugin_idea-loop_openseo__whoami, mcp__plugin_idea-loop_openseo__get_project_context, mcp__plugin_idea-loop_openseo__update_project_context
---

一次扫描：挑出这次要跑的方向，每个方向起一个 agent 并行查，把它们交回的发现交给提 issue 脚本，最后在 OpenSEO 的研究日志里记一笔。产出只有 GitHub 上的 issue 和评论，加一条研究日志；仓库里什么都不提交。

这次运行可能没有人在场（定时任务触发）：任何一步缺数据，照下文写的记下来、接着往下走，跑到「交回」为止。只有开场的两种情形停下。

下文 `S` 指 `${CLAUDE_PLUGIN_ROOT}/scripts`。脚本都输出 JSON 到 stdout，出错退出码 1、原因在 stderr。

## 开场

1. 仓库根 = `git rev-parse --show-toplevel`。`<仓库根>/SEO.md` 不存在：停下，交回「这个仓库没有 SEO.md，先由人跑 `/idea-loop:seo-setup`」。
2. `node S/seo-md.mjs <仓库根>/SEO.md`，记下 `openseo.projectId`。报错或项目 id 为空：停下，交回脚本的原因和同一句「跑 `/idea-loop:seo-setup`」。
3. **运行目录**：`<仓库根>/.tmp/seo-scan/<YYYYMMDD-HHMM>/`（`date +%Y%m%d-%H%M`），`mkdir -p` 建好。照 `idea-loop:wiki-conventions` 的「本地忽略」确认 `.tmp/` 被忽略。
4. **项目上下文**：调 `get_project_context`（`projectId`），原始返回原样写到 `<运行目录>/context.json`。失败：原因记下，下面挑方向和同步都当作没有上下文。

完成条件：拿到项目 id、一个运行目录、`context.json` 或它的失败原因。

## 方向

- `$ARGUMENTS` 不为空：就跑这几个，按给的顺序。不在 `technical pages keywords backlinks geo` 里的词，记成「不认识的方向」进研究日志，不跑。
- 为空（定时任务就是这样调的）：`node S/seo-due.mjs <运行目录>/context.json <YYYY-MM-DD>`，跑 `due` 里的方向。节奏由脚本定：technical、pages 每次都跑，keywords、backlinks、geo 四周一次；它读研究日志里以前各次扫描「采集」那一行，所以下文研究日志的前两行格式不能改。没有 `context.json`：跑全部五个。

完成条件：一个方向列表（可以为空：为空就跳过预算、派 agent、提 issue，直接写研究日志）。

## 预算

1. 调 `whoami`，读 `creditsRemaining`，记作「开始余额」。调用失败或返回 `null`：余额参数传 `null`，原因记下（脚本按读不到余额处理：付费调用全部不放行，免费的照跑）。
2. `node S/seo-budget.mjs <仓库根>/SEO.md <余额> <方向>...`，输出存到 `<运行目录>/budget.json`。

`allow` 里的每个方向都派，额度是它这次能花的 credits；额度为 0 的只做免费调用。`skipped` 里的每条原因原样进研究日志。

完成条件：每个要跑的方向要么在 `allow` 里有一个数，要么在 `skipped` 里有一条原因。

## 竞品与重点页面同步

1. `node S/seo-context.mjs <仓库根>/SEO.md <运行目录>/context.json`（没有 `context.json` 就跳过这一节，记「同步失败：读不到项目上下文」）。
2. `updates` 非空：调 `update_project_context`，`updates` 参数就用脚本给的数组，原样，不增删。为空就不写。

名单以 SEO.md 为准、只往 OpenSEO 写，所以 OpenSEO 里多出来的竞品被删是预期结果。任一步失败：把原因记下，跳过同步，继续派 agent（agent 读的是 SEO.md，不受影响）。

完成条件：脚本的 `summary` 或失败原因已记下，供研究日志用。

## 派方向 agent

| 方向 | agent |
|---|---|
| `technical` | `idea-loop:technical-auditor` |
| `pages` | `idea-loop:page-optimizer` |
| `keywords` | `idea-loop:keyword-miner` |
| `backlinks` | `idea-loop:backlink-analyst` |
| `geo` | `idea-loop:geo-analyst` |

在**同一条消息里**用 Agent 工具把 `allow` 里的方向全部起好，让它们并行。每个的提示照这个模板填，不加别的（你的猜测、上次的结论都不给）：

```
SEO.md：<仓库根>/SEO.md
OpenSEO 项目：<projectId>
本次额度：<allow 里这个方向的数> credits
运行目录：<运行目录绝对路径>
今天：<YYYY-MM-DD>
```

每个 agent 交回一行（格式见 [references/findings.md](references/findings.md) 的「交回」）。逐个核对 `<运行目录>/<方向>.json`：文件不存在、不是 JSON 数组、或 agent 报错退出，你自己把它写成未采集：`[{"direction":"<方向>","uncollected":"<agent 的报错或「没有交回发现文件」>"}]`。

完成条件：每个派出去的方向在运行目录里都有一个合法的 `<方向>.json`。

## 提 issue

1. 合并：把各方向文件里的发现拼成一个数组，去掉 `uncollected` 对象：

   ```
   node -e 'const fs=require("fs"),[d,...ds]=process.argv.slice(1);fs.writeFileSync(d+"/findings.json",JSON.stringify(ds.flatMap(x=>JSON.parse(fs.readFileSync(d+"/"+x+".json","utf8"))).filter(f=>!f.uncollected),null,2))' <运行目录> <派出去的方向>...
   ```

2. `node S/seo-issues.mjs <仓库根>/docs <运行目录>/findings.json`，输出存到 `<运行目录>/issues.json`。拒收、合并、去重、打 `type:seo/<方向>` 都由脚本做，你不手动建 issue、不改它的计划。
3. 脚本失败（例如 `gh` 没登录）：原因记下，进研究日志；不重试、不改用手动建。

完成条件：`issues.json` 存在，或失败原因已记下。

## 研究日志

1. 再调一次 `whoami`，开始余额减去这次余额就是本次花费；任一次读不到写「未知」。
2. 照下面的模板把摘要写到 `<运行目录>/log.txt`，`wc -m` 不超过 1000 字符（`appendResearchLog` 的上限）。超了先把 issue 标题删成只留编号，再把拒收原因合成一句。

   ```
   seo-scan <YYYY-MM-DD HH:MM>，方向：<方向...>
   采集：<方向> <N> 条；<方向> 未采集（<原因>）；…
   花费：<n | 未知> credits，余额 <n | 未知>；预算跳过：<方向（原因）| 无>
   同步：<seo-context 的 summary | 无改动 | 失败：原因>
   新建：#<号> <标题>；…（无则写「无」）
   评论：#<号> <标题>；…
   拒收：<标题>（<原因>）；…
   <untyped 为 true 时加一行：项目没有 seo 分类，跑一次 seo-setup>
   <提 issue 失败时加一行：提 issue 失败：原因>
   ```

3. 调 `update_project_context`，`updates: [{ "appendResearchLog": { "summary": "<log.txt 的内容>" } }]`。失败就把 log.txt 的路径写进交回。

完成条件：研究日志写入成功，或交回里写明了没写成的原因和 log.txt 路径。

## 交回

最后一条消息照这个模板，不加别的：

```
seo-scan <YYYY-MM-DD HH:MM> 跑完：<方向...>
- <方向>：<N> 条发现 | 未采集（<原因>） | 预算跳过（<原因>）
- issue：新建 <n>，评论 <n>，拒收 <n><；项目没有 seo 分类，跑一次 /idea-loop:seo-setup>
- 花费：<n | 未知> credits
- 研究日志：已写入 | 没写成（<原因>），摘要在 <log.txt 路径>
- 运行目录：<路径>
```

不发布 Artifact、不写周报或「洞察」：issue 就是交付物。
