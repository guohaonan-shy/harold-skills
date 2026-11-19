---
type: record
captured: 2026-11-16
title: "不做：让 Codex 跑完整个 issue 会话，cmux 调度开 Codex 终端"
tags: [out-of-scope, idea-loop]
---

- 是什么：idea-loop 不只由 Claude Code 跑，Codex 也能跑完一整个 issue 会话（从认领到合并），由 cmux 的调度开 Codex 终端来做。
- 为什么不做：人的原话（2026-11-16，#237 的 triage 会话）：「涉及到cmux的链路，先不考虑，这个issue可以关掉」。
- 已核过、以后重提时不用再核的：Codex 能直接装 Claude 格式的插件。2026-11-16 对着 main 的 a032e45、codex-cli 0.166.0，用临时 `CODEX_HOME` 跑 `codex plugin marketplace add <本仓库>` 读到了 `.claude-plugin/marketplace.json`，`codex plugin add idea-loop@harold-skills` 装上了 idea-loop。装上后 Codex 认得哪几部分（skill 之间的串联、子代理定义、hooks、`${CLAUDE_PLUGIN_ROOT}`）没测。
- 相关 issue：harold-skills#237
