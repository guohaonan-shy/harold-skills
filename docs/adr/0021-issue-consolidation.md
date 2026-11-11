---
type: adr
status: 已被取代（→ ADR-0022）
tags: [idea-loop, issue-workflow, scheduling]
summary: 用 cloud 定时任务把同处改动的 issue 挂成根加子 issue、按根出会话，0.1.8 上线，随后被 issue 模型重定取代
related: ["[[2026-10-30-issue-consolidation-grill]]", "[[2026-11-05-issue-model-regrill]]"]
---

# ADR-0021 — 相关 issue 整合成根 issue，调度按根出会话（0.1.8 上线，已被 ADR-0022 取代）

> 由 spec `issue-consolidation` 蒸馏而来，该 spec 已删除。
> **本 ADR 整份已被 ADR-0022（issue 模型）取代**：整合任务下线，插件里不再有按父子关系归组的逻辑。留着它是为了记下“为什么做过、为什么又拿掉”，免得以后重新发明。

## 1 背景（why）

#165。调度每轮取最早的一个待验证 issue，一个号一张卡片，没有“这几个该一起做”的概念。2026-10-30 开着的 29 个 issue 里 24 个待验证，至少 5 组改的是同一个 skill（例如三个 issue 都改 writing-for-agents 的 SKILL.md），会同时开出三个会话去改同一份文件。合并全靠人在调度会话里口头说“这几个放一个会话”。

## 2 决策（how）

- **整合由 cloud 定时任务直接做，不等人批**：每 6 小时一次，把“改同一个文件，或同一个页面 / 功能模块”的待验证 issue，用 GitHub 原生 sub-issue 挂到新开的根 issue 下；根 issue 正文第一行写“由整合定时任务开出”。已在验证中及以后的 issue 不并进新组。
- **任务形态**：Claude 的 cloud 定时任务，指令全写在 prompt 里（cloud 会话不装仓库声明的插件）；GitHub 只走仓库范围的 REST（`search/issues`、GraphQL 在 cloud 会话里被拒）；需要在目标仓库装 Claude GitHub App（只有人能点）；建任务时清掉默认挂上的全部 claude.ai 连接器。**不发评论**：装上 App 后评论署名是人本人的账号，违反“从不以人的身份说话”，每次合了什么写在那次运行的会话里。
- **调度按根出卡片**：一个根一张卡片、一个会话；有父 issue 的子 issue 不单独出卡；开了不到 6 小时的不出卡（保证整合至少看过一次）。
- **中途推翻（同一天）**：最初定“一个子 issue 一份 spec、一个会话 grill 完、再拆子会话并行实现、PR 进集成分支”；人随后改成“一个根一份 spec（`issues:` 写全部子 issue）、一个会话从审核做到合并，不开实现子会话，也不要集成 review”。同时不加“进 implement 前压缩上下文”（#153 关为 not planned），碰到上下文问题再重开。

## 3 结果（result）

- 0.1.8 上线（含“一组一份 spec”的后续），随后 2026-11-03 先停掉 cloud 整合任务，2026-11-05 随 issue 模型重定（#242）整体下线：`setup` 不再建整合任务，`consolidation-prompt.md` 已删，插件里没有 `RemoteTrigger`。
- 树上留着两处痕迹：`idea-loop/scripts/issues.mjs` 的 `migrate`（把整合任务开出的根下的父子关系解除，并把这些只为归组而开的根关成 not planned），以及 `idea-loop/scripts/issue-model-tripwire.test.mjs`（断言插件里不再出现“整合”/consolidation）。
- 仍然生效、被后来的模型沿用的部分：一个 issue（或一组）从审核到合并在**一个会话**里做完，不开实现子会话；实现不压缩上下文；自动化不以人的身份发评论。

## 取代线索

- 被 ADR-0022 整份取代：理由是整合挂出的根下 27 个子 issue 大多并非“从根拆出来”（例如设计档案分段的根下挂着“测试在 darwin 本机卡住”），Linear 上也没有对应；新模型改为一个 issue 一个会话一份 spec，版本用 milestone、模块用分类 label、相关关系写正文链接。
- 与 ADR-0001 / ADR-0002 无冲突。
