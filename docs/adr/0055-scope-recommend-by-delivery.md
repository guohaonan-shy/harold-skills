---
type: adr
status: 生效
tags: [idea-loop, decision-rules, scope, scope-recommend-by-delivery]
summary: 范围题按「影不影响这次交付」推荐：影响 spec 实现或上线的并进当前 PR，其余不进
related: ["[[174]]", "[[313]]", "[[0036-decision-rules-who-decides]]"]
---

# ADR-0055 — 范围题按「影不影响这次交付」推荐

> 由 spec `scope-recommend-by-delivery` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

范围题是会话中途冒出一处改动时摆给人的那道题：并进当前 PR，还是另开。`idea-loop:decision-rules` 的「要人定的写成一道题」只要求「给推荐和一句理由」，没说推荐哪边，会话就按「PR 小、好 review」推荐拆开，跟人看重的「这次交付能不能用」相反。

真实例子：#174 的会话里讨论回放怎么验证，冒出四条改进（回放输入不露题、Codex 当评委、核对用上了改动、编排者读产物）。题 5 推荐「#174 只做取消夜间队列，四条另开 issue」，人选了「全部并进 #174」。其中第一条正是 #157 的用例改前改后都答「是」的原因，不改它，#174 交付的回放照样出同样的错。同一类选择在决定记录里出现 6 次（[[174]]、`55`、`149`、`125`、`266`、`180`，2026-11-14 逐份读过），人都选了并进当前 PR、没有反例；推荐被推翻的 4 次都是推荐拆开，推荐并进的 2 次人照推荐选。人在 #174 的 retro 里给出判据：「影响这个spec实现的问题在这个pr里修复，上线会有影响的重要问题在pr里修，其余的按照我们的流程进入候选」。

## 2 决策（how）

- **在 `decision-rules`「要人定的写成一道题」里，「给推荐和一句理由」之后加一条**：范围题，冒出的问题影响这份 spec 的实现、或者上线后会有影响的，推荐在当前 PR 里修；其余的推荐不进当前 PR，交回调用方自己的流程。仍是一道题，由人选。放在这一节而不是「核心」：它改的是推荐，不改「范围题要问人」这件事。
- **「其余的」的去处写「交回调用方自己的流程」，不写 issue 里原写的「进候选池」。** 人的原话是「按照我们的流程进入候选」，没说候选池；候选池在 `idea-loop:retro` 里专指规则候选，问题本身的去处是 issue。照 `decision-rules`「核心」已有的原文写，不新造去处。
- **`idea-loop:issue-session` 的「边界」补一句**：任何时候停下问人（包括讨论中冒出的范围题），先对 `idea-loop:decision-rules`。范围题常在 issue 会话的自由讨论里冒出，那里原本没有哪一步要求先读它；回放里改后那一遍没读规则，正是这个缺口。人定于 2026-11-15，作为开场注入（#326）落地前的过渡。
- **回放用例分不出改前改后，人定规则照合、用例留作抽样。** 用例 `decision-rules-scope-recommend`（提交 `314a633`，#174 讨论时仓库的样子）用新版 runner 重跑三次：一次过、一次改后没读规则（`not-exercised`）、一次改前已推荐并进；模型把四条改进归成「影响实现」还是「不影响」本身不稳。人选了「照合、留作抽样」（决定记录 [[313]] 题 3），没有为了让旧版失败去调输入，理由是调出来测的是输入、不是规则；真实证据看以后的决定记录。
- 取舍：没把 `decision-rules` 整体改成开场常驻放进这次：它影响的是整份 skill 怎么被读到，不影响这份 spec 的实现，另开 #326（决定记录 [[313]] 题 4，正是按新规则交回流程）。「影响实现」「上线有影响」怎么判的细则没写，先用人的原话，判得不对再从 retro 收。
- idea-loop 按 patch 升（起草时按 `REVIEW.md` 判 minor，人定 patch；合并前 main 到了 0.1.17，从它升到 0.1.18）。

## 3 结果（result）

- `idea-loop/skills/productivity/decision-rules/SKILL.md`「要人定的写成一道题」里有那条范围题规则；`idea-loop/skills/engineering/issue-session/SKILL.md`「边界」有「任何时候停下问人（包括讨论中冒出的范围题……），先对 `idea-loop:decision-rules`」；`idea-loop/README.md` 同步。
- 守护：回放用例 `idea-loop/evals/retro/cases/decision-rules-scope-recommend/`（case.json 与 annotations.md，含三次重跑记录和「人定照合、留作抽样」），用例格式由 `retro-case.test.mjs` 校验；因为用例不稳，没有任何测试能机械钉住这条规则的效果，只有抽样。
- 提交 `4feddbc`（规则）、`4800a97`（issue-session 指针）；合并在 PR #321（分支 `issue/313-scope-recommendation`），决定记录随 PR #328 合并，见 [[313]]。issue #313 已 COMPLETED 关闭（2026-11-15）。
- #326（开场由 SessionStart 钩子注入 `decision-rules`）已落地（PR #330，`idea-loop/hooks/hooks.json`），那份 spec 里说 issue-session 的这条指针「落地后可删」；对账时指针仍在 `issue-session/SKILL.md` 第 67 行。
