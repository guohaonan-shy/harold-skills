---
name: to-spec
description: 把刚才这场对话落盘成 raw transcript + 一份 spec。不再访谈，只综合。
disable-model-invocation: true
---

# To Spec

把当前对话和你对代码库的理解，综合成两个产物。**不要再访谈**——该问的 `grill` 已经问完了；这里只是把已知的东西写下来。

> 先读一次 `../../references/wiki-conventions.md`（目录、frontmatter、slug 唯一性、禁写文件路径）。

## 1 落 raw transcript

写进 `docs/raw/<topic>/<YYYY-MM-DD>-<slug>.md`。

```yaml
---
type: raw
source_type: conversation
captured: <today>
title: <人读的标题>
tags: [<topic>, <feature-slug>]
related: ["[[<spec-slug>]]"]
---
```

正文格式（顶部先写一段格式约定块，让这份文件自解释）：

- `## U<n>` = 人的发言，**逐字保留**，不改写不精简——决策住在这里。
- `## A<n>` = AI 的回应，**只保留结论与发现**，取证过程、工具调用、中间推演一律略去。
- 引用的外部产物（Artifact / 报告）留链接，不复制正文。
- 末尾一张「本轮决议」表，一行一个议题。

参考实现：`docs/raw/docs-wiki-v2/discussion-2026-08-18.md`。

同一场讨论若引用了外部材料（网页 / PDF / 数据查询 / 截图），一并抓进同一个 `docs/raw/<topic>/` 桶，各自带 `source_type` + `captured`。图片下载到本地 `assets/`，**永远配一段文字描述**——没有文字的图片不算捕获。

## 2 落 spec

写进 `docs/spec/<slug>.md`。slug 必须**全局唯一**且**不同于 transcript 的 slug**。

```markdown
---
type: spec
status: 在飞 | 等设计冻结 | 已拍板未排期 | parked
tags: [...]
summary: <一句话，≤60 字>
related: ["[[<transcript-slug>]]"]
---

# <标题>

## 1 问题
用户视角的问题。不是"我们要建 X"，是"用户现在卡在哪"。

## 2 方案
用户视角的解法。

## 3 User Stories
**一长串编号列表**，`作为 <角色>，我想要 <能力>，以便 <收益>`。要铺得足够全，覆盖这个特性的所有面——这是后面 code-review 的 Spec 轴逐条比对的清单。

## 4 实现决策
要建/改的模块、它们的接口、技术澄清、架构选择、schema 变更、API 契约、具体交互。
**不写文件路径、不写代码片段**（它们烂得最快）。例外：用散文说不清的决策载体（状态机、schema、类型形状）可内联，注明出处。

## 5 测试决策

**先逐行过仪器矩阵**，标出这次改动碰到了哪几行、各自怎么验。碰不到的写「不涉及」，**别留空**——写不出对应仪器，就是还没想清楚要改什么。

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑 / 数据转换（taxonomy、评分聚合、状态机、判别式） | TDD 单元 | |
| API 契约（路由、schema、序列化） | TDD API 测试（走 ASGI） | |
| DB schema / 迁移 / 并发与事务语义 | **真 DB** 测试 | |
| LLM 输出质量（prompt 改动） | eval（promptfoo + 确定性 assert） | |
| 视觉正确性 | 截图对比（`design-port`） | |
| 端到端用户流程 | `qa:*` 浏览器测试 | |

判据是**能不能先写出一个会红的测试**。前三行能，所以走 TDD；后三行的输出是非确定的（LLM）或感知性的（视觉）或跨系统的（E2E），无从写红，falsifiable signal 是另一种仪器。

**缝里的情况按这条切**：prompt 改动本身走 eval，但 prompt 产出的**结构**（schema、字段存在性、枚举闭集）走 TDD。

然后写：

- **seam**（测在哪个公共边界上）——见下。
- **增量功能测试**：新行为的黑盒验收，用户视角、可证伪。写成 test-case 形态（前置/步骤/期望/覆盖），标明落在哪个页面下。
- **prompt / eval 变动**：改了哪些 prompt → 要加/改哪些 eval 轴。**没有就明写「无 prompt/eval 变动」**——这一块是裸 /plan 最常忘的，必须每次都过一遍。
- 既有同类测试的先例（照着谁写）。

### mock 只在系统边界

外部 API、数据库（**优先用测试库**）、时间/随机数、文件系统 —— 这些可以 mock。

**不要 mock 自己的类/模块/内部协作者。** 判别标志：*重构了、行为没变，测试却红了*。

> 存量代码大概率不符合这条，这是常态：典型形态是 `patch("app.services.X.SomeRepository.get_by_id")` —— 把自己的类替换在**另一个自己模块的 import 点**上，等于把测试钉死在"这个 service 恰好 import 了那个 repository、恰好调了那个方法"上，这种 mock 在真实代码库里往往成百上千处。
>
> **政策是只约束新增**：新写的测试守这条，存量不用一次扫完。如果某类 mock 其实是被环境问题逼出来的（比如某个模块一 import 就有副作用，测试环境没配好那个依赖），那是环境缺陷不是哲学问题，单独登记单独修。

## 6 Out of scope
明确的非目标。

## 7 关联
raw 素材、相关 spec、相关 ADR。
```

### seam 要先谈拢

写 spec 时把**准备在哪些 seam 上测**画出来：seam = 你能观察行为而不伸手进实现内部的那个公共边界。

**优先复用已有 seam，用能用的最高那层，seam 越少越好——理想是一个。** 需要新 seam 就提在尽可能高的位置。

把这些 seam 摆给人确认，再往下走。代码写之前谈拢的 seam，是测试能活过重构的原因。

## 3 建索引条目

刷新 `docs/spec/index.md` 和 `docs/raw/index.md`（表体从 frontmatter 生成）。

## 边界

- **不生成 ticket。** ticket 是开工时才建的临时凭据，`to-ticket` 的活。在这里建会让 ticket 提前堆积。
- **不写 ADR。** ADR 是 spec 归档时的总结，`dreaming` 的活。
- 综合过程中如果发现思考本身有洞，**停下来回 `grill`**，别在 spec 里粉饰。
