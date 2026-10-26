---
type: record
captured: 2026-10-26
title: "retro 候选 #97：idea-loop：GLOSSARY.md 只用 Write/Edit 改（不绕 hook）；implement 推送后看 PR 检查"
tags: [retro-candidates]
---

> 原 issue：https://github.com/guohaonan-shy/harold-skills/issues/97（开于 2026-10-26，2026-10-26 随 retro 整合撤回关成 not planned）。改写成候选池的统一形状，原文的段落尽量原样保留；去处见 #115。

# idea-loop：GLOSSARY.md 只用 Write/Edit 改（不绕 hook）；implement 推送后看 PR 检查

- 信号：纠正与追问
- 落点：`glossary` skill；`implement` skill 的「落地」
**旧文**（glossary）：「格式由 `glossary-check.mjs` 机械校验：plugin 的 PostToolUse hook 在每次 Write / Edit 落到名为 `GLOSSARY.md` 的文件时自动跑它，违规写到 stderr、退出码 2，当场改到通过。」
**新文**（glossary，接在旧文后）：「改 `GLOSSARY.md` 只用 Write / Edit，不用 shell 或脚本改：后者绕过这个 hook。不得不用脚本改时，改完手动跑一次 `glossary-check.mjs`，过了再提交。」
**新文**（implement · 落地，加一条）：「每次推送集成分支后，看一次 PR 的检查（`gh pr checks <号>`）。有失败的，先查是不是这次推送引入的；是就当场修，修好再派下一张；不是就记进停下汇报。不要攒到停下汇报或 review 才看。」

- 例子：

**问题**：编排者用 shell 脚本改了 `GLOSSARY.md`，绕过了插件在 Write / Edit 时跑 `glossary-check.mjs` 的 hook，一个超过两句的词条推了上去；之后推送集成分支时没看 PR 检查，Docs Lint 连续失败 6 次，人被失败邮件提醒才发现。

- 状态：在池里

## 出现

- Tofelair#518（2026-10-26）：「同意，另外，eval框架现在doc-lint一致跑不过，一直给我发邮件，解决下」；决定记录：Tofelair#518 的 retro，不在本仓库

## 备注

来自 Tofelair#518（eval 框架）issue 会话的 retro，人已批（2026-10-26）。
