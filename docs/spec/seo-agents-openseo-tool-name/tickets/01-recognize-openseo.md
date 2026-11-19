# 01 — SEO 扫描和 SEO 设置开场认出被顶替的 OpenSEO，停下说清删哪份

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件自带一个远程 MCP 服务 OpenSEO，在会话里加载时工具名是插件名下的那一套（`mcp__plugin_idea-loop_openseo__<工具>`）。如果项目、本地或用户级配置里也配了同一个 OpenSEO（同一个地址），Claude Code 只连优先级高的那份，插件那份被顶替，工具名变成 `mcp__<那份配置起的名字>__<工具>`。SEO 扫描派出的方向 agent 白名单只认插件名下的工具，所以被顶替时一个 OpenSEO 工具都拿不到，整次扫描空跑。

人已定：只认插件自带的那份，方向 agent 的白名单不动。要做的是两处开场判断：

1. **SEO 扫描（seo-scan skill）开场**多一步「认 OpenSEO」，放在读项目上下文之前：
   - 会话里有插件名下的 `whoami`：照常往下走（跟现在一样，不多一次付费调用）。
   - 没有，但有别的名字下的 OpenSEO 工具（同一个前缀下同时有 `__whoami` 和 `__get_project_context`）：停下，不派任何方向 agent、不花 credits；交回一种新形状，写明「`<名字>` 顶替了 idea-loop 插件自带的 OpenSEO」，并写两种删法——用户级或本地配置 `claude mcp remove <名字>`，项目配置删项目根 `.mcp.json` 里那一项——然后重开会话。skill 不判断是哪一种，两种都写。定时任务触发时没人在场，照这个 skill 现有做法用『推送』提醒。
   - 一个 OpenSEO 工具都没有：停下，交回「OpenSEO 没连上，在 `/mcp` 里连上 idea-loop 插件的 openseo」。
   - 这个 skill 正文里写「只有三种情形停下」的那句要跟着改：现在多了这两种开场停下。
2. **SEO 设置（seo-setup skill）第 1 步**在调 `whoami` 前做同一个判断。被顶替的情况，用同样的话告诉人是哪个名字的配置顶替了插件那份、两种删法、删完重开会话再跑；人删完之前，后面要 OpenSEO 的步骤照现有「连不上」的做法（只做仓库里的事、记「未做」）。现有「调不通就告诉人去 `/mcp` 连上」那句保留。
3. **插件 README** 的 `/idea-loop:seo-setup`、`/idea-loop:seo-scan` 两行各补一句：OpenSEO 只认插件自带的那份，别处配了同一服务时开场停下、说明删哪份。
4. **文档测试**：仿照插件脚本目录里已有的 seo 文档测试（读 seo 的 SKILL.md 和 agent 定义、按小节断言），新加一份测试钉住：seo-scan 的开场有认 OpenSEO 的一步、交回有被顶替时停下的形状且两种删法都在；seo-setup 第 1 步有被顶替的那一种；六个方向 agent（technical-auditor、page-optimizer、keyword-miner、backlink-analyst、geo-analyst、results-analyst）白名单里的 OpenSEO 仍只有插件名那一种。先对改动前的文字跑一次见红。
5. **假插件探针**（不进测试套件，实现完跑一次，结果写进交回）：spec 的复现材料在 spec 目录下的 `.tmp/to-spec/seo-agents-openseo-tool-name/repro/`（在主 checkout 或本 worktree 下找；找不到就照 spec「问题陈述」的写法重建：假插件 `p` 自带本地 MCP 服务 `echo`、一个工具 `ping`）。给假插件加一个仿新开场判断的 skill（把 `whoami` 换成 `ping`），用 `claude -p` 跑三次：项目没有 `.mcp.json`；项目 `.mcp.json` 用名字 `myecho` 配同一条命令；项目改用名字 `openseo`。期望分别是：认出插件名往下走；停下且交回里有 `myecho` 和两种删法；停下且交回里是 `openseo`。

两份 SKILL.md 正文目前都贴着 5000 字上限（seo-scan 约 4994、seo-setup 约 4923）：新加的内容要么写得极短，要么把只有部分运行才走到的分支（例如被顶替 / 没连上时的交回原文）挪进各自的参考文件，正文留一句指针。

版本：插件 `plugin.json` 的 `version` 按 patch 升一档（修 bug，没被顶替的项目照旧能用）。

## 验收标准
- [x] seo-scan 开场有「认 OpenSEO」一步，三种情况（插件名在 / 别的名字顶替 / 都没有）各自的去向写清；被顶替时不派 agent、不花 credits。
- [x] seo-scan 的交回多一种「被顶替停下」的形状，写出顶替它的名字和两种删法（`claude mcp remove <名字>`、删项目 `.mcp.json` 里那一项），以及重开会话。
- [x] seo-scan 正文里「只有几种情形停下」那句与新增的停下情形一致。
- [x] seo-setup 第 1 步在 `whoami` 前有同一个判断，被顶替时告诉人名字、两种删法和重开会话；原「连不上」的后续做法不变。
- [x] 六个方向 agent 的 `tools:` 行没有改动。
- [x] 插件 README 的 seo-setup、seo-scan 两行各补了一句。
- [x] 新的文档测试在改动前的文字上失败、改动后通过；插件脚本目录下全部 `*.test.mjs` 通过。
- [x] 假插件探针三次运行的结果写进交回，与期望一致；跑不了的写明原因。
- [x] `plugin.json` 的 `version` 按 patch 升了一档（以合进来时主分支上的版本为基准）。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归
- `seo-params-doc.test.mjs`：断言 seo-scan「缺口关卡」和 seo-setup 的句子，改这两份 SKILL.md 时最容易误伤。
- `seo-brief-angle-doc.test.mjs`：钉着 seo-setup 正文不超 5000 字、标签清单和 AI 可见性步骤在指针后面。
- `seo-scan-routing-doc.test.mjs`：钉着 seo-scan 交回模板里的分流行，改交回一节时有风险。
- `seo-budget-doc.test.mjs`：钉着 seo-scan 读余额（`whoami`）的句子，开场判断也用到 `whoami`。
- `seo-results-report-doc.test.mjs`：钉着 results-analyst 定义和 seo-scan 的 results 方向。
