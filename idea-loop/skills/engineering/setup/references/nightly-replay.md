# 夜间规则回放

大的回放用例（会起插件 agent、开浏览器或调付费服务）不在白天跑，而是排进 `~/.idea-loop/replay-queue/`，每晚由一个计划任务跑。这一步装的是整台机器共用的东西，不属于哪个仓库：已经装过的就核对，不重复建。三件事：

1. **装 runner 到固定路径**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/retro-install.mjs"`。它把 runner 拷到 `~/.idea-loop/bin/`（入口是 `~/.idea-loop/bin/retro-replay.mjs`，不随 worktree 和插件升级变），再跑一次会换成插件现在的版本。小回放也走这个路径。
2. **建计划任务**：用『定时任务』（用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的这一节）列出已有的，没有 `idea-loop-retro-replay` 才建：表达式为 `7 1 * * *`（每晚 01:07，本机时间；运行环境要别的时区就换算），任务 id 为 `idea-loop-retro-replay`，目录随便一个存在的（例如主目录），`prompt` 用 `retro-install.mjs` 打印的那一段原文（不要自己改写）：它先用后台方式（Bash 的 `run_in_background`，前台最多等 10 分钟会截断回放）跑 `node ~/.idea-loop/bin/retro-replay.mjs --queue`，等它退出的唤醒，再按输出里的每条「回放结果」行，用『会话管理』把结果发回队列文件里记的 issue 会话，发不出去时改跑同一个 runner 的 `--notify` 发 macOS 通知。命令都以允许规则覆盖的前缀开头，否则无人值守时会被 auto 分类器拦下。runner 自己核时间（只在 00:00–07:00 跑，夜里没跑上、早上补跑时它会不跑）、读队列（空就立即退出，不花钱）、写结果。已有的计划任务 prompt 跟打印的不一样（旧版只跑 runner），用『定时任务』的更新换成新的。
3. **打印允许规则，让人自己加**：`retro-install.mjs` 打印的 `Bash(node ~/.idea-loop/bin/retro-replay.mjs:*)`，在交回里原样给人，请他按『装与设置』里「允许规则」写的位置，加进 `permissions.allow`。**setup 不改权限设置**，不替人加。
