---
type: spec
status: 草稿
tags: [idea-loop, pr-review, to-spec]
summary: issue 34 的五处 pr-review / to-spec 改动复现后都已落地，建议关闭
related: []
issues: [34]
---

# pr-review 汇报与 spec 图的五处后续改动（复现后都已落地）

## 1 问题

无。#34 列的五件事在 2026-10-16 对着 main（idea-loop 0.0.24）逐节核过，都已经在后续版本里做了，没有可复现的问题，全部列进末尾「建议关闭」。

### 1.1 根因

不涉及。

## 2 方案

不改。审核时把 #34 关成已解决。

## 3 User Stories

无期望行为条目（正文没有问题）。

## 4 实现决策

无分歧。

## 5 技术方案总览

### 5.1 后端

不涉及。

### 5.2 前端内部

不涉及。

### 5.3 前端交互

不涉及。

## 6 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑 / 数据转换 | TDD 单元 | 不涉及 |
| API 契约 | TDD API 测试 | 不涉及 |
| DB schema / 迁移 / 并发 | 真 DB 测试 | 不涉及 |
| LLM 输出质量 | eval | 不涉及 |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器测试 | 不涉及 |

无 prompt/eval 变动。

## 7 Out of scope

- 清理存量 spec 旁边已经提交的 `.excalidraw` 文件（#34 原文就写了暂时不动）。

## 8 关联

- #34 idea-loop pr-review / to-spec：PR 描述不放 review 小节、thread 写给拍板的人看（固定四段、不出现代码指称）、素材图点开能放大、定稿后不保留 .excalidraw

## 建议关闭

### #34 PR 描述 / review 汇报 / 素材图 / spec 图的五处改动——都已落地

逐节对着 main 核过（2026-10-16），五件事都已经在后续版本里做了，有两处被更晚的决定取代：

| issue 里的哪一节 | 现在的样子 |
|---|---|
| 一、PR 描述不放 review | 已做。描述固定四节（一句话 / 改了什么 / 要你做的事 / 参考），写入脚本把旧的 review 节当作废弃节拒写。issue 写的是五节，后来改成了四节。 |
| 二、汇报写给拍板的人看 | 已做。开头一句结论、标题即用户后果、正文不出现代码指称、范围与丢弃候选收进折叠区；非行为问题配了图会被校验脚本拒掉。issue 要的「thread 根评论 edit 子命令」不再需要：review 已整体从 GitHub thread 搬到会话 + 本地文件，合并时才归档成 PR 评论。 |
| 三、spec 图不留 .excalidraw | 已做。spec 图的规则写明定稿后 `docs/` 里只留 PNG，源文件留在 `.tmp/`。 |
| 四、素材图点开能放大 | 已做。素材改放每个 PR 一条的孤儿分支，用 `blob/…?raw=true` 嵌图，规则里写明了为什么 release 附件做不到。 |
| 五、批示处理完只回一条汇总 | 已做。pr-review、implement 和 review loop 的规则都写「只回一条汇总，不要一个点回一条」。 |

卡在哪：没有卡点，是已经做完。建议审核时关成已解决（completed），关掉后这份 spec 目录整个删除。

复现材料：`.tmp/to-spec/pr-review-report-followups/repro/2026-10-16-code-state.md`
