# 样本：夜里会话做到哪一步停，spec 里只有一种说法

**一句话**：下游照 spec 实现，spec 对同一件事前后说了两种话，实现只能取一种，review 才发现跟 spec 不一致，返工。好的 spec 对「夜里的 todo 会话做到哪一步停」只有一种说法。

## 出处

harold-skills#379 的 triage 会话（2026-11-18）起草 `dispatch-day-night-modes`（提交 `4c49b35b`，起草之前的状态是 `220c39e0`）；PR #382 review 第 1 轮 S2（2026-11-19）发现 spec 前后两处说法不一致。Harold 说「第二件 统一」（决定记录 `docs/raw/decisions/379.md` 题 8：实现按其中一种做、spec 与工单 04 统一成一种说法）。好用组：看新 spec 还会不会让下游返工。

## 当时产出的原文

`docs/spec/dispatch-day-night-modes/dispatch-day-night-modes.md`，两处说同一件事：

- 「方案」第 53 行：「每个会话一路做到 PR review 完，停在等人说合并」；
- 「实现决策」第 148 行：「做到哪停：`pr-review` 跑完一轮、PR 转 ready、会话移进 in-review，停在等人说合并」。

「review 完」和「跑完一轮」不是一回事：`pr-review` 的停点可以是两轮，一轮跑完 review 不一定过。PR #382 的原文没有存档在仓库里（`docs/raw/decisions/` 里没有 `382.md`），上面是对着起草提交的 spec 查到的位置，人的原话和处置取自决定记录 `docs/raw/decisions/379.md` 题 8。

## 人指出的问题

人原话：「第二件 统一」（一次回答三件事里的第二件）。review 摆给他的是：实现取了「跑到 review 自己的停点、最多两轮」，spec 前后两处说法本身不一致，问是保留实现还是改成一轮就停。

## 好的长什么样

同一个 issue 再起草一遍，spec 里夜里的 todo 会话做到哪一步停，从头到尾只有一种说法：

- 说法定一次（比如「`pr-review` 跑到它自己的停点，最多两轮，停在等人说合并」），「方案」「User Stories」「实现决策」「测试决策」里凡是说到这一步的地方都是同一句话或指到它；
- 如果这一步 issue 没定、需要人定，就标在「待定」里，而不是在两处各写一种。

不好的样子：一处写「review 完」，一处写「跑完一轮」，实现者只能自己挑一个。

## 回放这一格怎么跑

- 现场：提交 `220c39e0`，prompt 是起草 spec 的那一句加 issue 正文，再加一段人在会话里已经定下的五件事（取自决定记录 `docs/raw/decisions/379.md` 题 1–5，因为 spec 是人答完这几道题之后才起草的）；
- 换过的地方：issue 正文取当前版本（2026-11-25 `gh issue view 379`），其中一处旧的 issue 状态名换成了普通说法「在实现」（插件里的文件不许出现旧的 issue 状态名，`issue-model-tripwire.test.mjs` 守着；2026-11-25 的预跑用的是改之前的字面，意思没变）；PR #382 的 review 原文取不到，人的话取自决定记录；原 spec 的两处说法是 agent 当时自己写出来的，回放里能不能再出现两种说法要看新的产出，所以题问的是「新 spec 里有几种说法」，不是「有没有复现原来那两句」；
- 大小：small；
- 同现场的 `guard-four-covered` 用同一个 prompt；
- 改前（集成分支的插件）2026-11-25 预跑过，见 `annotations.md`；改后要等 #451 工单 02 的 to-spec 落地。
