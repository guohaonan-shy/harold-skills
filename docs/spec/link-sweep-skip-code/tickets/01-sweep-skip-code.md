# 01 — link sweep 不把代码里的格式示例当链接

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的知识库约定（`idea-loop:wiki-conventions` 这个 skill 的「slug 与链接」一节）定义了 link sweep：删了文档之后，grep 出 `docs/` 里全部 `[[...]]`，逐个确认同名文件存在。现在这条规则不区分正文和代码，于是 spec 里用来说明「档案对象的引用长什么样」的示例（比如代码块里的 `page: "[[report]]"`、行内代码里的 `"[[<basename>]]"`）全被当成断链。对着现在的 `docs/` 跑，指不到的 17 条里有 16 条是这种示例，都在 `ui-state-archive` 和 `design-archive-sections` 两份 spec 里。

改完之后，照规则跑 link sweep 的 agent（`idea-loop:dreaming` 的执行段每次删 spec 后都按这条规则跑）只拿到真的断链：

- 行内代码（一对反引号之间）和代码块（三个反引号围起来的段落，含缩进的）里的 `[[...]]` 是格式示例，不查。
- 正文里的 `[[...]]` 和 frontmatter 里的 `"[[...]]"` 照旧查：设计档案对象的 frontmatter 引用是真链接。

只改这一条规则的文字。dreaming 的两处只写「跑 link sweep」、按 wiki-conventions 走，不改。两份 spec 里的示例不改：它们写成链接的样子是对的。不加脚本。plugin 版本号不在这一刀升（单条规则的小修，版本由集成时统一升）。

## 验收标准

- [x] wiki-conventions 的 link sweep 规则写明：行内代码和代码块里的 `[[...]]` 不算链接、不查；正文和 frontmatter 里的照旧查。
- [x] 照改后的规则对当前 `docs/` 跑一遍 link sweep，指不到的清单只有 `docs/records/retro-candidates/2026-10-31-handing-to-human-name-references.md` 里正文的 `[[577]]`（这条是真断链，归 #199，不在这张工单里修）；`ui-state-archive`、`design-archive-sections` 的 16 条示例都不出现。
- [x] 改动只在 wiki-conventions 这一个 skill 文件里；dreaming 的 SKILL.md 和 `references/proposal-table.md` 没动。
- [x] 那个 SKILL.md 主体仍在仓库 AGENTS.md 规定的 5000 字以内（改前已经超的，不因这次变得更长太多，并在交回里说明）。

## 选中的存量回归

无：改的是一条 skill 规则的文字，仓库里没有覆盖它的测试。
