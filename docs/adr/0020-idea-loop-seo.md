---
type: adr
status: 生效
tags: [idea-loop, seo, openseo, scan]
summary: idea-loop 新开 seo 分类：蒸馏 OpenSEO 方法做发现，扫描结果提成 issue，按原有 issue 流程解决
related: ["[[2026-10-22-grill-idea-loop-seo]]", "[[2026-10-21-seo-workflow-discussion]]"]
---

# ADR-0020 — idea-loop 的 seo 分类：OpenSEO 负责发现，idea-loop 负责解决

> 由 spec `idea-loop-seo` 蒸馏而来，该 spec 已删除。决议过程见 [[2026-10-22-grill-idea-loop-seo]]。

## 1 背景（why）

站点运营者（SEO 不是他的专长）要的是：SEO 问题被定期发现、像 bug 一样进 issue、在 issue 会话里被解决。当时三段各自断着：

1. **idea-loop 没有 SEO 能力。** 第一个接入的项目自建了一套项目级插件：578 行周报 skill 加 launchd 定时，日志最后一次启动是 2026-09-06，之后每个周日都没跑，一个月没人发现；最后一次产出（2026-09-17）的 2 张工单、16 段洞察里，最强的几条都落在「洞察」里没人接；下游执行链调用的两个 idea-loop skill 已被改名。停摆没被发现，是因为产物（周报快照）不进任何有人看的队列。
2. **OpenSEO 插件（1.0.0，9 个 skill 加一个远程 MCP）按「人坐在对面」写**：缺信息问人、写入前征求同意、产物是 HTML 报告、付费动作要人批。routine 里没有人可问，发现也进不了任何流程。
3. **发布前的两平台（Google / Bing）检查规则**锁在那个项目的 skill 和构建产物 lint 脚本里，阈值和路径写死，别的站点用不了。

## 2 决策（how）

- **新开分类目录 `skills/seo/`**；`.mcp.json` 加 OpenSEO 的远程 MCP（代价：每个装 idea-loop 的项目多一个连接，没连上只影响 seo 分类；原 OpenSEO 插件要先卸，否则同名 skill 两份）。出处写在 `skills/seo/README.md`，不写在每个文件头；上游更新时显式重新蒸馏，运行时不读上游。
- **13 个 skill、5 个只读方向 agent。** 六个蒸馏自 OpenSEO、`seo-geo` 以 claude-seo 的同名 skill 为底换成 OpenSEO 数据，其余自己写。蒸馏副本只改两处：被 agent 调用时不提问不写入（用 SEO.md 的值，没有就用默认值并记进「假设」）、交回统一的发现清单；人在场时照原样。方法全在 skill 里，agent 是薄包装（`technical-auditor`、`page-optimizer`、`keyword-miner`、`backlink-analyst`、`geo-analyst`），起 agent 的理由是每个方向的工具输出大、五个要并行。不设单独的核验 agent：issue 会话的 triage 阶段按「怎么复现」独立重跑就是核验。
- **单一入口 `seo-scan`**：只有一个每周定时任务（由 `seo-setup` 在人同意后建），不带参数时由挑方向脚本读 OpenSEO 研究日志里以前各次的「采集」行：technical、pages 每次跑，keywords、backlinks、geo 满四周才跑，没采集到的不算跑过。节奏是插件的，不进 SEO.md。扫描开场按余额下限和各方向额度算预算，各方向放行之和不超过 2,000 credits（OpenSEO 超过要人批，无人值守时没人可问）；运行状态不存仓库，摘要追加进研究日志。
- **发现清单是 agent 与入队脚本之间唯一的接口**（方向、种类、标题、受影响页面、证据、比例的分子分母、复现、修法、验收标准、假设），「需要诊断 / 需要决定」不挡发现进 issue。
- **`seo-issues.mjs` 是扫描里唯一写 GitHub 的地方**：缺证据 / 复现 / 验收、或百分比不带分子分母就拒收；同方向同种类合成一个 issue 并列出全部受影响页面；开着的同类 issue 只追加评论；不设数量上限（并发由调度限）；打 `type:seo/<方向>`，不打状态标签（新 issue 就是 backlog）。
- **SEO.md** 在仓库根，由 `seo-setup` 生成，之后人直接改；竞品与重点页面单向同步进 OpenSEO（以 SEO.md 为准）。
- **解决阶段不改 issue 流程**：内容类在 triage 阶段由 `seo-brief` 写方案，实现阶段由 `seo-writing` 写；外链类由 `seo-outreach` 产出只改 `docs/` 的 PR（邮件草稿加跟进表，永不自动发送，台账在 `docs/records/outreach/`）。
- **发布前检查**：`seo-check` skill 加脚本，按字宽判标题与描述长度（CJK 记 2）、按平台标注；构建命令结束后由 hook 触发（SEO.md 声明了产物目录且其中有文件晚于命令开始时间才跑），有 error 把清单交回模型，不读 SEO.md 的是脚本本身，所以项目的 CI 也能直接调。

## 3 结果（result）

- 实现于 PR #73（0.1.3，2026-10-22 合并）；之后由 `skills/seo/` 下的 13 个 skill、`agents/` 下的 5 个方向 agent、`scripts/seo-{md,due,budget,gaps,context,baseline,issues,check}.mjs` 与 `seo-check-hook.mjs`（在 `hooks/hooks.json` 里挂 PreToolUse / PostToolUse 的 Bash）组成，各有单测。`seo-setup` 只能人调，`seo-scan` 可被模型调（定时任务只能写「用 Skill 工具调」）。
- 与 spec 当时写法不同、但属后来有意的演进（不算偏离）：
  - **独立队列已删。** spec 里 seo 有独立的调度队列（上限 5、三个带前缀的 section）；PR #267（2026-11-09，「所有 issue 一个队列」，见 [[266]] 题 3）按人的话「seo 不整单独队列」删掉了它。`issues.mjs` 现在把旧的「（独立队列，上限 N）」注释当作过期备注丢弃；`seo-setup` 的 description 里「建 SEO 的 issue 分类和队列」是留下的残字。
  - **「待验证」状态已不存在**：issue 模型改成七个状态对上 Linear（PR #255），新 SEO issue 是没有状态标签的 backlog，由每周 triage 分拣。
  - **SEO.md 现为七节**（比 spec 多一节「品牌」，由后续的品牌词蚕食修复加入，PR #141）；缺项目信息时的处理改为先推测、经人确认补进 SEO.md（PR #207）。
- 项目侧的接入（退役旧周报插件与 launchd、写第一个项目的 SEO.md、建 AI 可见性跟踪）不在本次范围，另有记录。
