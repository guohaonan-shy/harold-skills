---
type: adr
status: 生效
tags: [idea-loop, retro, evals]
summary: 新增 retro skill 从会话记录提炼规则候选逐条给人批；改规则用回放用例（改前否、改后是）证明生效
related: ["[[2026-10-22-retro-grill]]", "[[2026-10-19-pr-decision-friction]]"]
---

# ADR-0028 — retro：从会话里的纠正与决定提炼规则，并证明规则真的变了

> 由 spec `retro` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

- 人在 issue 会话里的纠正、追问、对摆好的题的选择，会话一归档就丢。唯一一次提炼规则（`decision-rules` 的来源）是 2026-10-19 手工翻 6 个审核会话和 10 个已合并 PR 做的，下一类重复的事要等人再手工翻一次。
- 规则改完没法证明 skill 真的变了：仓库当时只给 `uiux-research` 开了 eval 例外；子代理加载的是装好的旧版插件，验不了分支上的改动，只有 `claude -p` 加 `--plugin-dir` 能跑分支版本。

## 2 决策（how）

- **独立 skill，读会话记录，不靠 dreaming 读 PR 归档。** 原先设想由 dreaming 定期读 PR 归档；grill 里人定为独立 skill、直接读本机会话记录文件（会话压缩后原话仍在文件里）。issue 会话收尾时由 `issue-session` 调它，人也能随时手动调。
- **三种信号、三种门槛。** 纠正与追问、人自己说的方向：出现一次就提（skill 已经做错，等不起第二次）；对摆好的题的选择：跨 issue 同一类至少 2 次且无反例才提。`decision-rules` 里「不自动的」那几类即使重复也不提成「自己定」的规则。
- **只出候选，不改规则文件。** 候选逐条摆给人批；落点分三层：插件本身、目标仓库的规则文件、能机械判定的优先做成检查。
- **决定记录进目标仓库。** 每个 issue 一份 `docs/raw/decisions/<号>.md`，记摆过的每道题和候选结果，供以后数次数、认出被驳回的候选。
- **规则改动的验收分两种。** 能机械判定的做成检查，且先在历史错误上看它变红；要判断的写回放用例（决策发生时的提交、当时的 prompt、停在哪、一道从人原话写出的是/否题），用主分支与 PR 分支的插件各跑一遍再由判定会话作答，改前「否」、改后「是」才算过，改前就「是」判成用例没抓住问题；人可推翻判定，记入用例旁的 `annotations.md`。
- **回放按大小分跑。** 只驱动一个 skill、不起 agent、不开浏览器、不调付费服务的是小的，实现完当场跑；其余是大的，进夜间队列，每晚本机时间 00:00–07:00 之间由 setup 建的计划任务跑，结果写进 PR 的 review loop 文件。
- 仓库根 `AGENTS.md` §5 加第二个 eval 例外：回放不打分，只判一条规则对应的那个点，是规则改动的验收而非质量基线。

## 3 结果（result）

- skill `idea-loop/skills/productivity/retro/`（可被模型调用，`issue-session` 收尾调它），参考资料分会话记录压缩、决定记录格式、候选池三份；压缩脚本 `session-digest.mjs`。
- 回放：`idea-loop/evals/retro/`（runner、`cases.mjs` 用例格式校验、`queue.mjs` 队列、`cases/` 下的真实用例）；runner 由 `retro-install.mjs` 拷到 `~/.idea-loop/bin/` 固定路径，`setup` 的「夜间规则回放」一节建夜间计划任务并打印允许规则让人自己加；`implement` / `implementer` 对改规则的工单要求跑回放。
- 决定记录目录 `docs/raw/decisions/` 已在本仓库使用。

## 取代与演变

- retro 批了就开 issue 这一步已被 `retro-candidate-pool` 的决定改为「进候选池或开 issue 由人选」，见 ADR-0030。
- 取会话记录时按当前目录定位的做法已被 ADR-0032 取代。
- spec 中引用的 `idea-loop:spec-status` 已在 issue 模型重做后并入 `idea-loop:issues`；不影响本决策。
