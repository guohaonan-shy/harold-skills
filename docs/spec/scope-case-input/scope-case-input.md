---
type: spec
tags: [idea-loop, retro, issue-session, pr-review]
summary: 回放用例「范围题推荐」的输入改成从 issue-session 进，让它测得到「边界」那一句范围题推荐法
related: ["[[skill-change-verify]]"]
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

## 方案

只改 `case.json` 的 `prompt` 和 `annotations.md`，不改 runner、不改规则。

- **prompt 开头照当时的现场**：#174 原会话（`~/.claude/projects/-Users-guohaonan-projects-TOEFLAIR-worktree-harold-skills-fervent-carson-14cb4a/3a64ac9f-….jsonl`）11-13 13:46:59 由调度卡片开出，任务原文让它「用 Skill 工具调 idea-loop:issue-session，参数 174」，13:47:02 调了，15:00:40 人才说「我们先根据最新的scope讨论下……」。所以用例开头用这段任务原文，把「按它从开场做起」换成「已认领、在分支上、PR #308 跑过第 1 轮 review、现在在讨论阶段，开场那几步不用再做」（回放只能从 15:00 那一刻接上，13:48–14:39 的 to-spec、实现、review 重演不了）。原文括号里的 #174 标题去掉了：标题含「规则回放」，runner 拒收会让被测会话看出自己在被测的词（`cases.mjs` 的 `REVEALING_WORDS`）；标题只是 issue 的名字，不含要验的规则（review 第 1 轮 S1，人 11-25 选 A）。回放会话没有 `gh` 登录（runner 的 `replayChildEnv`），它万一还跑开场的 `gh issue view`，读不到、也写不了。
- **保留人当时的原话**：前情 1、2 和「这一轮我说的是：「……」」三段人原话一字不改，只换开头那一句（会话在哪）。`quote`（人在 #174 retro 里说的判据原话）和 `question` 不动。`annotations.md`「材料怎么拼的」加一条：2026-11-25 #478 把开头改成从 issue-session 进，哪句是补的、为什么补；原来 2026-11-14「不用斜杠命令开头」那条写明是针对 `/idea-loop:decision-rules`（等于替会话读了规则），这次的斜杠命令是 issue 会话的真实入口，推荐法仍要会话自己去读。
- **改动核对会被入口直接命中**：`issue-session/SKILL.md` 在改动集合里，prompt 一开头就调它，就算「用上了」。所以验收时另看事件流里改后那一遍有没有读 `review-standards.md`，写进结果。

## User Stories

- **期望行为（对应问题 1）**：回放的改后那一遍从 `issue-session` 进入讨论，摆范围题前自己去读 `review-standards.md` 的范围题推荐法；评委判的是这条推荐法有没有让推荐变对。

## 实现决策

- **prompt 开头用 #174 原会话的任务原文**（人 2026-11-25 定，在本会话里）：人问「将当时的上下文内容进行回放才是正经能判断yes/no吗？」，看过原会话的时间线后说「没问题」。11-14「不用斜杠命令开头」去掉的是直接喂要验的规则（`/idea-loop:decision-rules`），当时的现场没有这一步；issue-session 当时开场就加载了，补上它是还原现场。范围题推荐法在 `review-standards.md`，仍要会话自己去读。
- **验证：回放**。用 `retro-replay.mjs --case scope-question-recommend --base b64b8781` 跑 3 次（改前插件是 #280 之前、注入 `decision-rules` 的那版），按多数定；另记每次改后那一遍有没有读 `review-standards.md`。估价约 $2–3.7 一次，3 次约 $8（评委走 Codex）。

## 测试决策

- 回放用例本身就是被改的对象；验法见「实现决策」的「验证：回放」（跑 3 次按多数定，另记改后那一遍有没有读 `review-standards.md`）。

## Out of scope

下面几件记成已知限制，这次不做：

- **用例仍分不出改前改后**（2026-11-25 三次回放：改前 3 次「是」、改后 3 次「否」，见用例 `annotations.md`「从 issue-session 进场后的三次」）。人 11-25 定：这个 PR 只交付「进得了场」，不另开 issue；用例留作抽样。
- **回放会话能拉到真仓库的最新代码**：runner 只把项目拷贝 `origin` 的推送地址指向空处，拉取地址还是真仓库，第 2 次改后那一遍 `git fetch origin main` 拉到了 11-25 的主分支。改拉取地址会碰到靠 `origin` 认仓库名的 skill，要单独设计。人 11-25 定：记成已知限制，不另开 issue。
- 同一输入下两边推荐都摇摆（11-14、11-15、11-23 三轮都记过），3 次只看趋势；这次只解决「测不测得到」，不解决摇摆。

## 关联

- [[skill-change-verify]]：回放用例的写法与验收规则。
- #280（PR #468）：被验的那句规则；#331：0.2.0 父 issue。
