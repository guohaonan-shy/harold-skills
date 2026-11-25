## 问题

idea-loop 的 58 个脚本没有统一入口：skill 和子代理只能抄全路径和参数去调，易错的 git / gh 操作每处手写，调 Codex 留下的进程从不退出，子代理拿不到运行环境的做法。

| 现在的样子 | 量 | 出处 |
|---|---|---|
| skill、子代理里抄着脚本全路径和参数，脚本改参数后文字悄悄过期，没有测试会红 | 154 处，89 个文件 | 11-18 在 0.2.0 集成分支上 grep |
| 易错操作手写，每处写法不同 | 建删 worktree 17 处、改 issue 24 处、开合 PR 15 处、推送合并提交 11 处 | 同上 |
| pr-review 经 Codex 插件起的审查进程从不退出 | 154 个常驻进程，连子进程 1205 个，约 3.76 GB，最老的跑了 23 天 | 11-18 本机进程表 |
| 运行环境的做法只在主会话开场注入，子代理要自己翻 `idea-loop:runtime` 的参考 | skill 和子代理里引用它 39 次、引用 `idea-loop:browser` 20 次 | 同第一行 |

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
 读设计档案开头的元数据（档案检查、档案查询、评委一轮等 13 个模块）
-  自写的小 YAML 解析器，宽容不加引号的 [[链接]] 和 {…}
+  现成的 YAML 库；值里有冒号、问号、花括号又没加引号的报错，报错后补一句「要加引号」
 起静态服务器给人看页面、截图
-  python -m http.server 等，每处手写，用完要记得停
+  dyna serve start：自己挑空闲端口；30 分钟没有请求自动退出
 量 UI
-  依赖目标项目装的 playwright
+  用本机 Chrome / Chromium（命令行包因此约 9.6 MB）
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

- **之前**：在 skill 和子代理里 grep 脚本全路径，基准分支上 154 处。
  **之后**：同一条 grep，本分支零结果。
- **之前**：在 skill 和子代理里 grep `idea-loop:runtime`，基准分支上 39 处（`idea-loop:browser` 20 处）。
  **之后**：同一条 grep，本分支除了守它们不回来的测试，零结果。

```text
for 每个模块
  同一组输入分别喂旧脚本和 dyna
  逐字节比输出和退出码
```

全量测试：命令行 40 个包全绿；插件测试 724 条过 723 条，红的一条是「改了插件要升版本」，这个 PR 刻意不升（见合并风险）。

行为没变：每个模块同一组输入，旧脚本和 dyna 的输出、退出码逐字节相同；量 UI 同一矩阵、同一 Chrome 逐字节相同；加过引号的 TOFEL-demo 设计档案，旧版和 dyna 0.0.2 档案检查都通过，413 个对象。

没验成：易错操作被拦、Codex 跑完不留进程这两件的之前，基准分支上没跑（之后都真做过：真会话里手写 `git worktree remove` 被拦下；真调 `dyna agent codex run` 22 秒、`dyna agent codex image` 56 秒，跑完都没有残留进程）；DESIGN.md 官方检查工具没联网跑真的；开 PR、合并 PR 的 dyna 命令只对假的 GitHub 命令行验过参数；知识库提交时拒死链没在真 home 上跑；静态服务器 30 分钟空闲退出没有验过的记录。都没排人补。

## 合并风险

**门**：单向。代码撤销合并能整个退回（删了三个 skill、改了 hook，只能整个 PR 一起撤，不能撤一半）；退不回的是已公开发布的 dyna 0.0.1、0.0.2 两个包，Release 能删，已下载的人留着；你本机装的 0.0.2 也不会跟着撤。
**影响面**：集成分支。合进的是 0.2.0 的集成分支，不是 main；0.2.0 合进 main 后影响所有装了 idea-loop 的项目。
- 迁移：每台机器（含公司虚拟机）都要先跑一次 `/idea-loop:setup` 装命令行，否则 hook 只提示、不拦也不检查；公司虚拟机连不上 GitHub 的，要手拷一份二进制。
- 兼容：设计档案里值带冒号、问号、花括号又没加引号的，现在读不出来（TOFEL-demo 主分支上 8 个文件就是这样，报错带「要加引号」的提示）；别的项目里写着 `idea-loop:runtime`、`idea-loop:browser`、`idea-loop:seo-check` 的地方会失效。
- 刻意没做：插件版本这次不升，0.2.0 收尾时按大版本统一升。

## 要你做的事

- [ ] 合 Tofelair#1031（TOFEL-demo 设计档案 8 处值加引号，值不变）。不合的话，你本机的 dyna 0.0.2 对那边主分支跑档案检查，一直报 8 个文件读不出来。

  ```sh
  gh pr merge 1031 -R guohaonan-shy/Tofelair
  ```

说「合并」即可。

Refs guohaonan-shy/harold-skills#339
