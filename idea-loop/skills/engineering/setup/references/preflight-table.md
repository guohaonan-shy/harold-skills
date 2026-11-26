# 预检表

| 项 | 怎么查 | 必需 |
|---|---|---|
| git 仓库与 `origin` | `git remote get-url origin` | 是 |
| `origin/HEAD` | `git symbolic-ref --short refs/remotes/origin/HEAD`；修法 `git remote set-head origin -a` | 是（基准分支的推荐值从这里来） |
| `gh` 已登录、能写这个仓库 | `gh auth status`；`gh repo view --json viewerPermission` 是 `WRITE` / `MAINTAIN` / `ADMIN` | 是 |
| Codex 命令行 | `command -v codex` 有输出 | 是（review 用） |
| 命令行 `dyna` | `dyna version` 能跑、版本在插件要的范围里（不在范围里它自己会说）；没装或太旧，问人同意再跑 `dyna self install`（没装）或 `dyna self upgrade`（太旧），不同意就把这条命令留给人 | 是（skill 和 hook 都调它） |
| 浏览器 | 照『浏览器』与『装与设置』（`dyna runtime show 浏览器`、`dyna runtime show 装与设置`）：要装什么、怎么查、修法都在那里 | 是 |
| 项目接上了吗 | `dyna home where`，看退出码和输出（下表） | 是 |

「项目接上了吗」的结论：

| `where` 的结果 | 结论 | 往哪走 |
|---|---|---|
| 退出码 0，输出里有项目目录 | 已接上：项目目录里有 `docs/` | 往下走，只补缺的 |
| 退出码非 0，「这个项目还没搬进 home」 | 要迁移：代码仓库根里有 idea-loop 的引导文件，或 `docs/` 里有 `spec/` 或 `adr/`，项目目录里没有 `docs/` | 走「迁移」 |
| 退出码非 0，「这个仓库没接上 idea-loop」 | 全新项目（含只有一个普通 `docs/`、没有引导文件和 `spec/` `adr/` 的仓库：那个 `docs/` 不是 idea-loop 的，不动） | 往下走：home 建好项目目录，「写」往里建 |
| 退出码非 0，「当前目录是 home 本身」 | 跑错地方 | 让人去目标仓库的主 checkout 再跑 |
