---
type: raw
source_type: conversation
captured: 2026-11-24
title: "#420 triage：一个 setup 入口按模块分段"
tags: [issue-workflow, setup-modules]
related: ["[[setup-modules]]"]
---

#420 triage 会话（2026-11-24）里跟 Harold 定的。U 是人的原话（选择题记选中的选项，自由回答逐字），A 是 AI 的结论。现状对着 `origin/release/idea-loop-0.2.0`（283ed7da）核。

## A1

- issue 正文写的「三个 setup」在集成分支上只剩两个：`seo-setup` 已由 #340（提交 879e27ad）并成 `setup`「模块」一节的唯一一项「SEO」；设计从来没有单独的 setup，只是问人清单里「做不做 UI 设计」（配 Git LFS）和预检表里可选的 Mobbin 一行；`ai-eval:eval-setup` 还在另一个插件，`setup` 里 `grep eval` 零命中。
- `setup/SKILL.md` 主体 4496 字，`dyna spec skill-lint` 的线是 4500，只剩 4 字。#471 的 spec 要给 setup 加两步（超线就拆 issue），#247 要加「迁移」一节的指针。
- 题：#420 剩下做多大。

## U1

选「统一模块段 (Recommended)」：「模块」一节改成固定顺序设计 → SEO → 评测，每段一道「接 / 以后再说」；设计段把 LFS 问题和 Mobbin 从核心挪出来；评测段装了 ai-eval 就当场调 eval-setup，没装就提一句；顺带把正文压到线下，给 #471 两步留位置；进 0.2.0。

## A2

- #247 占 setup 的「迁移」一节（搬本机 0.1.x 的知识库、记忆、用户级 skill），要等 0.2.0 进 main、本机升级后才真跑，是最后一个 done 的子 issue；跟模块段只在篇幅上重叠。
- 题：要不要并进 #247。

## U2

选「不并，#420 先腾篇幅 (Recommended)」：各自独立；#420 负责把 setup 正文压到线下并做模块段，留出 #247 的一行指针和 #471 的两步；#247 照旧最后 done。

## A3

- `ai-eval:eval-setup` 写代码仓库根的 `EVAL.md`，ai-eval 其余 skill 也从根读；0.2.0 的 setup 把 idea-loop 的配置都写进 home 的项目目录。
- 题：评测段写出的 `EVAL.md` 放哪。

## U3

我在想seo、ai-eval 其实完全可以独立插件。design属于idea-loop的强依赖，有没有办法将design独立出来。

另外，0.2.0主要是基于home repo这种方式服务，那单个repo/project的形式要怎么支持呢？

## A4

- 独立程度（对着集成分支 grep skill 名与 dyna 命令）：ai-eval 不引用 idea-loop、不调 dyna，0 处，已经完全独立。seo 单向依赖 idea-loop：`dyna issues set` 5 处、`issue-triager` 3 处、`issue-session` 4 处、`wiki-conventions` 11 处；能拆成插件，但要在 `plugin.json` 的 `dependencies` 里依赖 idea-loop。design 双向：它用 `wiki-conventions` 17 处、`implement` 5 处等，idea-loop 的 to-spec、implement、pr-review、issue-session、dreaming 共 12 个参考文件和 38 个脚本文件也提到它；能拆，前提是 idea-loop 碰到设计阶段先看 design 装没装。这就是 #241 定的做法，实现在草稿 PR #250，Harold 2026-11-05 说暂缓。
- 单仓库：2026-11-15 home grill A1 定了「只保留 home 一种模式，单仓库是 home 与代码仓库合一的特例」。`dyna/internal/home/home.go` 只有 `IDEA_LOOP_HOME` 改路径，没找到「home 就是代码仓库」的判断：只有一个仓库的人跑 setup 照样建 `~/home`。在用的两个项目都在多仓库的本机上，找不到单仓库的真实用户，记成已知限制，不在 #420 范围，Harold 要做再单开 issue。
- `EVAL.md` 照 U3「ai-eval 完全可以独立插件」按留在代码仓库根、ai-eval 一字不改写，Harold 不同意再改。
- 题：#241 怎么处理。

## U4

选「保持暂缓 (Recommended)」：#420 只做模块段，按「插件装没装」来写，给以后拆留好接口；#241 留在 backlog，0.2.0 不动安装结构。

## 本轮决议

| 议题 | 决议 |
|---|---|
| #420 的范围 | setup「模块」一节改成设计 → SEO → 评测三段，各一道「接 / 以后再说」；正文压到线下给 #471、#247 留位置；进 0.2.0（U1） |
| 与 #247 | 不并；#420 先合、腾篇幅，#247 照旧最后 done（U2） |
| 模块怎么认 | 每段看对应插件的 skill 在不在本会话的 skill 清单里，以后 #241 拆了只换 skill 名（U4） |
| `EVAL.md` 放哪 | 代码仓库根，ai-eval 不改（U3 的「ai-eval 完全可以独立」，A4 说明，Harold 可推翻） |
| #241 插件拆分 | 保持暂缓，留在 backlog（U4） |
| 单仓库模式 | 已知限制，不在 #420；要做另开 issue（A4） |
