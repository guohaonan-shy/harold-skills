---
type: spec
status: 实现中
tags: [idea-loop, retro, session-digest]
summary: retro 取会话记录时按会话自己的 id 找；退回标记时只认第一条人的发言，对不上不报成功
related: ["[[retro]]", "[[design-tmp-worktree-root]]"]
issues: [87]
---

# session-digest locate 只认这场会话自己的记录

## 验证

| issue | 结论 | 证据 |
|---|---|---|
| #87 idea-loop retro：session-digest locate 换了当前目录后会找到别的会话的记录，还报成功 | 存在 | 2026-10-31 对着 `origin/main 2368079` 复现：一个会红的单测（当前目录指向放调度会话记录的项目目录，`locate` 返回调度会话的记录、退出码 0），加本机现场（本会话把当前目录换到主 checkout 后，`locate --marker "issue-session，参数 87"` 返回调度会话的记录、退出码 0）。详情在「问题」 |

## 问题

### 1. 当前目录一换，retro 拿到的是别的会话的记录，脚本还报成功

retro 第 1 步跑 `session-digest.mjs locate --marker "<开场标记>"` 找这场会话的记录文件。`locate` 不传 `--dir` 时只在「当前目录换算出的项目目录」（`~/.claude/projects/<当前目录把非字母数字换成 ->/`）里找，取含标记的最新一份。两个前提都不牢：

- **当前目录会变。** issue 会话跑在 worktree 里，但收尾前常为了升级插件、看主 checkout 而 cd 过去；那个目录对应的项目目录里放的正是调度会话的记录。
- **标记不只在本会话里。** issue 会话的开场标记（如「issue-session，参数 87」）是调度会话写进卡片任务里的，调度会话自己的记录里也有这段文字——只不过它在 AI 的工具调用参数里，不在人的发言里。

本次复现了两遍：

- **单测**：造两个项目目录，一个放本会话的记录（第一条人的发言就是含标记的卡片任务），一个放调度会话的记录（标记只出现在 `start_session` 的工具调用参数里）；当前目录指向后者，跑 `locate --marker "issue-session，参数 527"`。看到：返回调度会话的记录，退出码 0。本该：返回本会话的记录，或退出码 2 交给 `export_transcript`。
- **本机现场**：这场 #87 的会话自己。当前目录在本 worktree 时，`locate --marker "issue-session，参数 87"` 返回本会话的记录（`b5b16389-….jsonl`）；cd 到主 checkout `/Users/guohaonan/projects/harold-skills` 再跑，返回调度会话的记录（`aff1c25c-….jsonl`），退出码 0。核对两份文件：调度会话里标记只出现 1 次，在一条 AI 的工具调用里；本会话的第一条人的发言含标记。

规模：本机 `~/.claude/projects/` 下 189 个项目目录、574 份会话记录，合计 4.6G，其中 382 份超过 1M。issue 的例子（2026-10-23，Tofelair#527 的收尾）里 agent 是对着文件内容才发现拿错了；没发现的话，retro 会拿调度会话的发言出规则候选。

复现材料：`.tmp/to-spec/session-digest-locate/repro/`（`locate-cwd.test.mjs` 与 `test-output.txt`、`live.txt`）。

### 2. 文档写的 issue 会话标记，在会话开场里根本不出现

retro 的参考资料（取会话记录那份）写「issue 会话的标记是 `issue-session <号>`」，而调度卡片写进任务的原文是「用 Skill 工具调 idea-loop:issue-session，参数 <根号>，按它从开场做起」。本会话开场的人的发言里没有「issue-session 87」这几个字；这份记录里能搜到它，只是因为本会话后来自己在工具调用里写过它。照文档的标记找，要么退出码 2，要么靠 AI 自己写过的字碰巧对上。

### 根因

1. `locate` 用当前目录推断「这场会话的项目目录」，而当前目录在会话中途可变；它又只看文件里有没有标记这段文字，不管标记出现在谁的话里。对应问题 1。
2. 取会话记录的参考资料里的 issue 会话标记，是按调度卡片的旧写法写的，卡片改成「issue-session，参数 <号>」后没跟着改。对应问题 2。

## 方案

retro 拿到的记录文件只会是这场会话自己的；认不出唯一一份时退出码 2，retro 照旧改用 `export_transcript` 导出，不会把别人的记录当成功交回。决定它的输入按优先级：

1. **会话自己的 id**：会话里跑的命令的环境里有 `CLAUDE_CODE_SESSION_ID`，值就是记录文件名（本会话实测：环境变量 `b5b16389-088e-4607-838e-57eace13650f`，记录文件 `b5b16389-088e-4607-838e-57eace13650f.jsonl`，记录里每条的 `sessionId` 也是它）。`locate` 按 `<id>.jsonl` 在所有项目目录里找，跟当前目录无关。
2. **标记**：没有 id、或按 id 找不到文件时才用。在所有项目目录里找，只认**第一条人的发言**含标记的文件。
3. 都认不出唯一一份：退出码 2。

同类入口：

- **retro 第 1 步**（取会话记录的参考资料）：纳入。默认不再要求先想出标记；issue 会话的标记改成跟卡片原文一致的「issue-session，参数 <号>」。
- **`session-digest.mjs digest`**：排除，它拿到的是文件路径，不找文件。
- **其它脚本**：仓库里没有别处按当前目录推断 `~/.claude/projects/` 下的项目目录（2026-10-31 在 `idea-loop/` 下 grep 核过）。

## User Stories

只修问题，每个问题一行期望行为：

1. 当前目录在会话中途换到别处（比如主 checkout）后跑 retro，`locate` 交回的仍是这场会话自己的记录；认不出时退出码 2，不交回别的会话的记录。
2. issue 会话的 retro 照参考资料写的标记去找，标记就在这场会话第一条人的发言里，找得到。

## 实现决策

- **按 id 找优先。** `locate` 先读环境变量 `CLAUDE_CODE_SESSION_ID`（也接受显式的 `--session <id>`，测试与手动用），在 `~/.claude/projects/*/` 下找 `<id>.jsonl`。恰好一份：交回，退出码 0。依据：issue「建议的修法」第一条（会话知道自己的 id），本会话实测环境变量与文件名一致。
- **标记只认人的话。** 退回标记时，每份候选文件只读开头到第一条人的发言为止（人的发言沿用 `digest` 现有的判定：去掉 system-reminder，排除工具结果、任务通知、本地命令回显等不是人打的记录），第一条人的发言含标记才算对上。依据：issue「建议的修法」第二条；本机现场核过，调度会话里标记只出现在 AI 的工具调用里。只读开头是因为全量读 574 份、4.6G 的记录太慢，而判定只要第一条人的发言。
- **找的范围是所有项目目录。** 不再按当前目录推断项目目录。`--dir` 保留，传了就只在那一个目录里找（测试用）。
- **多份对上就退出码 2。** 按标记对上不止一份时，不再取最新的一份，而是退出码 2、列出候选。依据：「自己定的四条」第 3 条（代价相称）——取错的代价是 retro 拿别的会话的发言出候选、人未必看得出；退出码 2 的代价只是多走一次 `export_transcript`，它导出的就是本会话。被牵连的情形：一场会话恢复后新起了一份带旧历史的文件，两份第一条人的发言相同，现在会退到 `export_transcript`；按 id 找时不受影响（环境变量是当前这份）。按 id 找出多份（同一 id 出现在两个项目目录）同样退出码 2。
- **退出码 2 的提示里写明找过的范围**（id 或标记、哪些目录），retro 照旧接 `export_transcript`。
- **参考资料改两处**：第 1 步默认跑不带参数的 `locate`（靠会话 id）；标记一句改成 issue 会话用「issue-session，参数 <号>」，手动调时用开场第一句里的一小段，并写明只认第一条人的发言。退出码 2 的处理不变。插件 README 里 retro 那一行对 `locate` 的描述如有涉及，同步改。

## 技术方案总览

### 后端

不涉及。

### 前端内部

不涉及。

### 前端交互

不涉及。

## 测试决策

| 变的是什么 | 仪器 | 本次 |
|---|---|---|
| 纯逻辑、数据转换、状态机 | TDD 单元测试 | 碰到：候选怎么挑（按 id、按第一条人的发言、多份退出码 2） |
| API 契约（路由、schema、序列化） | TDD API 测试 | 碰到：`locate` 的命令行契约（环境变量、`--session`、退出码），走命令行测试 |
| DB schema、迁移、并发与事务语义 | 真 DB 测试 | 不涉及 |
| LLM 输出质量（prompt 改动） | eval（确定性断言） | 不涉及（参考资料只改命令写法，不改 retro 的判断） |
| 视觉正确性 | UI 实现环 | 不涉及 |
| 端到端用户流程 | 浏览器端到端测试 | 不涉及 |

- **seam**：`session-digest.mjs locate` 的命令行，子进程跑，测试控制 `HOME`（假的 `~/.claude/projects/`）、当前目录和环境变量，读 stdout 与退出码。抓得到：找文件的范围、挑哪份、退出码；漏掉：真实 Claude Code 是否在每个会话的命令环境里都设了 `CLAUDE_CODE_SESSION_ID`（本会话实测设了，靠下面的人验那一条补）。挑候选的纯函数（现有的 `pickSession` 或它的替代）可以在同一测试文件里直接测，但验收以命令行为准。
- **增量功能测试**：
  - 前置：假 HOME 下两个项目目录，A 放本会话记录（文件名是 id，第一条人的发言含标记），B 放调度会话记录（标记只在工具调用参数里）；当前目录指向 B。步骤：不带 id 跑 `locate --marker <标记>`。期望：交回 A 的文件，退出码 0。覆盖：问题 1。（就是本次的红测试，改前红、改后绿。）
  - 前置同上，环境变量 `CLAUDE_CODE_SESSION_ID` 设为 A 的 id。步骤：跑不带参数的 `locate`。期望：交回 A 的文件。覆盖：问题 1。
  - 前置：两个项目目录各一份第一条人的发言都含标记的记录。步骤：`locate --marker <标记>`。期望：退出码 2，stderr 提到 `export_transcript` 并列出两份。覆盖：问题 1。
  - 前置：环境变量指向一个不存在的 id，且没有文件对上标记。期望：退出码 2。覆盖：问题 1。
  - 前置：一份卡片开出的 issue 会话记录，第一条人的发言是调度卡片的原文。步骤：用参考资料写的 issue 会话标记跑 `locate --marker`。期望：找得到。覆盖：问题 2。
  - 现有用例「a resumed session … newest file wins」改成：多份对上退出码 2（行为按上面的决定变了）。
- **人验**：在一个真实的 issue 会话里把当前目录 cd 到主 checkout，跑不带参数的 `locate`，交回的是这个会话自己的记录。
- **prompt / eval 变动**：无 prompt/eval 变动。retro 的回放用例（`idea-loop/evals/retro/`）不涉及取记录这一步。
- **照着谁写**：`session-digest.test.mjs` 里的「cli: locate then digest, on a directory of session files」，用 `spawnSync` 跑脚本、`mkdtempSync` 造目录、`utimesSync` 控时间。

## Out of scope

- `session-digest.mjs digest`：拿的是路径，不找文件，不受影响。
- 让调度卡片的任务原文改用 `issue-session <号>` 来对齐旧文档：文档跟着卡片改，不让卡片跟着文档改：对齐只需改参考资料一句，改卡片要动 issue-dispatch（「自己定的四条」第 4 条，改动最小）。
- 用 `export_transcript` 取代 `locate`：它要求工具可用，`locate` 仍是快路径，退出码 2 时才用它。

## 关联

- 覆盖：#87 idea-loop retro：session-digest locate 换了当前目录后会找到别的会话的记录，还报成功。
- 相关 spec：[[retro]]（retro 本体，`locate` 出自它）；[[design-tmp-worktree-root]]（同属「会话位置取错」一类，它管工作区根，这份管会话记录，无重叠，不分先后）。
- 相邻还没完成的 spec 与 issue：查过（2026-10-31，open 的 productivity 类 issue 除本条只有 #80 decision-rules 拆分，不碰 `locate`；`docs/spec/` 下 retro 相关的 retro、retro-candidate-pool、retro-batch-dispatch、retro-skill-length 都已「完成」），无重叠。
