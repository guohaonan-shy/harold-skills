---
type: adr
status: 生效
tags: [idea-loop, wiki-conventions, link-sweep]
summary: link sweep 只查正文和 frontmatter 里的 wiki-link，行内代码和代码块里的格式示例不查
related: ["[[121]]"]
---

# ADR-0042 — link sweep 跳过代码里的格式示例

> 由 spec `link-sweep-skip-code` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop:wiki-conventions` 里 link sweep 的规则只写「grep `[[` 提取全部 slug，逐个确认文件存在」，没区分正文里的链接和代码里的示例。issue 原以为只有一份 spec 里一处模板占位写错；实测对 `docs/` 跑一遍，366 处 `[[...]]` 里指不到的有 17 条，其中 16 条是两份 spec 在行内代码和代码块里讲「档案对象的引用长什么样」的格式示例（如把引用写成 `[[<basename>]]`，或拿 `[[mkt-home#hero]]` 当反例），另 1 条是候选池里一条真断链（已另开 issue）。Obsidian 自己不把代码里的 `[[...]]` 当链接，sweep 却当了；每个跑 sweep 的人（dreaming 每次删 spec 后都跑）都得把这 16 条逐条认一遍。

## 2 决策（how）

- **改规则，不改 spec 里的示例。** 示例本该长成链接的样子，改掉等于改坏那两份 spec 已定的格式说明，而且以后写格式示例还会碰到。
- **按「在不在代码里」区分，不按「是不是 `<...>` 占位」**：16 条里只有 2 条是占位形状，别的示例照样会报。
- **规则内容**：行内代码（一对反引号之间）和代码块（三个反引号围起来的段落，含缩进的）里的 `[[...]]` 不算链接、不查；正文和 frontmatter 里的 `"[[...]]"` 照旧查（设计档案对象的 frontmatter 引用是真链接）。
- **只改规则文字，不加脚本**：sweep 本来就是一句由 agent 执行的规则，默认改动最小；以后要机械化再单独起。
- **plugin 版本不单独升**：单条规则的小修随集成时的 chore 统一升。

## 3 结果（result）

- `idea-loop/skills/productivity/wiki-conventions/SKILL.md` 的「slug 与链接」里，link sweep 一条已写明上述排除方式。
- `dreaming` 及其提议表参考只写「跑 link sweep」，自动跟上，没改。
- 合并为 PR #202，issue #121 已关闭。

## 取代线索

无。
