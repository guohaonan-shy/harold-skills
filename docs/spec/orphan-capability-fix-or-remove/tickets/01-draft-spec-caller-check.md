# 01 — 起草修坏能力的 spec 时查调用方，查不到就写「待定：修好还是删掉」

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

issue 会话照 issue-session 的「起草 spec」参考起草 spec 时，提交前要过「自己校验」清单。现在清单第 7 条「现状和范围查清了」只要求把同一行为的其他入口逐个标纳入或排除，不要求查这个能力有没有人在用，于是一个坏掉、没人用的能力会被默认按修好起草（真实例子：一个报告历史接口的按分数排序坏了，起草时已经写了「学生端没有入口触发」，仍按修好起草，人追问「这是哪里在用」才改成删掉，spec 重写了一次）。

这张工单让第 7 条多出一句：spec 是修一个坏掉的能力的，查过它有没有调用方（界面入口、前端请求、别的服务、脚本或定时任务），查到的写进「方案」；一个都查不到，「实现决策」里有一条「待定：修好还是删掉」，两个选项各配例子和代价，不默认按修起草。待定的写法已由第 6 条指向 `idea-loop:decision-rules`，这里不复述。只在第 7 条加这一句，不新开条目，不改 `to-spec`。

同时加一个 retro 回放用例，证明这句话让起草出的 spec 变了：

- 用例名 `draft-spec-orphan-capability`，照同目录的 `to-spec-diagnose-agent-docs` 写。
- 输入是另一个仓库（Toeflair，GitHub `guohaonan-shy/Tofelair`，本机 checkout 在 `/Users/guohaonan/projects/TOFEL-demo`）在当时 spec 起草前的提交 `b9602e50`；prompt 把 Toeflair#430 的原文（`gh issue view 430 -R guohaonan-shy/Tofelair`）交给 issue 会话的起草步骤：调 `/idea-loop:to-spec` 起草，再照 issue-session 的「起草 spec」参考自校验；回放禁 git 提交、推送和 gh 写操作，停在 spec 草稿写好、交给人看的那一刻。
- 是/否题：spec 有没有把「修好还是删掉」写成一条待定，依据是查过按分数排序和最低分过滤没有任何调用方？原话：「分数排序是哪个部分使用，我在前端都没有看到」。
- 大小 small：只驱动 to-spec 一个 skill、不起插件 agent、不开浏览器。
- `source` 里写明：用例的提交在 Toeflair，只能当场用 `--case draft-spec-orphan-capability --repo <Toeflair 本地 checkout> --worktree <本 worktree>` 跑，夜间队列取不到。

## 验收标准

- [ ] 「起草 spec」参考的「自己校验」第 7 条含上面那句（调用方的四类、查不到写待定、两个选项各配例子和代价、不默认按修），其他条目不变
- [ ] 回放用例 `draft-spec-orphan-capability` 的 `case.json` 通过用例格式校验（`node --test` 跑 retro 的测试全绿），旁边有 `annotations.md`
- [ ] 当场跑一次回放：改前「否」、改后「是」，判定的出处摘进交回；没过就照实交回，不改规则硬凑
- [ ] 全量测试 `node --test '*/scripts/*.test.mjs'` 全绿（含插件不出现项目信息的检查；`evals/` 下的用例是允许的例外）

## 选中的存量回归

- `idea-loop/scripts/no-project-leak.test.mjs`：改的是插件里的参考文字，要确认没把 Toeflair 的名字写进 `evals/` 以外的地方。
- `idea-loop/scripts/issue-group-skills.test.mjs`：守着 issue-session 及其参考的结构，改参考文字时可能碰到它的断言。
