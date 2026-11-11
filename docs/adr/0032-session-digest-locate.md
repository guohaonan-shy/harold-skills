---
type: adr
status: 生效
tags: [idea-loop, retro, session-digest]
summary: session-digest locate 先按会话自己的 id 找，退回标记时只认第一条人的发言，不唯一就退出码 2
related: ["[[87]]"]
---

# ADR-0032 — session-digest locate 只认这场会话自己的记录

> 由 spec `session-digest-locate` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

#87：retro 第 1 步用 `session-digest.mjs locate --marker` 找这场会话的记录文件，原先只在「当前目录换算出的项目目录」里找含标记的最新一份。两个前提都不牢：

- 当前目录会变。issue 会话收尾前常 cd 到主 checkout，那里对应的项目目录放的是调度会话的记录。
- 标记不只在本会话里。调度会话把 `issue-session，参数 <号>` 写进卡片任务，它自己的记录里也有这段字，只是在 AI 的工具调用参数里，不在人的发言里。

结果是 `locate` 交回别的会话的记录且退出码 0，retro 会拿调度会话的发言出候选。另外参考资料里写的 issue 会话标记（`issue-session <号>`）与卡片原文对不上。

## 2 决策（how）

- **按会话 id 优先**：读环境变量 `CLAUDE_CODE_SESSION_ID`（或显式 `--session`），在所有项目目录下找 `<id>.jsonl`，与当前目录无关。
- **退回标记时只认第一条人的发言**：只读每份文件开头到第一条人的发言为止（判定沿用 `digest` 对人的发言的认法），标记出现在 AI 工具调用里不算。找的范围是所有项目目录；`--dir` 保留给测试。
- **不唯一就退出码 2**：对上不止一份（含会话恢复新起的、带旧历史的第二份文件）不再取最新，而是退出码 2 并列出候选，retro 退回用『会话管理』导出。取错的代价（拿别的会话的话出规则）大于多走一步导出。
- **文档跟着卡片改**：参考资料里的 issue 会话标记改成卡片原文「issue-session，参数 <号>」，不去改调度卡片。

## 3 结果（result）

- `idea-loop/scripts/session-digest.mjs` 的 `locate` 按上述顺序工作，退出码 2 时在 stderr 写明找过的范围；单测在 `session-digest.test.mjs`。
- `retro` 的参考资料「取会话记录并压缩」默认跑不带参数的 `locate`，标记一句改成与卡片一致，只认第一条人的发言，退出码 2 的出路写明。
- 取代 ADR-0028 中取会话记录按当前目录定位的做法；「找不到唯一那份就退回导出」的出路保留，现在明确了何时算「不唯一」。
