# 01 — 会话开始时按项目注入项目地图

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
idea-loop 的 SessionStart hook 多一条命令（跟已有的 decision-rules / runtime / reference 三条并排，不并进它们）：会话开在一个已登记项目的代码仓库或它的 worktree 里时，把这个项目的项目地图注入上下文。

home 的位置是 `~/home`，环境变量 `IDEA_LOOP_HOME` 可覆盖（只为测试）。项目清单是 home 的 `AGENTS.md` 里 `## 项目` 一节，一个项目一行，格式 `<名字>（<是什么>）: <本地路径>. Clone from <远端> if missing.`；项目地图是 home 下 `projects/<名字>/AGENTS.md`。

判断顺序（spec「SessionStart hook」一节的表）：
- 不在 git 仓库里，或没有 home 目录 → 不输出
- git 顶层目录就是 home → 不输出（设备地图已由用户级 CLAUDE.md 加载）
- `origin` 远端对上清单某一行 → 输出那个项目地图全文；超过 2000 字只输出前 2000 字，末尾加一行「项目地图超过 2000 字，已截断」
- 对上了但地图文件不存在 → 一行：这个项目在 home 里的目录在哪、地图还没写
- 对不上 / 没有 `origin` → 不输出

远端比较前统一成 `主机/owner/仓库名`：去掉协议、`git@主机:` 写法、末尾 `.git`，主机名小写；SSH 和 HTTPS 两种 clone 认成同一个项目。worktree 的 `origin` 与主 checkout 相同，所以 worktree 也认得出。「字」按 Unicode 字符数算。脚本出任何错都不能让会话起不来：出错时不输出、退出码 0。

照仓库里运行环境检测脚本的写法：导出纯函数（远端统一、清单解析、判断）+ 命令行入口，测试在临时目录里建假 home、带远端的假 git 仓库和它的 worktree。同步 idea-loop 的 README 里 hook 那一段。

## 验收标准
- [x] 临时 home 登记了 `example-app`（远端 `https://github.com/acme/example-app`），在 `origin` 为 `git@github.com:acme/example-app.git` 的仓库的 worktree 里跑，stdout 含该项目地图全文
- [x] 在临时 home 本身跑，stdout 为空
- [x] 在远端不在清单里的仓库、不在 git 仓库的目录、没有 home 的情况下各跑一次，stdout 都为空
- [x] 项目地图 2500 字时，stdout 是前 2000 字加一行「已截断」提示
- [x] 登记了但地图文件不存在时，stdout 是一行指出目录位置、地图未写
- [x] 远端统一函数对 https / ssh / 带不带 `.git` / 主机名大小写的单元测试
- [x] hooks.json 的 SessionStart 下多出这一条命令；idea-loop README 同步
- [x] 全量测试通过（`plugin-version` 一条除外：这个 PR 按父 issue 的决定不升版本，见 spec「版本号」）

## 选中的存量回归
- 运行环境检测脚本的测试：同在 SessionStart 下，确认新命令没改它的输出
- 插件结构 / hooks 相关的已有测试（若有校验 hooks.json 形状的）：hooks.json 被改
