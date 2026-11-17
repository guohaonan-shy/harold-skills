# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[device-memory]] | 全设备一份记忆：设备级 dreaming 每周把根索引压在上限内、项目事实挪进项目目录 |
| [[home-bootstrap]] | 建 home：设备地图与项目清单、SessionStart hook 按项目注入项目地图、setup 一次改三处用户级配置 |
| [[issue-body-background]] | issue 正文的「背景」改成必填，issues new / body 缺它就拒；SEO 扫描拼的正文同步补上 |
| [[replay-gh-isolation]] | 规则回放起的每个 claude / Codex 子进程都不带 gh 登录，读不到用例之后的线上 issue 与 PR |
| [[seo-autopilot]] | SEO issue 默认全托管：扫描后当场分流、spec 照推荐定、内容改动自动合并并上线自查、每 3 天出效果报告、外联进草稿箱 |
| [[seo-outreach-reads-seo-md]] | seo-outreach 与 seo-writing 改用 seo-md.mjs 读 SEO.md，不再指向 seo-setup 的私有参考 |
| [[seo-skill-descriptions-route-only]] | seo 分类 6 个 skill 的 description 删掉流程与产物，只留「是什么 + 触发词」 |
| [[subagent-handback-lost-turn]] | 交回后卡住是那一轮模型请求断了或挂住，被平台合成回复关掉；网络问题，idea-loop 不加机制 |
