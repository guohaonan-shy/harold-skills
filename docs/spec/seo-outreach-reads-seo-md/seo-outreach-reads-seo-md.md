---
type: spec
tags: [idea-loop, seo, seo-outreach-reads-seo-md]
summary: seo-outreach 与 seo-writing 改用 seo-md.mjs 读 SEO.md，不再指向 seo-setup 的私有参考
related: []
issues: [235]
---

# seo-outreach 读 SEO.md 时不再指向 seo-setup 的私有参考

> #235 存在：`seo-outreach` 读 `SEO.md` 时让 agent 去看 `seo-setup` 自己 `references/` 里的 `seo-md.md`，而 `seo-setup` 只能由人调用，agent 调不到它，这条指针既违反 skill 写法约定又走不通；2026-11-16 对着 `main` 5f26e2f 用 grep 读码核过，详情在「问题陈述」

## 问题陈述

### seo-outreach 起草外联前，被指去读一份它不该读、也调不到的文件

`idea-loop/skills/seo/seo-outreach/SKILL.md` 的「输入」一节写着：再读目标仓库根的 `SEO.md`（格式见 `idea-loop:seo-setup` 的 references 里的 `seo-md.md`）。

一个外链类 issue 进了实现阶段，issue 会话调 `seo-outreach` 起草外联邮件，agent 走到这一句时有两条路：

- 照字面去读 `seo-setup/references/seo-md.md`：违反 `writing-for-agents` 的 `SKILL-MECHANICS.md`「引用另一个 skill」——别的 skill 不读它的 `references/`，要用就调这个 skill。
- 照约定去调 `seo-setup`：`seo-setup` 设了 `disable-model-invocation: true`，Skill 工具调不到。

本该是：像其余读 `SEO.md` 的 SEO skill 一样，跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md` 拿到解析好的九节（JSON），不碰格式文档。现存实例：`seo-audit`、`keyword-research`、`competitor-analysis`、`seo-coach` 都这样写（各自 SKILL.md 的开头步骤）。

同类第二处：`seo-writing/SKILL.md`「规则分两层」写着「格式见 seo-setup 的 `references/seo-md.md`」。`seo-writing` 同样可被模型调用（实现内容类 SEO issue 时调它），同一个缺陷。

### 根因

`seo-outreach`、`seo-writing` 写成时 `seo-md.mjs` 还不是读 `SEO.md` 的统一入口；后来 `seo-scan` 修过同一问题（`seo-params-doc.test.mjs` 的 C1 测试守着 seo-scan），这两份没跟着改。

## 方案

改完，`seo-outreach` 和 `seo-writing` 读 `SEO.md` 的方式跟其余 SEO skill 一样：跑 `seo-md.mjs`，从它输出的 JSON 里取要的节；正文里不再出现指向 `seo-setup` 私有参考的指针。agent 走到这一步时只有一条能走通的路。

这是两处一句话的文档改动，不涉及模块之间的消息往来，不画时序图。

- **seo-outreach「输入」**：括号里的格式指针换成 `seo-md.mjs` 的读法；读哪几节不变——「站点」、「竞品」、「写作」（`writing.voice` 文风文件、`writing.failures` 失败案例文件）。对的杠杆：`SKILL-MECHANICS.md`「引用另一个 skill」（不读别的 skill 的 `references/`）。
- **seo-writing「规则分两层」**：同样去掉格式指针，开工那一步改成用 `seo-md.mjs` 读「写作」节拿两个文件路径。
- 同一行为的其他入口：
  - `idea-loop/skills/seo/README.md` 链接 `seo-setup/references/seo-md.md`：**排除**，那是给人看的 README，不是 skill 正文，人点链接读格式是对的。
  - `seo-setup` 自己读 `references/seo-md.md`：**排除**，读自己的参考合规。
  - `seo-scan`：已修过，C1 测试守着，不动。
  - `scripts/*.mjs` 注释里写格式定义在哪：**排除**，给维护脚本的人看，不是 agent 读的正文。
- `seo-outreach` 的 description（第 3 行）归 #234，这里不碰。

## User Stories

只修问题、不加能力：

1. 期望行为（对应「seo-outreach 起草外联前…」）：`seo-outreach` 与 `seo-writing` 读 `SEO.md` 一律跑 `seo-md.mjs`，正文里没有任何指向 `seo-setup` 的 `references/` 或 `seo-md.md` 的文字。

## 实现决策

- 读法照抄现存实例 `seo-audit` 的写法：`node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md`。依据：`keyword-research`、`competitor-analysis`、`seo-coach` 同一写法。
- 没有 `SEO.md` 时各自原有的处理不变（seo-outreach 停下让人跑 `/idea-loop:seo-setup`；seo-writing 只用通用规则）。
- 不升级成新的 skill 或脚本：`seo-md.mjs` 已经给出 `writing.voice` / `writing.failures`，够用。
- 版本：改了 idea-loop 插件正文，`plugin.json` 按 `REVIEW.md`「额外要求」升补丁档。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 文档断言测试：两份 SKILL.md 不含 `seo-md.md`、不含 `seo-setup…references/`，含 `seo-md.mjs` |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：只换读法指针，不改 agent 产出 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：插件文本本身——测试读 SKILL.md 做断言（`SEO_DOCS_ROOT` 可指向改前的副本，先看它红）。能抓到指针回潮；抓不到 agent 实际是否照做。
- **增量功能测试**：前置：改前的插件；步骤：跑新测试；期望：红（两份 SKILL.md 都还有 `seo-md.md`）。改后再跑：绿。覆盖：期望行为 1。
- **照着谁写**：`idea-loop/scripts/seo-params-doc.test.mjs` 的 「seo-scan: does not point at seo-setup's private references (C1)」，测试加在同一文件里。

## Out of scope

- `seo-outreach` 的 description（#234）。
- 给 `seo-setup` 拆出一个可被模型调用的格式说明 skill：`seo-md.mjs` 已是读入口，没有调用方需要读格式文档。

## 关联

- 相邻 issue：#234（同改 seo-outreach，只动 description 第 3 行；本 spec 动「输入」一节，不重叠，谁先合都行）。
- 相关 spec：无未完成的重叠 spec。
