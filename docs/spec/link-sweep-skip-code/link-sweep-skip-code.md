---
type: spec
status: 完成
tags: [idea-loop, wiki-conventions, link-sweep]
summary: link sweep 只查正文里的 wiki-link，代码里的格式示例不算，不再报一串假阳性
related: ["[[ui-state-archive]]", "[[design-archive-sections]]", "[[dreaming-design-reconcile]]"]
issues: [121]
---

# link sweep 跳过代码里的格式示例

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #121 docs：ui-state-archive spec 里的模板占位写成了 wiki-link，link sweep 报假阳性 | 存在 | 照规则对 `docs/` 跑 link sweep，指不到的有 17 条，不是 1 条；其中 16 条是两份 spec 行内代码和代码块里的格式示例，详情在「问题」 |

## 问题

### 1. link sweep 把 spec 里的格式示例当成断链，一跑就是 16 条假阳性

2026-10-31 对着 `main`（cb11785）照 `idea-loop:wiki-conventions` 的写法跑了一遍 link sweep：grep 出 `docs/` 下全部 366 处 `[[...]]`，逐个找同名文件。指不到的 17 条，按所在位置分：

| 位置 | 条数 | 例子 |
|---|---|---|
| `ui-state-archive` 的代码块（§4.3 的 frontmatter 形状、§4.4 的决定条目模板） | 12 | `page: "[[report]]"`、`- 来源：[[<spec-slug>]]` |
| `ui-state-archive` 的行内代码 | 1 | 引用一律写成 `"[[<basename>]]"` |
| `design-archive-sections` 的行内代码 | 3 | `"[[mkt-home#hero]]"`（这份 spec 举它当「不该这样写」的反例） |
| 正文 | 1 | `records/retro-candidates/` 里一条候选写的 `[[577]]` |

前 16 条都是在说明「档案对象的引用长什么样」，本来就该写成 `[[...]]` 的样子，`report`、`QuestionTabs` 这些是示例里虚构的页面和组件，不会有对应文件。按现在的规则，每个跑 sweep 的人（dreaming 的执行段每次删 spec 后都跑）都得把这 16 条逐条认一遍「是示例，不是我删出来的」。

复现材料：`.tmp/to-spec/link-sweep-placeholder/repro/`（全部链接、指不到的、每条所在位置）

### 根因

规则只写了「grep `\[\[` 提取全部 slug，逐个确认文件存在」，没区分正文里的链接和代码里的示例。Obsidian 自己不把行内代码、代码块里的 `[[...]]` 当链接，sweep 却当了。

修正：issue 原先认为只有 `ui-state-archive` 里 `[[<spec-slug>]]` 这一处、是它写错了；实测同一份 spec 还有 12 条，另一份 spec 还有 3 条，都在代码里，写法本身没错，错在 sweep 的规则。

## 方案

跑 link sweep 的人得到的清单里只剩真的断链：代码里（行内代码、代码块）的 `[[...]]` 是格式示例，不算链接，不查。正文里的 `[[...]]`、frontmatter 里的 `"[[...]]"` 照旧查（设计档案对象的 frontmatter 引用就是真链接）。

同一行为的入口：

- `idea-loop:wiki-conventions` 的「slug 与链接」：link sweep 的唯一定义处。**纳入**，改的就是这一条。
- `idea-loop:dreaming` 与它的 `references/proposal-table.md`：只写「跑 link sweep」，按 wiki-conventions 走。**纳入**，不用改文字，自动跟上。
- 两份 spec 里的 16 条示例：**排除**，不改写（理由见 Out of scope）。

## User Stories

只修问题，不画树。

1. 期望行为（对应问题 1）：对现在的 `docs/` 跑 link sweep，清单里只有正文那 1 条 `[[577]]`，16 条代码里的示例都不出现。

## 实现决策

- **改 sweep 的规则，不改 spec 里的示例**。依据：`ui-state-archive` §4.3 定了档案对象的引用「一律写成 `"[[<basename>]]"` 字符串」，`design-archive-sections` 拿 `"[[mkt-home#hero]]"` 当反例讲，这些示例就该长成链接的样子；把它们改掉（去掉括号、换成别的写法）等于改坏这两份 spec 已定的说明。以后的 spec 写格式示例也会碰到同一个问题，只改这几处治不了。
- **按「在不在代码里」区分，不按「是不是 `<...>` 占位」区分**。issue 提了后者，但 16 条里只有 2 条是 `<...>` 形状，`[[report]]`、`[[QuestionTabs]]` 这种示例照样会报。
- **只改规则文字，不加脚本**。依据：自己定的第四条「默认改动最小」；sweep 现在就是一句规则、由 agent 执行，没有脚本。规则里写明怎么排除：行内代码（一对反引号之间）和代码块（三个反引号围起来的段落，含缩进的）里的不算。
- plugin 版本不在这次升。依据：仓库现有做法，单条规则的小修不单独升版本（如 5a532ab「session-digest locate 只认这场会话自己的记录」），版本由集成时的 chore 提交统一升（如 bf6f6fa）。（切票时改：起草时写的是「随改动一起升」，查了现有做法后改掉。）

## 技术方案总览

### 后端

不涉及。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 不涉及：改的是规则文字，没有代码 |
| API 契约（路由、schema、序列化） | TDD API 测试 | 不涉及 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及：一句规则的措辞，照仓库 §5 不做 eval |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：link sweep 交出的那份「指不到的链接」清单。抓得到：代码里的示例有没有被排除、正文里的断链有没有漏掉；抓不到：执行 sweep 的 agent 下次会不会照新措辞做。
- **增量功能测试**：
  - 前置：`main` 上现在的 `docs/`。
  - 步骤：照改后的 wiki-conventions 规则跑一遍 link sweep。
  - 期望：清单只有 `records/retro-candidates/2026-10-31-handing-to-human-name-references.md` 的 `[[577]]`（正文里的那条，归 #199）；`ui-state-archive`、`design-archive-sections` 的 16 条都不在。
  - 覆盖：期望行为 1。
- **prompt / eval 变动**：无 prompt/eval 变动。
- **照着谁写**：无同类先例；复现时用的位置判断脚本思路可参考 `.tmp/to-spec/link-sweep-placeholder/repro/context.txt` 的分类结果。

## Out of scope

- 改写 `ui-state-archive`、`design-archive-sections` 里的 16 条示例：它们是这两份 spec 已定的格式说明，写成链接的样子是对的。
- 正文里的 `[[577]]`（retro 候选引了 Toeflair 仓库里的决定记录，本仓库没有这份文件）：是真断链，跟 sweep 规则无关，已开 #199。
- 给 link sweep 写脚本：现在没有脚本，这次只改规则；以后 sweep 要机械化再单独起。

## 关联

- 覆盖：#121 docs：ui-state-archive spec 里的模板占位写成了 wiki-link，link sweep 报假阳性
- 相关 spec：[[ui-state-archive]]（实现中，示例所在）、[[design-archive-sections]]（示例所在）、[[dreaming-design-reconcile]]（实现中，执行段跑 link sweep，规则改了自动跟上，不冲突）
- 相邻还没完成的 spec 与 issue：查过 open issue 与未完成的 spec，没有别的在改 link sweep 或 wiki-conventions 的「slug 与链接」，无重叠。
