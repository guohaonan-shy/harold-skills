# seo 分类

SEO 的发现、入队和解决：方向 agent 从 OpenSEO 取数据找问题，`seo-scan` 把问题提成 issue（`type:seo/<方向>`）并当场分流：每个新 issue 起一个 `issue-triager`，只有要 UI 设计的进 triage，判不了的进 todo，重复、「不做」、已实现、复现不出的 canceled；之后照 idea-loop 的 issue 会话走 triage、实现。项目配置只有根目录的一份 `SEO.md`（格式：[seo-setup/references/seo-md.md](seo-setup/references/seo-md.md)）。设计见 spec `idea-loop-seo`。

| 层 | skill / agent |
|---|---|
| 接入 | `seo-setup`（人跑，写 SEO.md（含「内容路径」）、同步 OpenSEO、建 issue 分类、批 AI 可见性跟踪、建每天扫描的定时任务） |
| 发现 | `seo-audit`、`keyword-research`、`keyword-clustering`、`competitor-analysis`、`link-prospecting`、`seo-geo`；agent `technical-auditor`、`page-optimizer`、`keyword-miner`、`backlink-analyst`、`geo-analyst`、`results-analyst`（效果报告：回看改动前后的点击和排名，出两张图和三块报告） |
| 入队 | `seo-scan`（每天定时，不带参数时按节奏挑方向：效果报告 `results` 每 3 天，其余五个方向每 7 天，当天没有到期的只写一行研究日志；提完 issue 后分流，结尾调用外联跟进，再把效果报告落成 `docs/records/seo-results/<日期>.md`，开只改 `docs/` 的 PR、检查过了合并并推送链接）+ `scripts/seo-{due,gaps,budget,context,baseline,meta-provenance,issues}.mjs`（OpenSEO 的套餐额度按周花完：`seo-budget.mjs` 读研究日志的「花费」行算本周预算，按 `SEO.md` 的每周分配拆给排名追踪、扫描、起草与验证三份；开场先查这次方向要用的项目信息齐不齐，缺了推测、停下等人确认，写进 `SEO.md` 或项目上下文再跑）；issue 与别的 issue 在调度里同一个队列 |
| 解决 | `seo-brief`（triage 阶段写方案）、`seo-writing`、`seo-outreach`（实现阶段起草，草稿进人的草稿箱；人说「发外联邮件」才发；每次扫描结尾读回信、追发；目录提交填到最后一步等人点）、`seo-check`（发布前检查，构建后 hook 自动跑）+ `scripts/seo-content-scope.mjs`（判一个 SEO PR 是不是只改内容：改动文件对 `SEO.md` 的「内容路径」加 `docs/` 和 `SEO.md`；只改内容、检查全过、两轴没有阻塞项的 SEO PR 由 Claude 合并，见 `pr-review/references/seo-auto-merge.md`）；`scripts/seo-live-{check,record}.mjs`（合并后的上线自查，写在 `pr-review/references/merge.md` 的「上线后自查」：每分钟取一次线上页面，等线上换成这次的构建（最久 `SEO.md`「构建与检查」的「上线等待」分钟，没写 30），再逐个网址核能打开、没有 noindex、title 与 description 同产物、在 sitemap 里；全过就在 issue 上贴带隐藏标记的评论并把目标词加进排名追踪，有一项不过就回滚合并并另开 todo issue，等满没上线只推送不回滚） |
| 陪练 | `seo-coach` |

## 出处

外部内容按「蒸馏副本」管理：需要的子集复制进来作为这里的真相源，运行时不读上游。上游更新时显式重新蒸馏：逐段对照上游，只保留下面写明的改动。

### OpenSEO

- 来源：[every-app/open-seo](https://github.com/every-app/open-seo) 的 Claude Code 插件 1.0.0，MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-audit`（含报告模板）、`keyword-research`、`keyword-clustering`、`competitor-analysis`（并入了上游的 `competitive-landscape`）、`link-prospecting`、`seo-coach` 照上游同名 skill；`seo-setup` 由上游的 `seo-project-setup` 改写，多了写 SEO.md、建 issue 分类、批 AI 可见性跟踪。没有取 `local-seo`。
- 只改了两处：被方向 agent 调用（无人值守）时不提问、不写入，并交回统一的发现清单（要用的项目信息缺了，不从站点或 `find_serp_competitors` 推断着用，在 `assumptions` 里写明缺什么、哪部分因此没做；写着「无」的项当作没有，不推断、不问）；人在场时照上游原样。项目上下文以 SEO.md 为准，单向同步进 OpenSEO。
- OpenSEO 的远程 MCP 由 idea-loop 的 `.mcp.json` 声明（服务名 `openseo`），装 idea-loop 前先卸掉原 OpenSEO 插件，否则同名 skill 会有两份。

### claude-seo

- 来源：[AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo)，commit `4b99de2`（2026-10-05），MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-geo` 以它的 `seo-geo` skill 和两份 reference（AI 搜索优化指南、llms.txt 证据）为底，数据换成 OpenSEO 的 AI 可见性接口，带日期的统计数字没有搬。`seo-brief` 参考了它的 `seo-content-brief`。
