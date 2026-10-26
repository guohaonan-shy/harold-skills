# 文档对账：spec → ADR

文档写下时是对的，代码往前走了，没人回头改那一行。这份是 `idea-loop:adr-reconciler` 的工作方法：拿每份文档的自我陈述，去撞真实的代码和真实的 PR 状态，**提议**处置；提议表里的行怎么写见 [proposal-table.md](proposal-table.md)，人批过才执行。

## 纪律

- **PR 编号要交叉核对标题。** grep `#\d+` 会抓到 hex 色值（`#2563eb`）和文档内部的任务编号，`gh pr view 15` 照样返回一个看起来合理的无关 PR；PR 标题与文档主题对得上才算。
- **覆盖的 issue 挂着 `status:搁置` 的 spec，不做年龄判定**：年龄分不出被遗忘和被故意排期。`草稿` / `审核中` / `正式` 的 spec 还没开工，只看它在这个状态停了多久（提议人去定、去设计或把 issue 搁置），不判实现。
- **每个判定都靠这一次跑出来的证据**，不凭记忆、不凭文档自己的旧结论。存疑就留着不动。

## 扫描范围

主要：`docs/spec/` 的每份 spec 与它的 `tickets/`、`docs/adr/`。次要：`docs/domain/`、仓库里各插件的 references（参考手册）、`GLOSSARY.md`、`REVIEW.md`。`CLAUDE.md` 与 `AGENTS.md` 不在范围内。`docs/design/` 归档与 `DESIGN.md` 归别的 agent，这里不碰。

## 判定可证伪

每份 spec 判三档之一并附证据：`已实现`（找到文档承诺的主要代码物，附 1–2 条路径）· `部分实现`（说清有什么、缺什么）· `未实现`（说清搜了哪些关键词和路径）。做法：从正文抽出它承诺的具体代码物（组件名、API 路径、DB 表 / 列、prompt 模块、feature flag），实际 Grep / Glob 去查。文档太抽象、没有可查的代码物，判 `无法机械判定` 并写明原因。

## 几种情况怎么处置

| 情况 | 信号 | 处置 |
|---|---|---|
| spec 已实现 | 代码物在树上 / PR 已合并且标题对得上 | 写 ADR → 删整个 spec 目录 |
| spec 部分实现 | 有的在、有的缺 | 已完成的写 ADR，剩下的留一份小 spec；剩下的无限期不做，提议把它覆盖的 issue 挂 `status:搁置` |
| spec 确认不做 | 人确认（不从超时推断） | 写 ADR（未采纳，带 why-not）→ 删整个 spec 目录 |
| spec 说 X，代码是 Y | 代码物在，形态对不上 | **报警，交人**：文档在撒谎，比过期危险 |
| domain / reference 与现状不符 | 引用的表 / 字段 / 接口已改名；`REVIEW.md` 的命令已不存在 | 订正，不删 |
| `GLOSSARY.md` 与现状不符 | `_Avoid_` 里的词出现在新代码或新文档里；词条说的概念在代码里已经没了 | 逐条问人，同意了才订正或删除；新增词条只在 `idea-loop:grill` 里 |
| 新 ADR 推翻某个生效 ADR 的一节 | 写新 ADR 前搜 `docs/adr/` 的同话题旧决策 | 按小节标注取代（`idea-loop:wiki-conventions` 的「frontmatter」） |
| 漏网的工单 | `docs/spec/<spec-slug>/tickets/` 里还躺着、对应 PR 已合并（`gh` 查，标题对得上） | 删除 |

起草 ADR 的格式与小节取代按 `idea-loop:wiki-conventions`；提议段只把 ADR 草稿放进提议表指向的文件，不写进 `docs/adr/`。删 spec 是删它整个目录（含 `tickets/` 和 `assets/`）；`assets/` 里 ADR 要引的证据图先挪到 ADR 旁边，这一步在执行段做。
