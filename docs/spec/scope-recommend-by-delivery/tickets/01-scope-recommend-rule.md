# 01 — 范围题按「影不影响这次交付」推荐，并留回放用例

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

会话中途冒出一处改动、摆给人「并进当前 PR，还是另开」这道题（范围题）时，推荐哪一项现在没有规则，会话按「PR 小、好 review」推荐拆开；人的历史选择 6 次都是并进，推荐被推翻 4 次。改完：idea-loop 的 `decision-rules` skill 在「要人定的写成一道题」一节里，紧接「给推荐和一句理由」之后多一条，内容为（逐字）：

> 范围题（冒出的改动并进当前 PR，还是另开）：冒出的问题影响这份 spec 的实现，或者上线后会有影响，推荐在当前 PR 里修；其余的推荐不进当前 PR，交回调用方自己的流程。

人的原话（规则的来源，#174 的 retro）：「影响这个spec实现的问题在这个pr里修复，上线会有影响的重要问题在pr里修，其余的按照我们的流程进入候选」。

同时在 idea-loop 的 retro 回放用例目录下新增用例 `decision-rules-scope-recommend`，照现有用例 `retro-pool-choice` 的形状（`case.json` + `annotations.md`）：

- 提交：`314a633`。
- 输入：取自 `docs/raw/idea-loop-decisions/2026-11-13-replay-verify-redesign.md` 的人的原话（U1、U2 作为前情，U3「我们先根据最新的scope讨论下，skill的改动如何验证，参考potato关于这个的观点，我们来讨论下，然后看怎么做」为本轮发言），加上回放跑不出来、必须由人补的上下文：在 harold-skills#174 的 issue 会话里、对应 spec `replay-run-large-now`；A4 查到的 poteto 观点写成人转述的笔记（回放里不保证能上网）。只用人的口吻，不出现用例格式校验禁用的词。禁止 git 提交、推送、gh 写操作；讨论完把要人定的摆成题，等人回答。
- 停在：摆出范围题、等人回答的那一刻。
- 是/否题（写成问句）：摆出的范围题里，影响这份 spec 实现或上线后会有影响的改进（例如回放输入露题，会让用例改前改后都答「是」）有没有被推荐并进当前 PR，其余的没被推荐并进？
- quote：上面人的原话。
- 大小：按用例里 size 的规则判（只驱动一轮讨论、不起插件 agent、不开浏览器就是 small）。
- `annotations.md` 写明材料怎么拼的、缺什么、改前预计答「否」的理由（改前的 `decision-rules` 不规定推荐方向，当时推荐了拆开）。

idea-loop 的 `plugin.json` 的 `version` 升一档 minor（改了问人时的推荐方向，老用法照样能用；`REVIEW.md`「额外要求」）。idea-loop 的 `README.md` 若有描述 `decision-rules` 行为或列出回放用例的地方，同步。

## 验收标准

- [x] `decision-rules` 的「要人定的写成一道题」里有上面那条新文，位置在「给推荐和一句理由」之后，其余条目不变
- [x] 新用例通过仓库的用例格式校验（`retro-case.test.mjs`）和 runner 的 `--list`
- [x] 用 runner 跑新用例：改前「否」、改后「是」，且改后那一遍用上了改动（`exercised`）；跑不成或结果不符，写明原因交回
- [x] `REVIEW.md` 的验证命令全过（含插件版本检查、防项目信息泄漏检查、SKILL.md 字数）
- [x] idea-loop 的 `version` 升了 minor

## 选中的存量回归

- `retro-case.test.mjs`：新用例的 prompt 可能命中禁用词
- `no-project-leak.test.mjs`：新文写进插件 skill，不能带项目信息（`evals/` 下的用例是夹具，豁免）
- `plugin-version.test.mjs`：改了插件就必须升版本
