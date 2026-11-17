# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[edge-case-known-limit]] | PR 流程里碰到时看得见、不丢东西的边缘情形照规则接受成已知限制，不再每次摆题 |
| [[home-bootstrap]] | 建 home：设备地图与项目清单、SessionStart hook 按项目注入项目地图、setup 一次改三处用户级配置 |
| [[issue-body-background]] | issue 正文的「背景」改成必填，issues new / body 缺它就拒；SEO 扫描拼的正文同步补上 |
| [[replay-gh-isolation]] | 规则回放起的每个 claude / Codex 子进程都不带 gh 登录，读不到用例之后的线上 issue 与 PR |
| [[seo-autopilot]] | SEO issue 默认全托管：扫描后当场分流、spec 照推荐定、内容改动自动合并并上线自查、每 3 天出效果报告、外联进草稿箱 |
| [[seo-outreach-reads-seo-md]] | seo-outreach 与 seo-writing 改用 seo-md.mjs 读 SEO.md，不再指向 seo-setup 的私有参考 |
| [[seo-skill-descriptions-route-only]] | seo 分类 6 个 skill 的 description 删掉流程与产物，只留「是什么 + 触发词」 |
| [[subagent-handback-lost-turn]] | 交回后卡住是那一轮模型请求断了或挂住，被平台合成回复关掉；网络问题，idea-loop 不加机制 |

> 当前为空。上一批（`design-plugin-idea-loop-integration` / `design-loop-v2`）已于 2026-09-16 蒸馏进 [[0001-design-workflow-into-harold-skills]] 与 [[0002-design-loop-v2-imagine-refine]] 并删除。
