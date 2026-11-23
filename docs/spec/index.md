# spec
> 契约：还没了结的规格，一份一个目录（`<slug>/<slug>.md`，工单在 `<slug>/tickets/`）——做完整个目录删（删前必须先写 ADR）。

| 文件 | summary |
|---|---|
| [[device-memory]] | 全设备一份记忆：设备级 dreaming 每周把根索引压在上限内、项目事实挪进项目目录 |
| [[dispatch-one-per-device]] | 一台设备一个调度 dispatch-home：配置在 home、上限按状态、每 30 分钟一轮 |
| [[dispatch-triage-per-round]] | 白天的 triage 也按每轮新开表里的上限个，triage 分组总数另设上限（表里新一列，默认 10） |
| [[dyna-missing-commands]] | dyna 补上 skill 五处还要 agent 自己拼 gh / git 的命令：按状态列 issue、打 kind、空提交、按提交检出、等 PR 检查 |
| [[home-bootstrap]] | 建 home：设备地图与项目清单、SessionStart hook 按项目注入项目地图、setup 一次改三处用户级配置 |
| [[idea-loop-cli]] | idea-loop 的脚本收成 Go 写的 dyna 命令行单独发布，skill 只写命令，插件写命令行版本范围 |
| [[in-scope-legacy-fix]] | 影响本次改动的存量问题在本 PR 里修，不再被当成无关存量自动开 issue |
| [[runtime-local-override]] | 本机对 runtime 的特殊做法写进 ~/home/runtime/<运行环境>.md，开场注入时同名小节整段替换 reference |
| [[runtime-ops-in-docs]] | 运行环境的操作全写进运行环境说明，dyna 不再认环境分支；说明按能力模板写，新环境照模板生成 |
| [[skill-rewrite]] | idea-loop 的 skill 与 agent 定义按写法规则逐份重写、五组合并，主体都不超过 4500 字 |
| [[skill-structure-checks]] | skill 文件的常驻检查：写文件时 hook 对 home 下全部 skill 跑字数线 4500、对 idea-loop 跑行内命令绊线、review 报主文件增长、retro 先判能不能做成检查、没 CI 时同一 head 的全量只跑一次 |
| [[skills-read-home]] | skill 与脚本从 home 的项目目录读写知识库，改动直接提交 home，dreaming-home 对账各项目 |
