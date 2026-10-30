# 01 — session-digest locate 只认这场会话自己的记录

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的 retro 收尾时用 `session-digest.mjs locate` 找「这场会话自己的会话记录文件」（Claude Code 写在 `~/.claude/projects/<项目目录>/<会话 id>.jsonl`）。现在它只在「当前目录换算出的项目目录」里找含标记文字的最新一份：会话中途 cd 到主 checkout 后，它会交回调度会话的记录（调度会话在工具调用参数里写过同一段标记），退出码还是 0。

做完后：

- **按会话 id 找优先。** 不带参数跑 `locate`，读环境变量 `CLAUDE_CODE_SESSION_ID`（Claude Code 在会话里跑的命令的环境里设了它，值等于记录文件名去掉 `.jsonl`）；也接受显式 `--session <id>`。在 `~/.claude/projects/` 下所有项目目录里找 `<id>.jsonl`：恰好一份就交回、退出码 0；多份退出码 2。跟当前目录无关。
- **退回标记时只认人的话。** 没有 id、或按 id 找不到文件时，用 `--marker`：在所有项目目录里找，每份文件只读开头到第一条人的发言为止（人的发言沿用脚本里 `digest` 现有的判定：去掉 system-reminder，排除工具结果、任务通知、本地命令回显等不是人打的记录），第一条人的发言含标记才算对上。只读开头是因为本机有 574 份、合计 4.6G 的记录。
- **多份对上就退出码 2。** 按标记对上不止一份时不再取最新的，退出码 2 并在 stderr 列出候选。现有「a resumed session … the newest file wins」的行为按此改掉（恢复后带旧历史的新文件会退到 `export_transcript`；按 id 找不受影响）。
- **`--dir` 保留**：传了就只在那一个目录里找。
- **退出码 2 的提示**写明找的是 id 还是标记、在哪些目录找过，并照旧提到 `export_transcript`。
- **retro 的参考资料**（`idea-loop` 的 retro skill 下讲「取会话记录并压缩」的那份）改两处：第 1 步默认跑不带参数的 `locate`（靠会话 id）；标记那句改成「issue 会话用 `issue-session，参数 <号>`（调度卡片任务的原文），手动调时用开场第一句里的一小段；只认第一条人的发言」。退出码 2 的处理不变。脚本开头的用法注释、插件 README 里讲 `locate` 的地方（retro 那一行、scripts 目录树那行）有涉及的同步改。

## 验收标准

- [x] 命令行测试（子进程跑脚本，控制 `HOME`、当前目录、环境变量）：两个项目目录，A 放本会话记录（第一条人的发言含标记），B 放调度会话记录（标记只在 `tool_use` 参数里）；当前目录指向 B、不设 id，`locate --marker <标记>` 交回 A 的文件、退出码 0。改前先看到它红。
- [x] 同上前置，`CLAUDE_CODE_SESSION_ID` 设为 A 的 id，不带参数的 `locate` 交回 A 的文件；`--session <A 的 id>` 同样。
- [x] 两个项目目录各一份第一条人的发言都含标记的记录：`locate --marker` 退出码 2，stderr 提到 `export_transcript` 并列出两份。
- [x] id 指向不存在的文件、且没有文件对上标记：退出码 2。
- [x] 第一条人的发言是调度卡片原文（「用 Skill 工具调 idea-loop:issue-session，参数 87，按它从开场做起。」）的记录，用参考资料写的 issue 会话标记 `locate --marker` 找得到。
- [x] 现有 resumed-session 那条用例改成断言多份对上退出码 2；`session-digest.test.mjs` 全绿。
- [x] retro 参考资料、脚本用法注释、README 中对 `locate` 的描述与新行为一致（不再写 `issue-session <号>` 这种开场里不存在的标记）。
- [ ] 人验：在一个真实会话里 cd 到别的目录，跑不带参数的 `locate`，交回的是这个会话自己的记录。⏭ 延后 → PR 交付验收：要人在真实会话里确认 `CLAUDE_CODE_SESSION_ID` 每次都设了

## 选中的存量回归

- `session-digest.test.mjs` 的「cli: locate then digest, on a directory of session files」：同一命令行入口，`--dir` 与标记的行为在这次被改，最容易被带坏。
- `session-digest.test.mjs` 的 digest 系列用例（「keeps every human utterance …」「slash commands become …; system-originated user records are not human」）：标记判定要复用「什么算人的发言」，抽取复用时可能改坏 digest。
