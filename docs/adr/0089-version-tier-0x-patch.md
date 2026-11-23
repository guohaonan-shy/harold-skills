---
type: adr
status: 生效
tags: [review-md, plugin-version, version-tier-0x-patch]
summary: 插件还在 0.x 时，改已有流程的行为、老用法照样能用的也升 patch，minor 只留给大范围重构或使用方式的重大改动
related: ["[[0049-plugin-version-by-change]]", "[[327]]"]
---

# ADR-0089 — 插件 0.x 期间，改已有流程行为的 PR 升 patch

> 由 spec `version-tier-0x-patch` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

仓库根 `REVIEW.md`「额外要求」规定：改了某个插件目录下任何文件的 PR，按 major / minor / patch 升该插件 `.claude-plugin/plugin.json` 的 `version`（出处 [[0049-plugin-version-by-change]]）。原来的 minor 是「新增能力，或改了流程的行为但老用法照样能用」。会话照这条判，把改已有流程行为的 PR 判成 minor，人在合并前改回 patch。

2026-11-19 对着 origin/main `38622d38` 查：三档规则（2026-11-14）生效后，idea-loop 从没以 minor 合并过，每一次把版本写成 0.2.0 的提交最后都改回了 0.1.x。逐次 8 次：#314/PR #319（retro 摆候选给去处推荐）、#311/PR #317、#313/PR #321、#229/PR #329、会话开场注入规则（PR #330）、#291/PR #338（SEO 流程成批改自动执行）、#297/PR #352、#379/PR #382（夜间模式）；起草时判 minor（#291 当时题里推荐 patch），人定全是 patch。例：PR #321 只在 `decision-rules` 加一条「范围题怎么推荐」，被写成 0.2.0，人回「我选择B，然后版本用patch」，以 0.1.18 合并。issue #327 标题写「连续三次」，实测是 8 次。

根因：minor 按语义化版本写，凡改了行为就是 minor；人的判据不同，#311 retro 里的原话：「其实绝大部分改动都可以成为patch，只有大范围的重构或者重大使用姿势上的改动我觉的用minor是比较合适的。」规则文字和人的判据不一致，会话照文字判，每次都判错。

## 2 决策（how）

决定记录 [[327]]：候选池 11-14 批过的一版（加 skill、agent、hook 或成批改多个流程算 minor）与 #311 retro 原话冲突，人选了「B 只留给大改」：8 次人定都落在 B 里，#291、#379 正是 A 会判 minor 的那类，人都定了 patch。只改 `REVIEW.md`「额外要求」里 minor、patch 两条的措辞：

- **minor**：保留「新增能力，或改了流程的行为但老用法照样能用」，加：插件还在 0.x 时，只有大范围的重构或者使用方式的重大改动才算，比如整条流程重新划分阶段、人要重新学怎么调用。
- **patch**：加：插件还在 0.x 时，加 skill、agent、hook 或改已有流程的行为，老用法照样能用的，也算 patch。
- major 一条、「三档取最高」、版本号从 main 往上升、`scripts/plugin-version.test.mjs` 守漏升，都不动；「0.x」只写在 minor、patch 两条里，major 的判据（不改配置或用法就会坏）跟是不是 0.x 无关。夜里做 #327 时发现「报错里写了一步迁移」算不算 major 边界没写，人（2026-11-20）没推翻按 #291 的先例判 patch，不扩 scope、不改 major。

取舍（没做）：不把档位做成机械检查（档位要判断）；不回改已合并的版本号。代价接受：0.x 期间加新能力也只升第三位，看版本号看不出多了一个 skill，要读 PR。

## 3 结果（result）

- `REVIEW.md`「额外要求」的 minor、patch 两条是新文（2026-11-22 对着 c2b43c34 核），不碰任何插件目录。
- 合并在 PR #440（插件 0.x 期间，改已有流程行为的 PR 升 patch，不升 minor）；issue #327 已 CLOSED（2026-11-20）；决定记录 [[327]]。
- 候选池 `docs/records/retro-candidates/2026-11-14-version-tier-0x-behavior-patch.md` 已标注「已落地：minor 用的是 #327 spec 的新文」。
- 守护：没有测试（档位判不了）；`scripts/plugin-version.test.mjs` 只守漏升，不动。

**取代线索：** 本决定取代 ADR-0049 §2 里 minor、patch 两条的措辞（minor 的「加 skill、某流程从停下等人改成自己执行」例子，patch 的范围）；漏升由测试守、三档取最高、撞号等其余条文仍生效。
