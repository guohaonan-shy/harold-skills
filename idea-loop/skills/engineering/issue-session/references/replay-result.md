# 规则回放的结果

夜里的任务会用会话间消息把结果发进 issue 会话（一条「From …」的消息，第一行是 `<仓库> #<PR> 的规则回放：…`，后面是结果文件路径）。收到后：读那份 review loop 文件里的 `规则回放` 条目核实，再按结果走：

- **全过**：条目已是处理完的状态（`review-loop.mjs check` 不列它）。回到 `idea-loop:implement` 的「没活了就停下」：没有别的挡着就 `gh pr ready` 进 `idea-loop:pr-review`。
- **有不过的**：停下，不进 review。把没过的用例、判定会话在改前改后各答了什么和出处摆给人，选项就是条目里的三个处理（判定对 / 判定错 / 用例有问题），等人批示；人的批示照 `idea-loop:implement` 里「人回复后」处理。
- 会话收到消息时正忙着别的，先做完手上这一步再处理；消息没发来（会话已收尾、任务没跑）时，人会收到 macOS 通知，结果照样在文件里。

## 当场跑

人说「现在就跑」才用；人没说，大用例照常进夜间队列（`idea-loop:implement` 的「没活了就停下」），不替人决定。

1. **跑前告诉人**：要跑几个用例，每个最长约 3×45 分钟（改前、改后、判定各一个会话，每个最长 45 分钟）。花费以 runner 开跑时打印的那一行（`--run-large：…预计花费约 …`）为准：起好之后读到它，原样转告人；起 agent 的用例会比这个估计高。
2. **跑**：`node ~/.idea-loop/bin/retro-replay.mjs --cases <用例,用例> --run-large --pr <PR 号> --worktree <集成 worktree 绝对路径>`，用 Bash 的 `run_in_background: true` 起，不设 timeout（前台 Bash 最多等 10 分钟就截断），起好后等它退出唤醒，不轮询。
3. **跑完**：输出里写着结果进了哪个文件。读那份 review loop 文件里新的 `规则回放` 条目，照上面的「全过」「有不过的」处理；这条路不发会话间消息，也不发通知。夜间队列里这个 PR 的这些用例已被拿掉，夜里不会重跑。
4. **runner 不认 `--run-large`**（报 `unknown argument`）：`~/.idea-loop/bin/` 里是旧版拷贝，先跑插件的 `scripts/retro-install.mjs` 重装，再跑。
