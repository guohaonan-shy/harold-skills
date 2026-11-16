# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[replay-gh-isolation]] | 规则回放起的每个 claude / Codex 子进程都不带 gh 登录，读不到用例之后的线上 issue 与 PR |
| [[seo-autopilot]] | SEO issue 默认全托管：扫描后当场分流、spec 照推荐定、内容改动自动合并并上线自查、每 3 天出效果报告、外联进草稿箱 |
| [[subagent-handback-lost-turn]] | 交回后卡住是那一轮模型请求断了或挂住，被平台合成回复关掉；网络问题，idea-loop 不加机制 |
