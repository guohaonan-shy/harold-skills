# seo 分类

SEO 的发现、入队和解决：方向 agent 从 OpenSEO 取数据找问题，`seo-scan` 把问题提成待验证的 issue（`type:seo/<方向>`），之后照 idea-loop 的 issue 会话走审核、实现。项目配置只有根目录的一份 `SEO.md`（格式：[seo-setup/references/seo-md.md](seo-setup/references/seo-md.md)）。设计见 spec `idea-loop-seo`。

| 层 | skill / agent |
|---|---|
| 接入 | `seo-setup`（人跑，写 SEO.md、同步 OpenSEO、建 issue 分类与独立队列、批 AI 可见性跟踪、建每周扫描的定时任务） |
| 发现 | `seo-audit`、`keyword-research`、`keyword-clustering`、`competitor-analysis`、`link-prospecting`、`seo-geo`；agent `technical-auditor`、`page-optimizer`、`keyword-miner`、`backlink-analyst`、`geo-analyst` |
| 入队 | `seo-scan`（每周定时，不带参数时按节奏挑方向）+ `scripts/seo-{due,budget,context,baseline,issues}.mjs`；issue 进调度的 `seo` 独立队列（上限 5） |
| 解决 | `seo-brief`（审核阶段写方案）、`seo-writing`、`seo-outreach`（实现阶段）、`seo-check`（发布前检查，构建后 hook 自动跑） |
| 陪练 | `seo-coach` |

## 出处

外部内容按「蒸馏副本」管理：需要的子集复制进来作为这里的真相源，运行时不读上游。上游更新时显式重新蒸馏：逐段对照上游，只保留下面写明的改动。

### OpenSEO

- 来源：[every-app/open-seo](https://github.com/every-app/open-seo) 的 Claude Code 插件 1.0.0，MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-audit`（含报告模板）、`keyword-research`、`keyword-clustering`、`competitor-analysis`（并入了上游的 `competitive-landscape`）、`link-prospecting`、`seo-coach` 照上游同名 skill；`seo-setup` 由上游的 `seo-project-setup` 改写，多了写 SEO.md、建 issue 分类、批 AI 可见性跟踪。没有取 `local-seo`。
- 只改了两处：被方向 agent 调用（无人值守）时不提问、不写入，并交回统一的发现清单；人在场时照上游原样。项目上下文以 SEO.md 为准，单向同步进 OpenSEO。
- OpenSEO 的远程 MCP 由 idea-loop 的 `.mcp.json` 声明（服务名 `openseo`），装 idea-loop 前先卸掉原 OpenSEO 插件，否则同名 skill 会有两份。

### claude-seo

- 来源：[AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo)，commit `4b99de2`（2026-10-05），MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-geo` 以它的 `seo-geo` skill 和两份 reference（AI 搜索优化指南、llms.txt 证据）为底，数据换成 OpenSEO 的 AI 可见性接口，带日期的统计数字没有搬。`seo-brief` 参考了它的 `seo-content-brief`。
