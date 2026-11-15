---
type: adr
status: 生效
tags: [idea-loop, knowledge-base, issue-workflow]
summary: 一个需求的 spec、设计、工单跟代码同一个分支、同一个 PR 合进主分支；setup 问知识库放仓库里、仓库外还是不要
related: []
---

# ADR-0050 — 知识库改动跟代码一个 PR，setup 问要不要知识库

> 由 spec `docs-ride-code-pr` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

0.1.9 里，一个碰 UI 的需求走完要开三个 PR：审核阶段一个只改 `docs/` 的 spec PR，设计冻结后一个只改 `docs/` 的设计 PR，最后才是实现 PR。原因是「下一段从主分支开分支」是下一段拿到上一段产出的唯一路径，所以每一段的产出都得先合进主分支。代价是需求后来放弃或改方向，主分支上已经留着半成品 spec 和画布，别的 worktree 读到的也是它们。

另一半问题：`setup` 不问就在仓库里建 `docs/` 骨架，仓库要照公司标准维护时，人没有办法说「知识库不放这里」。

issue 标题还写了「知识库绑在代码仓库里」那一半（业务根目录、知识库独立成仓库）。人在 2026-11-05 定了范围：不搬知识库，单仓库模式照旧；只做上面两件。

## 2 决策（how）

- **一个需求一个工作分支、一个 PR。** spec、raw、冻结的设计、工单、设计档案归档都提交在这个分支上，跟代码一起合进主分支；不再有 spec PR、设计 PR。一个分支从审核用到实现，不再按阶段起 `spec/`、`design/`、`impl/` 分支（现行分支名 `issue/<号>-<slug>` 见 `issue-session`）。
- **规则只写一处**：`wiki-conventions` 新增「知识库落地」一节，别的 skill 写「照 `idea-loop:wiki-conventions` 的『知识库落地』」。
- **没有代码可跟的，照旧自己开只改 `docs/` 的 PR，检查全过就合**：父 issue 拆完子 issue（子 issue 的会话从主分支读父 spec）；验证为不存在或人决定不做的 issue；dreaming 的执行段；不在 issue 会话里的 retro 决定记录。合并改了代码的 PR 仍要人说，护栏不变。
- **setup 加一题「要不要知识库、放在哪」**，三选一：仓库里的 `docs/`（推荐，照旧）、仓库外的目录或仓库（不建骨架，`## idea-loop` 块记位置，人照原格式维护）、不要。idea-loop 的 skill 只读写仓库里的 `docs/`，后两种在交回时说清 spec、设计、dreaming 在这个仓库里用不了。

没做：知识库搬出代码仓库、业务根目录、多仓库共用一份知识库、skill 读写仓库外的知识库。原因是人当时只定了「问一句、记位置」，不搬；那版实现（分支 `impl/business-knowledge-base`）的 PR #251 关闭。

## 3 结果（result）

- `idea-loop/skills/productivity/wiki-conventions/SKILL.md` 有「知识库落地」一节，含「没有代码可跟」的清单；`idea-loop/skills/engineering/setup/SKILL.md` 的「写」一节与 `setup/references/questions.md` 有三选一的知识库题。
- 守护：`idea-loop/scripts/knowledge-base-landing-doc.test.mjs`（旧说法「设计 PR」「spec PR、设计 PR」不再出现，各入口指向「知识库落地」）、`setup-single-source.test.mjs`。
- 合并在 PR #254「idea-loop 0.1.10：spec、设计跟代码一个 PR；setup 问要不要知识库」（2026-11-05）。issue #244 在 2026-11-13 以 NOT_PLANNED 关闭，原因是它的原方案（业务根目录）已被推翻、跟 #252 重复；上面两件落地的部分是它的子集。
- 没做的那一半（知识库独立成仓库、按需装）由 #252 继续跟，仍开着。
