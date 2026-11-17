# 02 — home-config 脚本：三处用户级配置的出表与执行

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
一个命令行脚本，把 setup 要做的三处用户级改动的机械部分做掉。两个动作：

- **出表**：列出三处的改前、改后，不写任何东西。三处是：(1) 用户级 `settings.json` 的 `enabledPlugins` 里启用 idea-loop，键名从插件自己的安装路径推出 `<插件>@<marketplace>`，不写死；(2) `autoMemoryDirectory` 设成 home 下 `memory/` 的绝对路径；(3) 用户级 `CLAUDE.md` 换成指向 home 的 `AGENTS.md` 的软链。已经是目标值的项写「已是」；`CLAUDE.md` 已是指向别处的软链的，写「已是别处的软链，要人处理」，执行时不动它。
- **执行**：先把 `settings.json` 和 `CLAUDE.md` 原样复制进 home 的 `.backup/<时间>/`，然后做改动。`settings.json` 其余键原样保留（含 `env`）。`CLAUDE.md` 是普通文件的，把它的全文原样搬进 home 的 `AGENTS.md`（放在 idea-loop 管的 `## 设备地图`、`## 项目` 两节之外），再换成软链。

**能只做其中几处**（参数选三处的子集）：本机实测时只做 (1)(3)，`autoMemoryDirectory` 不动，等 #247 搬记忆时再切（spec「本机实测时不切记忆目录」）。第二次执行同一组，什么都不改。

home 位置 `~/home`、`IDEA_LOOP_HOME` 可覆盖；用户级配置目录取 `HOME` 下的 `.claude`（测试用临时 `HOME`）。导出纯函数 + 命令行入口，照运行环境检测脚本的写法。同步 idea-loop README 的脚本清单（若有）。

## 验收标准
- [x] 临时 `HOME` 下放一份带 `env`、`enabledPlugins` 的 `settings.json` 和一份普通 `CLAUDE.md`：出表输出三处改前改后，文件系统无任何变化
- [x] 执行后 `.backup/<时间>/` 下两份原文件逐字相同
- [x] 执行后 `settings.json` 只多了（或改了）两个键，其余键深相等
- [x] 执行后 `CLAUDE.md` 是指向 home 的 `AGENTS.md` 的软链，`AGENTS.md` 含原 `CLAUDE.md` 全文，idea-loop 两节仍在
- [x] home 的 `.gitignore` 忽略 `.backup/`（home 是 git 仓库时 `git status` 里看不到 `.backup/`）
- [x] 同一个临时 `HOME` 再执行一次：出表三项都是「已是」，执行不改任何文件、不新建备份
- [x] 只选 (1)(3) 时，`autoMemoryDirectory` 不出现在改动里
- [x] `CLAUDE.md` 是指向别处的软链时：出表标「要人处理」，执行不动它
- [x] 全量测试通过（`plugin-version` 一条除外，同 01）

## 选中的存量回归
- 无：新脚本，不碰已有脚本
