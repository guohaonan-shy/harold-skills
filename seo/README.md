# seo 插件

给跑 [idea-loop](../idea-loop/README.md) 的项目做 SEO。0.2.0 从 idea-loop 拆出来：不是每个项目都做 SEO，而 Claude Code 只能整个插件开关，留在 idea-loop 里就让每个项目都多 14 个 skill、5 个 agent 和一个 OpenSEO 连接。seo 在 `plugin.json` 的 `dependencies` 里**依赖 idea-loop**，装它会连带装上 idea-loop。

## 安装

```
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install seo@harold-skills
```

先在目标仓库跑过 `/idea-loop:setup`，再跑 `/seo:seo-setup`。

## 和 idea-loop 怎么接

- skill 之间按名字调：seo 的 skill 调 `idea-loop:<名>`，idea-loop 的 implementer 写站点文章时调 `seo:seo-writing`。
- 脚本只有一处用 idea-loop 的：`scripts/seo-issues.mjs` 开 issue、打 `type:seo/<方向>`、建 label（`seo-issues.mjs labels`）都转给 idea-loop 的 `issues.mjs`，经 `scripts/plugin-root.mjs` 找到它（依次看环境变量 `IDEA_LOOP_PLUGIN_ROOT`、同级目录 `../idea-loop`、插件缓存里最高的版本）。`plugin-root.mjs` 与 idea-loop 那份逐字节一致，由 `idea-loop/scripts/plugin-split.test.mjs` 守着。
- 测试跟仓库其余部分一起跑：仓库根 `node --test '*/scripts/*.test.mjs'`。

## 分层

SEO 的发现、入队和解决：方向 agent 从 OpenSEO 取数据找问题，`seo-scan` 把问题提成待验证的 issue（`type:seo/<方向>`），之后照 idea-loop 的 issue 会话走审核、实现。项目配置只有根目录的一份 `SEO.md`（格式：[seo-setup/references/seo-md.md](skills/seo-setup/references/seo-md.md)）。设计见 spec `idea-loop-seo`，拆分见 spec `plugin-split`。

| 层 | skill / agent |
|---|---|
| 接入 | `seo-setup`（人跑，写 SEO.md、同步 OpenSEO、建 issue 分类与独立队列、批 AI 可见性跟踪、建每周扫描的定时任务） |
| 发现 | `seo-audit`、`keyword-research`、`keyword-clustering`、`competitor-analysis`、`link-prospecting`、`seo-geo`；agent `technical-auditor`、`page-optimizer`、`keyword-miner`、`backlink-analyst`、`geo-analyst` |
| 入队 | `seo-scan`（每周定时，不带参数时按节奏挑方向）+ `scripts/seo-{due,gaps,budget,context,baseline,issues}.mjs`（开场先查这次方向要用的项目信息齐不齐，缺了推测、停下等人确认，写进 `SEO.md` 或项目上下文再跑）；issue 进调度的 `seo` 独立队列（上限 5） |
| 解决 | `seo-brief`（审核阶段写方案）、`seo-writing`、`seo-outreach`（实现阶段）、`seo-check`（发布前检查，构建后 hook 自动跑） |
| 陪练 | `seo-coach` |

## 出处

外部内容按「蒸馏副本」管理：需要的子集复制进来作为这里的真相源，运行时不读上游。上游更新时显式重新蒸馏：逐段对照上游，只保留下面写明的改动。

### OpenSEO

- 来源：[every-app/open-seo](https://github.com/every-app/open-seo) 的 Claude Code 插件 1.0.0，MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-audit`（含报告模板）、`keyword-research`、`keyword-clustering`、`competitor-analysis`（并入了上游的 `competitive-landscape`）、`link-prospecting`、`seo-coach` 照上游同名 skill；`seo-setup` 由上游的 `seo-project-setup` 改写，多了写 SEO.md、建 issue 分类、批 AI 可见性跟踪。没有取 `local-seo`。
- 只改了两处：被方向 agent 调用（无人值守）时不提问、不写入，并交回统一的发现清单（要用的项目信息缺了，不从站点或 `find_serp_competitors` 推断着用，在 `assumptions` 里写明缺什么、哪部分因此没做；写着「无」的项当作没有，不推断、不问）；人在场时照上游原样。项目上下文以 SEO.md 为准，单向同步进 OpenSEO。
- OpenSEO 的远程 MCP 由 seo 的 `.mcp.json` 声明（服务名 `openseo`，工具名 `mcp__plugin_seo_openseo__*`），装 seo 前先卸掉原 OpenSEO 插件，否则同名 skill 会有两份。

### claude-seo

- 来源：[AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo)，commit `4b99de2`（2026-10-05），MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-geo` 以它的 `seo-geo` skill 和两份 reference（AI 搜索优化指南、llms.txt 证据）为底，数据换成 OpenSEO 的 AI 可见性接口，带日期的统计数字没有搬。`seo-brief` 参考了它的 `seo-content-brief`。
