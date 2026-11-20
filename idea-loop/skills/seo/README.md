# seo 分类

SEO 的发现、入队和解决：方向 agent 从 OpenSEO 取数据找问题，`seo-scan` 把问题提成 issue（`type:seo/<方向>`）并当场分流：每个新 issue 起一个 `issue-triager`，只有要 UI 设计的进 triage，判不了的进 todo，重复、「不做」、已实现、复现不出的 canceled；之后照 idea-loop 的 issue 会话走 triage、实现。项目配置只有根目录的一份 `SEO.md`（格式：[setup 的 SEO 模块参考](../engineering/setup/references/seo/seo-md.md)）。设计见 spec `idea-loop-seo`。

| 层 | skill / agent |
|---|---|
| 接入 | `/idea-loop:setup` 的 SEO 模块（人跑 `setup`，接完项目后答「接」；写项目目录里的 SEO.md（新增的键与节：OpenSEO 的套餐额度与每周分配、「构建与检查」的内容路径与上线等待、「内容原则」、可选的「分析」）、同步 OpenSEO、把 seo 分类写进项目目录 `ISSUE_TRACKER.md` 的「分类 label」并建 label、批 AI 可见性跟踪、建每天扫描的定时任务） |
| 发现 | `seo-audit`、`keyword-research`、`keyword-clustering`、`competitor-analysis`、`link-prospecting`、`seo-geo`；agent `technical-auditor`、`page-optimizer`、`keyword-miner`、`backlink-analyst`、`geo-analyst`（已有跟踪时先估价，估价不超过本次额度才发付费检查，超了不跑；不建跟踪）、`results-analyst`（效果报告：回看改动前后的点击和排名，出两张图和三块报告） |
| 入队 | `seo-scan`（每天定时，不带参数时按节奏挑方向：效果报告 `results` 每 3 天，其余五个方向每 7 天，当天没有到期的只写一行研究日志；提完 issue 后分流，结尾调用外联跟进，再把效果报告落成项目目录里的 `docs/records/seo-results/<日期>.md`，直接提交到 home 并推送报告路径）+ `dyna seo` 的 `due`、`gaps`、`allocate`、`sync-context`、`compare-audits`、`provenance`、`file-issues`（OpenSEO 的套餐额度按周花完：`dyna seo allocate` 读研究日志的「花费」行算本周预算，按 `SEO.md` 的每周分配拆给排名追踪、扫描、起草与验证三份；开场先查这次方向要用的项目信息齐不齐，缺了推测、停下等人确认，写进 `SEO.md` 或项目上下文再跑）；issue 与别的 issue 在调度里同一个队列 |
| 解决 | `seo-brief`（triage 阶段写方案；定了角度和 title 后多一步「配图」：推封面主体候选、取 OG 大标题，调 `cover`、`og` 出图，写进 brief 的「配图」一节，图跟 spec 一起放进 spec 的 `assets/`、提交到 home，`seo-writing` 写正文时拷进站点的图片目录；人在场时角度和封面主体合成一问，托管时照推荐定，没配出图配方用默认并在 brief 里写一句）、`seo-writing`（按 brief 写完初稿后跑改稿循环：`dyna seo writing lint` 加项目的补充 lint，再起写作评委子代理按 13 个维度打分，配了「第二评委」就一起打；lint 的问题和写作评委的 `local` 问题自动改，最多三轮，没干净的写进交回；写作评委报 `premise`（论点、章节或事实断言要变）时不自己改，issue 翻回 triage 并附写作评委原话；title 或论点变了重调 `cover`、`og`）、`cover`（文章列表封面和顶部大图：项目取值读 `SEO.md` 的「配图」节和 `DESIGN.md` 的 `blog-cover` 组件，没配时用默认出图配方出图并在交回里写明）、`og`（文章的 OG 分享卡：三种自带版式，颜色字体读 `DESIGN.md`，没配用中性默认；`dyna seo og render` 填模板并在浏览器里截成 1200×630，文字放不下会报出来而不是裁掉）、`seo-outreach`（实现阶段起草，草稿进人的草稿箱；人说「发外联邮件」才发；每次扫描结尾读回信、追发；目录提交用『人的浏览器』填到最后一步等人点；没有邮件 MCP 或人的浏览器的运行环境，草稿留在 `docs/`、推送路径）、`dyna seo check`（发布前检查，构建后 hook 自动跑；怎么读输出见 `seo-writing/references/checks.md`）+ `dyna seo scope`（判一个 SEO PR 是不是只改内容：改动文件都落在 `SEO.md` 的「内容路径」里；只改内容、检查全过、两轴没有阻塞项的 SEO PR 由 Claude 合并，见 `pr-review/references/seo-auto-merge.md`）；`dyna seo verify-live`、`dyna seo record`（合并后的上线自查，写在 `pr-review/references/merge.md` 的「上线后自查」：每分钟取一次线上页面，等线上换成这次的构建（最久 `SEO.md`「构建与检查」的「上线等待」分钟，没写 30），再逐个网址核能打开、没有 noindex、title 与 description 同产物、在 sitemap 里；全过就在 issue 上贴带隐藏标记的评论并把目标词加进排名追踪，有一项不过就回滚合并并另开 todo issue，等满没上线只推送不回滚） |
| 陪练 | `seo-coach` |

## 博客 workflow

一篇站点文章（`type:seo/*` 的 issue，spec 的「方案」是 brief）在 issue 会话里走三步：

1. **brief 出图**：`seo-brief` 定角度和 title 后，推封面主体候选、取 OG 大标题，调 `cover`（文章列表封面和顶部大图）和 `og`（1200×630 分享卡）出图，写进 brief 的「配图」一节，图跟 spec 一起放进 spec 的 `assets/`、提交到 home，`seo-writing` 写正文时拷进站点的图片目录。
2. **写作循环**：`seo-writing` 写完初稿，每个语言版本最多三轮：`dyna seo writing lint`（`SEO.md`「写作」节的 `lint 配置`）加项目的 `补充 lint`，再起写作评委按 13 个维度打分（配了 `第二评委` 就一起打）；lint 的问题和写作评委的 `local` 问题自动改。写作评委报 `premise` 时不自己改：issue 翻回 triage，评论放写作评委原话，夜间模式也一样（`issue-session/references/night-mode.md`）。title 或论点变了，重调 `cover`、`og`。
3. **发布**：构建后 `dyna seo check` 自动跑，之后的开 PR、自动合并、上线自查是已有流程。

项目要写的取值（格式见 `engineering/setup/references/seo/seo-md.md`，`setup` 的 SEO 模块逐键推荐并提问）：

| 位置 | 写什么 | 谁读 |
|---|---|---|
| `SEO.md`「写作」 | 文风文件、失败案例文件、类型字段与映射、`lint 配置`、`补充 lint`、`第二评委` | `seo-writing`、写作评委 |
| `SEO.md`「配图」 | 图片目录（要在「内容路径」里）、生图工具、封面字段、OG 字段、`DESIGN.md` 路径 | `cover`、`og`、`seo-brief` |
| `DESIGN.md` | `colors` / `typography` token；可选的 `blog-cover` 组件（logo、底色、主体风格、提示词骨架）和 `og-card` 组件（版式、`titleSize`、logo） | `cover`、`og` |

哪样没配都不停：`cover`、`og` 用中性默认出图配方并在交回里写明，`补充 lint`、`第二评委` 写 `无` 就跳过。

## 出处

外部内容按「蒸馏副本」管理：需要的子集复制进来作为这里的真相源，运行时不读上游。上游更新时显式重新蒸馏：逐段对照上游，只保留下面写明的改动。

### OpenSEO

- 来源：[every-app/open-seo](https://github.com/every-app/open-seo) 的 Claude Code 插件 1.0.0，MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-audit`（含报告模板）、`keyword-research`、`keyword-clustering`、`competitor-analysis`（并入了上游的 `competitive-landscape`）、`link-prospecting`、`seo-coach` 照上游同名 skill；`setup` 的 SEO 模块由上游的 `seo-project-setup` 改写，多了写 SEO.md、建 issue 分类、批 AI 可见性跟踪。没有取 `local-seo`。
- 只改了两处：被方向 agent 调用（无人值守）时不提问、不写入，并交回统一的发现清单（要用的项目信息缺了，不从站点或 `find_serp_competitors` 推断着用，在 `assumptions` 里写明缺什么、哪部分因此没做；写着「无」的项当作没有，不推断、不问）；人在场时照上游原样。项目上下文以 SEO.md 为准，单向同步进 OpenSEO。
- OpenSEO 的远程 MCP 由 idea-loop 的 `.mcp.json` 声明（服务名 `openseo`），装 idea-loop 前先卸掉原 OpenSEO 插件，否则同名 skill 会有两份。

### claude-seo

- 来源：[AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo)，commit `4b99de2`（2026-10-05），MIT 许可。
- 蒸馏日期：2026-10-22。
- 对应：`seo-geo` 以它的 `seo-geo` skill 和两份 reference（AI 搜索优化指南、llms.txt 证据）为底，数据换成 OpenSEO 的 AI 可见性接口，带日期的统计数字没有搬。`seo-brief` 参考了它的 `seo-content-brief`。
