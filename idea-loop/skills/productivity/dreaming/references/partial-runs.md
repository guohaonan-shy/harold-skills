# 只跑一部分

人说只跑某一部分时读这份：只起对应的 agent（或只做漏归档），只出那几节。完成条件：交出的表只含这几节，且过 `dyna dreaming table submit`。

| 人说 | 做什么 |
|---|---|
| 只跑 spec → ADR | 起 `adr-reconciler` |
| 只跑候选蒸馏，或只跑 `DESIGN.md` 对账 | 起 `design-steward`，范围写明是哪一部分 |
| 只跑设计档案 | 走档案那一路 |
| 只跑记忆 | 只做记忆一段，只出 `记忆` 一节 |
| 只跑 retro 候选 | 照 [retro-candidates.md](retro-candidates.md) 的末段，只出 `retro 候选` 一节 |

## 单条蒸馏

人口述一条视觉规则想当场落，调用时带上它：只起 `design-steward`，范围「单条蒸馏」，不出提议表，照 [candidate-distillation.md](candidate-distillation.md) 的「单条蒸馏」。没有单独调用的，这条规则记成候选，等下次对账。
