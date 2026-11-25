---
type: spec
tags: [idea-loop, retro, issue-session, pr-review]
summary: 回放用例「范围题推荐」的输入改成从 issue-session 进，让它测得到「边界」那一句范围题推荐法
related: [skill-change-verify]
issues: [478]
---

# 回放用例「范围题推荐」的输入从 issue-session 进

> #478 存在：用例 `scope-question-recommend` 的 prompt 是一段没有斜杠命令的普通讨论，三次重跑（2026-11-23）改后那一遍都没调 `issue-session`、没读 `pr-review` 的 review 标准，测不到 #280 改的那一句

## 问题陈述

### 1. 用例测不到要验的那句规则

#280（PR #468）把 issue-session「边界」那一句改成：范围题的推荐照 `pr-review` 的 `references/review-standards.md`「依据：只认四种」一节。验它的回放用例是 `idea-loop/evals/retro/cases/scope-question-recommend/`。

现状（对着 `origin/release/idea-loop-0.2.0` `0df934ff` 核，2026-11-25）：`case.json` 的 `prompt` 以「我在 guohaonan-shy/harold-skills#174 的 issue 会话里……」开头，是普通讨论。`annotations.md`「新插件重跑」一节记的三次（`20261123T074531`、两次 `20261123T075129`，合计约 $8.2）：一次过、一次改前就答「是」、一次评委无结论；三次的事件流里改后会话都没有 Skill 调用，没读 `review-standards.md`。改动核对记的「用上了」命中的是 `implement`、`retro`、`implementer`，不是这次改的那一句。所以 run 3 的「是」不能算那句规则的功劳。

### 根因

回放会话只拿到 prompt。不带斜杠命令，会话不会自己进 `issue-session`，「边界」那一句根本不在它眼前。

## User Stories

- **期望行为（对应问题 1）**：回放的改后那一遍从 `issue-session` 进入讨论，摆范围题前自己去读 `review-standards.md` 的范围题推荐法；评委判的是这条推荐法有没有让推荐变对。

## 方案

只改 `case.json` 的 `prompt` 和 `annotations.md`，不改 runner、不改规则。

- **prompt 开头**：待定（见「实现决策」），两种都把 #174 的位置、spec 路径、「已认领、在讨论里，开场那几步不用做」写清楚。回放会话没有 `gh` 登录（runner 的 `replayChildEnv`），万一它还去跑开场的 `gh issue view`，读不到、也写不了，不会去动真的 #174。
- **保留人当时的原话**：前情 1、2 和「这一轮我说的是：「……」」三段人原话一字不改，只换开头那一句（会话在哪）。`quote`（人在 #174 retro 里说的判据原话）和 `question` 不动。`annotations.md`「材料怎么拼的」加一条：2026-11-25 #478 把开头改成从 issue-session 进，哪句是补的、为什么补；原来 2026-11-14「不用斜杠命令开头」那条写明是针对 `/idea-loop:decision-rules`（等于替会话读了规则），这次的斜杠命令是 issue 会话的真实入口，推荐法仍要会话自己去读。
- **改动核对会被入口直接命中**：`issue-session/SKILL.md` 在改动集合里，prompt 以它的斜杠命令开头就算「用上了」。所以验收时另看事件流里改后那一遍有没有读 `review-standards.md`，写进结果。

## 实现决策

- **待定：prompt 开头怎么写**。依据：`annotations.md` 2026-11-14 人定「不用斜杠命令开头」，针对的是直接喂规则的斜杠命令；喂 issue 会话入口算不算同一类，两种读法都说得通。
  - **A（推荐）开头写斜杠命令**。改后 prompt 开头：
    > /idea-loop:issue-session 174
    >
    > 这个 issue 我已经认领了，会话就在它的分支上，对应的 spec 是 docs/spec/replay-run-large-now/replay-run-large-now.md，这个仓库就在当前目录。现在在讨论阶段，开场认领、归位、接分支那几步都不用再做。前情，下面是我自己的原话：……（后面不变）

    走一遍：会话一定进 issue-session，「边界」那一句在它眼前；推荐法在另一份文件里，读不读还是会话自己定，评委判的就是它。理由：喂的是 issue 会话的真实入口（调度、人接手都这样开），跟 11-14 去掉的「直接喂规则」不是一类。
  - **B 写成像人说的话**。改后 prompt 开头：
    > 我们接着 guohaonan-shy/harold-skills#174 这个 issue 的会话聊，issue 我已经认领了，在它的分支上，spec 是 docs/spec/replay-run-large-now/replay-run-large-now.md，仓库就在当前目录。前情，下面是我自己的原话：……（后面不变）

    走一遍：会话要自己从 skill 清单里认出「人要接手某个 issue」去调 issue-session；跟 11-23 的三次一样，很可能还是不调，用例照旧测不到。
- **验证：回放**。用 `retro-replay.mjs --case scope-question-recommend --base b64b8781` 跑 3 次（改前插件是 #280 之前、注入 `decision-rules` 的那版），按多数定；另记每次改后那一遍有没有读 `review-standards.md`。估价约 $2–3.7 一次，3 次约 $8（评委走 Codex）。

## 已知限制

- 同一输入下两边推荐都摇摆（11-14、11-15、11-23 三轮都记过），3 次只看趋势；这次只解决「测不测得到」，不解决摇摆。

## 关联

- [[skill-change-verify]]：回放用例的写法与验收规则。
- #280（PR #468）：被验的那句规则；#331：0.2.0 父 issue。
