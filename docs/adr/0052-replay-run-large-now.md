---
type: adr
status: 生效
tags: [idea-loop, retro, evals, replay-run-large-now]
summary: 规则回放取消夜间队列，大用例 PR 开出后当场跑；输入不露题、Codex 当评委、核对改后用上了改动
related: ["[[2026-11-13-replay-verify-redesign]]", "[[0028-retro]]", "[[149]]", "[[174]]"]
---

# ADR-0052 — 规则回放：取消夜间队列，当场跑，并让结果更可信

> 由 spec `replay-run-large-now` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

规则回放（ADR-0028）当初按「付费会话占人的额度，所以放夜里」设计：大用例（会起插件 agent、开浏览器、调付费服务的）由 `idea-loop:implement` 在 PR 开出后放进夜间队列，每晚 00:00–07:00 由计划任务跑，结果靠计划任务的会话转发回 issue 会话。出了四个问题：

- **大用例只能等夜里。** `retro-replay.mjs --case <大用例>` 只打印「要进夜间队列」、退出码 3；人说「现在就跑吧」时没有正式的路，PR #162 里会话借测试用的 `--queue --now 2026-10-30T01:00:00` 假装凌晨跑掉。#173 记的是另一面：10-29 那晚计划任务被唤醒后没有回应，结果没送回会话，也没有通知兜底。人的方向：「夜间队列我觉的可以取消，skill修改的验证我倾向于直接在修改侧启动子代理来进行验证」。
- **输入告诉 agent 它在被测。** 每次回放的输入末尾带一句「这是一次无人值守的回放……做到「X」就停下」，工作目录也叫 `…/idea-loop-retro/<用例>/<时间>/before/project`。真实例子：#157 的回放用例跑了两次，改前、改后都答「是」，用例因此删掉。
- **评委和被评的同源。** 判定会话也是 `claude -p`。poteto（Lauren Tan）的 eval playbook 要求评委换模型家族、只看脱敏标签。
- **不核对改后那一遍用没用上改动。** skill 不一定被触发：LangChain 的测试里 prompt 提示了要用 skill，触发率也只到 70%。改后那一遍要是根本没加载改过的 skill，「改前否、改后是」说明不了规则生效。

## 2 决策（how）

最初只想加一条「人说现在就跑」的入口（`--run-large`）；PR #308 第 1 轮 review 之后人把范围扩了（#173 并入 #174，决定记录 [[174]] 题 2、[[149]]），讨论记录 [[2026-11-13-replay-verify-redesign]]。

- **取消夜间队列，大用例由编排者在 PR 开出后当场跑。** 跑前在会话里报三样（几个用例、每个最长约 3×45 分钟、每个约 1.05–3.50 美元，起 agent 的更高），不等人点头，后台跑、等它退出、读结果。人选的是「报完直接跑」（花钱的事，所以记为不自动）。
- **「在修改侧起子代理」落成 runner 起 `claude -p --plugin-dir`。** 同一会话里用 Agent 工具起的子代理只加载装好的那版插件，跑不了改前那一遍。
- **输入不露题。** worker 的输入只有用例里人当时的原话；「停在哪」只给评委看；用例 prompt 里不许出现回放、eval、judge、rubric、benchmark、评测、评委、判定，格式校验拒绝；工作目录改成随机串加项目仓库名。依据：人选了去掉那句话（决定记录 [[174]] 题 4）。
- **评委换 Codex，A/B 顺序每次随机。** 找不到 Codex 时退回 `claude -p`，开跑前打印一句、结果里记 `judge: claude`：回放是验收不是门禁，退回在结果里看得见即可。
- **runner 机械核对改后那一遍用没用上改动。** 读了、调了改动集里的 skill / agent / 参考文件之一才算；否则结果是新的 `not-exercised`（用例没测到改动），退出码 1，不算过。改动集为空（只改了脚本）记「不适用」。
- **跑回放的一方自己读两份产物，跟评委答案对照**，不一致时停下摆给人。这是判断，不加脚本。
- 取舍：四条改进（不露题、Codex 评委、核对用上、读产物对照）一度推荐另开 issue，人选了全部并进 #174，理由是影响这份 spec 交付的问题就在这个 PR 里修（这也是后来 #313 的来历）。没跟 poteto playbook 里的多候选并行和多条标准打分：我们的题是一道从人原话写出的是/否题，比打分窄。已知代价：白天跑回放占人的 Claude 额度，推翻了此前「付费回放放夜里」。

## 3 结果（result）

- runner `idea-loop/evals/retro/retro-replay.mjs`：`--run-large --pr <N> --worktree <dir>`；`--queue` / `--enqueue` / `--notify` / `--now` 已删（传了是未知参数，退出码 2）；评委走 Codex，A/B 随机，`result.json` 记 `judge`、`afterIs`、`exercised`。`idea-loop/evals/retro/replay.mjs` 的 `buildWorkerPrompt` 只返回用例 `prompt`；`cases.mjs` 有 `REVEALING_WORDS` 校验；`queue.mjs` 只留 review loop 条目的写法。
- 文档：`idea-loop:implement`「没活了就停下」读 `references/stop-and-resume.md`，里面是大用例跑前报三样、后台跑；`references/replay-result.md` 管读产物对照评委和按结果走；`idea-loop:implementer` 小用例同样对照；`idea-loop:setup` 的「规则回放 runner」装 runner、删旧计划任务 `idea-loop-retro-replay` 和 `~/.idea-loop/replay-queue/`。`issue-session` 里收夜间结果的那一段已删。
- 守护它的测试：`scripts/retro-run-large.test.mjs`、`retro-replay.test.mjs`、`retro-queue.test.mjs`、`retro-install.test.mjs`、`retro-case.test.mjs`、`codex-companion.test.mjs`、`implement-replay-large-doc.test.mjs`、`replay-codex-judge-doc.test.mjs`、`replay-exercised-doc.test.mjs`、`replay-read-products-doc.test.mjs`。
- 合并在 PR #308（分支 `issue/174-replay-run-large`）；决定记录随 PR #315 合并，见 [[174]]。issue #174 已 COMPLETED 关闭（2026-11-14）；#173 已并入并以 NOT_PLANNED 关闭。
