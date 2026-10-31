# 取会话记录并压缩

下文 `digest` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/session-digest.mjs"`。

1. 定位：默认跑不带参数的 `digest locate`，它按这场会话自己的 id（环境变量 `CLAUDE_CODE_SESSION_ID`）在所有项目目录里找，跟当前目录无关。没有 id 或找不到文件时才加 `--marker "<开场标记>"`：issue 会话用 `issue-session，参数 <号>`（调度卡片任务的原文）；手动调时，用这场会话开场第一句里不带引号的一小段，记不得就问人。标记只认第一条人的发言里有没有，别处出现过不算。
2. 退出码为 2（按 id 和标记都找不到文件，或对上了不止一份——会话恢复会新起一份带着旧历史的文件，两份开场相同）：调 `mcp__ccd_session_mgmt__export_transcript`（`session_id: self`）导出，解开 zip 里的会话记录文件当下一步的输入。工具不可用就停下告诉人，不凭上下文里记得的补。
3. 压缩：`digest digest <文件> > .tmp/retro/<YYYY-MM-DD>-<主题>/digest.md`，只读这份。它是人的每一条发言，每条前面带着上一条 AI 回复的结论（前略的部分是被截掉的开头）；工具调用和输出都没有。压缩点在里面有一行标出。

压缩后 digest 里是人的每一条发言，每条前面带着上一条 AI 回复的结论；工具调用和输出都没有，压缩点有一行标出。取不到记录就停下告诉人，不凭上下文里记得的补。
