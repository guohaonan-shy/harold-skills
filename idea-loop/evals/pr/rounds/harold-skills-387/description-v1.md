## 问题

idea-loop 的 58 个脚本没有统一入口：skill 和子代理只能抄全路径和参数去调，易错的 git / gh 操作每处手写，调 Codex 留下的进程从不退出，子代理拿不到运行环境的做法。

| 现在的样子 | 量 | 出处 |
|---|---|---|
| skill、子代理里抄着脚本全路径和参数，脚本改参数后文字悄悄过期，没有测试会红 | 154 处，89 个文件 | grep，集成分支 `da89648`，11-18 |
| 易错操作手写，每处写法不同 | 建删 worktree 17 处、改 issue 24 处、开合 PR 15 处、推送合并提交 11 处 | 同上 |
| pr-review 经 Codex 插件起的审查进程从不退出 | 154 个常驻进程，连子进程 1205 个，约 3.76 GB，最老的跑了 23 天 | 本机进程表，11-18 |
| 运行环境的做法只在主会话开场注入，子代理要自己翻 runtime skill 的参考 | skill 和子代理里引用它 39 次、引用 browser 20 次 | grep，同第一行 |

## 概要

58 个脚本用 Go 重写成一个命令行 dyna（16 个模块），跟插件分开发布；skill 里只写 `dyna <模块> <命令>`，每次调用先核插件要的版本范围。

```diff
 会话照 skill 做一步（例：把 issue 翻到 todo）
-  node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" set <docs> todo <号>    # 全路径、参数抄在 skill 里
+  dyna issues set <docs> todo <号>                                        # 参数用 --help 查
+    插件的 bin/dyna（几行 sh）带上 dyna-version 里的版本范围
+      ~/.idea-loop/bin/dyna 核版本：不在范围就停，告诉人跑 /idea-loop:setup
 会话手写易错操作（例：手改 status label、git worktree remove）
-  直接执行
+  PreToolUse hook 调 dyna issues guard / worktree guard：拦下，告诉它改用哪条命令
 pr-review 一轮
-  起 pr-reviewer 子代理 → 经 Codex 插件起 Codex（常驻进程不退）
+  主会话并行起两个 dyna agent codex run：跑完或超时连子进程一起结束
 子代理要用一个能力（例：浏览器）
-  读 idea-loop:runtime 的参考，自己找那一节
+  dyna runtime show 浏览器：打印当前运行环境的那一节
```

文件挪到了这些地方：

```text
dyna/                     # 新：命令行源码，goreleaser 本机出 Mac / Linux 各两个架构的包，传 GitHub Releases（已发 0.0.1、0.0.2）
  registry/<版本>.json    # 每发一版存一份命令登记表；扫描测试拿插件要的最低版本那份，对 skill 里写的每条 dyna 命令
idea-loop/
  bin/dyna                # 新：插件小脚本，转给 ~/.idea-loop/bin/dyna；也负责首次安装和升级（下载、核校验和）
  dyna-version            # 新：插件要的命令行版本范围，现为 >=0.0.1 <1.0.0
  runtime/                # 新：各运行环境的做法（原 runtime skill 的参考），命令读它
  hooks/hooks.json        # 改：入口全换成 dyna 命令，新加两道拦截
  scripts/                # 删：58 个脚本、49 个只测它们的测试
  skills/、agents/        # 改：调用全换成 dyna；删 runtime、browser、seo-check 三个 skill 和 pr-reviewer 子代理
```

## 证据

- **之前**：skill、子代理里抄着脚本全路径 154 处（同问题）。
  **之后**：同一条 grep 在本分支零结果；不再有引用那三个被删 skill 和 pr-reviewer 的地方。
- **之前**：手改 issue 状态 label、手写删 worktree 没有任何东西拦（基准分支的 hook 里没有这两道）。
  **之后**：真开一个会话（本分支插件），手写删 worktree 被拦下，提示改用 dyna 的删 worktree 命令；把一条手改状态 label 的命令直接喂给拦截，被拦下并提示改用 dyna 翻状态，改分类 label 照常放行。
- **之前**：154 个 Codex 常驻进程（同问题）。
  **之后**：真调 Codex 审查一次 22 秒、生图一次 56 秒，两次跑完都没有残留进程；假 Codex 再起一个子进程、超时设 2 秒，2 秒退出，子进程也没留下。
- **之前**：子代理要自己翻 runtime skill 的参考（同问题）。
  **之后**：指定运行环境为 magi 查「浏览器」，打出 magi 的浏览器一节（给人看、无头、并行三条）；主会话开场照旧注入了桌面端的运行环境全文。

行为没变，靠这条差分测试守着，每个模块都跑过，跑完才删旧脚本：

```text
for 每个模块
  同一组输入分别喂旧脚本和 dyna
  逐字节比输出和退出码
```

全量测试：命令行 40 个包全绿；插件测试 724 条过 723 条，红的一条是「改了插件要升版本」，这个 PR 按约定不升（见合并风险）。

没验成：DESIGN.md 官方检查工具没联网跑真的；开 PR、合并 PR 的命令只对假的 GitHub 命令行验过参数；知识库提交时拒死链只看了单元测试，没在真 home 上跑。都没排人补。

## 合并风险

**门**：单向。代码撤销合并能整个退回（删了三个 skill、改了 hook、换了档案读法，只能整个 PR 一起撤，不能撤一半）；退不回的是已公开发布的 dyna 0.0.1、0.0.2 两个包，Release 能删，已下载的人留着；你本机装的 0.0.2 也不会跟着撤。
**影响面**：集成分支。合进的是 release/idea-loop-0.2.0，不是 main；0.2.0 合进 main 后，别的项目里写着 runtime、browser、seo-check 这三个 skill 名的地方会失效，所以插件版本这次不升，0.2.0 收尾时按大版本统一升。
- 每台机器（含公司虚拟机）都要先跑一次 `/idea-loop:setup` 装命令行，否则 hook 只提示、不拦也不检查；公司虚拟机连不上 GitHub 的，要手拷一份二进制。

## 要你做的事

- [ ] 合 Tofelair#1031（TOFEL-demo 设计档案 8 处值加引号，值不变）：你本机已经是 0.0.2，它不再宽容不带引号的写法，不合的话那边主分支的档案检查一直报 8 个文件读不出来。

说「合并」即可。

Refs guohaonan-shy/harold-skills#339

🤖 Generated with [Claude Code](https://claude.com/claude-code)
