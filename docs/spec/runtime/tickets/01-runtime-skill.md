# 01 — 运行环境层落地：能力清单、两份做法、检测与会话开始时注入

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 有一个共享 skill `idea-loop:runtime`：正文列出能力清单（闭集：定时任务、会话内循环、会话管理、浏览器、向人提问、发布审阅页、推送、发文件给人、调用 MCP、装与设置），每个能力写通用流程要它做什么、做不到时怎么退；两份 reference，claude-desktop 与 magi，逐个能力写具体做法或「没有」。一个检测脚本按环境变量打印当前运行环境；会话开始时 hook 在主会话里注入一行「当前运行环境：X，用到能力时照 idea-loop:runtime 做」。

这一张只加新东西，不改任何现有 skill 的正文（那是 02、03）。做完后：在 magi 会话里跑检测脚本得到 `magi`；新开会话能看到注入的那一行；读 `idea-loop:runtime` 能查到每个能力在两个运行环境里怎么做。

依据全部在 spec「实现决策」：能力清单表（两列做法原样作为两份 reference 的骨架）、「检测与加载」、「退路」、「调度在 magi 里的形状」、「定时任务的 prompt」、「claude-desktop 只搬不改」。claude-desktop 的 reference 要把现有正文里的写法原样收进来（工具名、参数、到期提醒文案、section 规则、Playwright 的启动参数与锁目录规则），这样 02、03 才能把正文里的写法删掉而不丢东西：逐个去现有 skill 正文里找出原文再收。

## 验收标准

- [x] 检测脚本：`IDEA_LOOP_RUNTIME` 为已知名时打印它；未设时有 `MAGI_SESSION_ID` 打印 `magi`，否则打印 `claude-desktop`；`IDEA_LOOP_RUNTIME` 为未知值时退出码非 0 且说明已知名单。有单元测试（先红后绿）。
- [x] hooks 里注册了 `SessionStart`，命令跑检测脚本并只输出一行；有测试断言它注册了且输出一行。
- [x] `idea-loop:runtime` 的 SKILL.md：frontmatter description 只做路由；正文有能力清单（闭集）、检测规则、统一退路（含两个例外与「向人提问缺了改在对话里问」）；主体 < 5000 字。
- [x] 两份 reference 的能力小节一一对应、名字与 SKILL.md 的清单一致；有结构测试断言（缺一个能力或多一个都红）。
- [x] claude-desktop reference 收齐了现有正文里的桌面端写法：对 0.1.10 正文 grep 出的每个桌面端工具名，在这份 reference 里都找得到（在交回里列出对照）。
- [x] magi reference 的每个做法与 spec 能力清单表的 magi 列一致；调度一节写清 cron 每轮新开会话、按 slug 计数、直接开会话、归档自己、上限照旧。
- [x] `node --test '*/scripts/*.test.mjs'` 全绿。

## 选中的存量回归

- `no-project-leak.test.mjs`：新 reference 里写例子，最容易带进真实项目名。
- `issues-skill-doc.test.mjs`、`pr-review-slim-doc.test.mjs` 这类读文档断言的测试：新 skill 的写法要跟现有约定一致。
