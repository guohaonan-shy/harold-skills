---
type: raw
source_type: conversation
captured: 2026-11-17
title: eval 写法的形状：把 toeflair 的 ai-eval 迁进 harold-skills，再补规则
tags: [ai-eval, ai-eval-plugin]
related: ["[[0061-ai-eval-plugin]]"]
---

> 格式：U 是人的原话，逐字保留；A 是 AI 的结论与发现，取证过程略去。讨论发生在 harold-skills#293 的 triage 会话里。

## A1

查了 toeflair 本地 main（`c15e2dd4`，2026-11-16）。仓库里已经有一个 `ai-eval` 插件，在 `.claude/plugins/ai-eval/`，有 6 个 skill（eval-setup、eval-samples、eval-baseline、eval-run、eval-judge、eval-metrics-review），另有 9 个带测试的 `.mjs` 脚本，合计 3,193 行。它的 plugin.json 写着项目无关，稳定了再迁到个人 marketplace。最近这段时间它有 33 个提交。

它跟 #293 已经重叠的部分：

- 门槛对基线。准出标准写的是「候选对基线，同一个 scorer 同一个样本分对分」。
- 每个样本跑 3 份。
- 判官分数用配对差加标准误判退步，算法在 `paired-stats.mjs`。

它缺的部分：

- pass¹/pass³ 的叫法和定义。
- 平台报错先重跑，再算数。评测程序有 `--retry-failed`，但 skill 没把它写成算数之前必须做的一步。
- 回放型 eval。

那次给工具调用加参数的 eval 不在它的框架里：ai-eval 的单位是「用户任务 → 跑产品流水线」，那次是截一步对话直接调模型。

给了三个选项，推荐「迁 ai-eval + 补规则」：

- 迁 ai-eval，同时把规则补进去，回放型 eval 新开一个 skill eval-replay。
- 在 idea-loop 新开一个 skill。
- 先迁，规则另开 issue。

## U1

（选择题的回答）迁 ai-eval + 补规则 (推荐)

## A2

spec 草稿里留了一题：toeflair 那边的切换（更新 EVAL.md、改装法、删副本）谁来做。A 是另开 issue 做，B 是这个 issue 两个仓库各开一个 PR。推荐 A。

## U2

这个事儿在harold-skills 开issue，toeflair项目暂时用旧的，两个不相互冲突～

## 本轮决议

| 议题 | 决议 |
|---|---|
| eval 写法放哪 | toeflair 的 `ai-eval` 整个迁成 harold-skills 的一个 plugin。pass¹/pass³、报错重跑写进它的准出与报告，回放型 eval 新开 skill `eval-replay`。to-spec 那一行指向它 |
| toeflair 那边的切换 | 在 harold-skills 另开 issue（#361，被 #293 挡着）；迁移期间 toeflair 继续用旧副本 |
