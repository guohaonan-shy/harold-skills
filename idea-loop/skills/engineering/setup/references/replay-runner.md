# 规则回放 runner

回放用例由 `~/.idea-loop/bin/retro-replay.mjs` 跑：执行方当场跑小的，编排者在 PR 开出后当场跑大的。这一步装的是整台机器共用的东西，不属于哪个仓库：已经装过的就核对，不重复建。四件事：

1. **装 runner 到固定路径**：`dyna retro install`。它把 runner 拷到 `~/.idea-loop/bin/`（入口是 `~/.idea-loop/bin/retro-replay.mjs`，不随 worktree 和插件升级变），再跑一次会换成插件现在的版本；runner 起会话和请 Codex 当评委都调命令行（`dyna agent claude run`、`dyna agent codex run`），所以机器上要装 `dyna`；它还要随 runner 装进去的运行环境检测脚本，认被验会话在哪个运行环境。
2. **删掉旧的计划任务**：用『定时任务』（做法照 `dyna runtime show 定时任务`）列出已有的，有 `idea-loop-retro-replay` 就删掉（它是夜间回放的任务，现在没有夜间回放了）；没有就跳过。
3. **删掉旧的队列目录**：`~/.idea-loop/replay-queue/` 在就整个删掉，不在就跳过。
4. **打印允许规则，让人自己加**：`dyna retro install` 打印的 `Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)`，在交回里原样给人，请他按『装与设置』里「允许规则」写的位置，加进 `permissions.allow`。**setup 不改权限设置**，不替人加。
