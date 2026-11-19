# home

home 是这台设备上一个私有 git 仓库（`~/home`，环境变量 `IDEA_LOOP_HOME` 可覆盖，下面都写 `~/home`）：设备地图、项目清单、各项目的地图和记忆住在里面。home 只有 main，改了直接提交，只 `git add` 自己写的文件，里面不放 `CLAUDE.md`。

三步，按顺序；同一台设备上第二个项目跑 setup，第 1、3 步已经做完，只走第 2 步。

## 1. 建 home

`~/home` 已存在就只补缺的文件、小节和 `.gitignore` 里缺的那几行，人写的原样保留，补了的文件 `git add` 后提交一次（message `chore: 补 home`），然后进第 2 步。不存在：

1. `git init -b main`，写下面这几样：
   - `AGENTS.md`：只有 `## 设备地图`（照 `idea-loop:wiki-conventions` 的「home 里的两份地图」里的设备地图模板填）和 `## 项目`（空，第 2 步往里加行）两节。
   - `.gitignore`：三行，`.backup/`、`.tmp/` 和 `.worktrees/`（dreaming 的中间物放 `.tmp/`，对账用的代码 worktree 放 `.worktrees/`）。
   - `memory/`、`projects/` 两个目录，各放一个空的 `.gitkeep`（git 不跟踪空目录）。
2. 提交：`git add AGENTS.md .gitignore memory projects`，message `chore: 建 home`。
3. 用『向人提问』问人推不推到 GitHub 私有仓库，选项「推」「只留本地」。`gh auth status` 已登录推荐「推」，否则推荐「只留本地」；公司虚拟机这类不连远端的设备选「只留本地」。选推：`gh repo create home --private --source ~/home --remote origin --push`。

之后 home 有 `origin` 的，每次提交完 `git push`。

## 2. 登记当前项目

在目标仓库的主 checkout 里取：

- **名字**：`origin` 远端的仓库名（去掉末尾 `.git`）转小写。
- **本地路径**：主 checkout 的绝对路径，home 目录下的写成 `~/…`。
- **远端**：`git remote get-url origin` 原样。没有 `origin` 的仓库：告诉人 hook 认不出它，这一步记「未做：没有 origin」。
- **是什么**：`PRODUCT.md` 第一句；没有 `PRODUCT.md` 就取 `README.md` 第一句。用『向人提问』给人看推荐的说法，人确认或改；说法里不带全角括号（hook 按「（」「）」切这一行）。

做三件事：

1. `## 项目` 里还没有这个名字的行，就加一行，格式一字不差：`<名字>（<是什么>）: <本地路径>. Clone from <远端> if missing.`，例：`example-app（记账小工具）: ~/projects/example-app. Clone from https://github.com/acme/example-app if missing.`。已有这一行的不动。
2. 建 `projects/<名字>/`（项目目录），没有 `AGENTS.md` 时照 `idea-loop:wiki-conventions` 的「home 里的两份地图」里的项目地图模板起草第一版写进去；已有的不覆盖。
3. 提交：`dyna home commit "chore: 登记 <名字>" ~/home/AGENTS.md ~/home/projects/<名字>/AGENTS.md`（路径写成绝对路径）。

起草项目地图：读代码仓库的 `CLAUDE.md` / `AGENTS.md` 和 `README`，只写项目里实际有的层；`docs/` 的几层指向项目目录下的 `docs/`（SKILL.md 的「写」建它，新项目这时还空着），不指向代码仓库；全文 ≤ 2000 字。

## 3. 改三处用户级配置

三处是：用户级 `settings.json` 启用 idea-loop、`autoMemoryDirectory` 指到 `~/home/memory/`、`~/.claude/CLAUDE.md` 软链到 `~/home/AGENTS.md`。机械部分归脚本：

1. `dyna home config plan`：出一张表，每项带改前、改后和状态（待改 / 已是 / 已是别处的软链，要人处理）；它什么都不写。
2. 三项一起把整张表摆给人，问一次。「已是」的项只在表里列着，不再问；「已是别处的软链，要人处理」的项不动，写进交回交给人。没有「待改」的项，这一步跳过。
3. 人同意：`dyna home config apply`，它先把 `settings.json` 和 `CLAUDE.md` 备份进 `~/home/.backup/<时间>/`，再把待改的项全做。人只同意其中几项时，加 `--only <编号或名字，逗号分隔>`（`plugin` `memory` `claude-md`）；没做的项下次跑 setup 仍是「待改」。
4. 提交 home 里脚本写的文件：`git add AGENTS.md .gitignore`（`.backup/` 不进 git）。

脚本需要 `~/home/AGENTS.md` 已存在，所以排在第 1 步之后。
