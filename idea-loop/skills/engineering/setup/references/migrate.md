# 迁移

0.1.x 的项目（引导文件和 `docs/` 在代码仓库里）搬进 home：六步，按顺序，一个项目一次做完，中间不隔夜（没搬完的项目里，调度、分拣、dreaming 都会停下）。在这个项目的主 checkout 里跑；这个 checkout 要停在基准分支、工作区干净、已拉到 `origin` 的最新（基准分支读第 2 步之后项目目录里 `DEVELOPMENT.md` 的「分支」，第 2 步之前问人）。

每一步都是「出表 → 人看 → 先备份 → 执行」：表给人看过、人说了才执行；备份的位置写在每步里；人按轮定的事，一轮一轮问，不一次堆给人。命令的输出原样摆给人，不转述成别的数字。

同一台设备再跑一次：已搬的项目，每一步的表都是「已是」，什么都不做。

## 1. 登记

项目不在项目清单里：照 [home.md](home.md) 的第 1、2 步（建 home、登记当前项目）做，建出项目目录和项目地图，项目地图里的路径指向东西现在的位置。**home.md 的第 3 步（四项用户级配置）这时不做**：`memory` 项（切 `autoMemoryDirectory`）要等本文第 3 步记忆复制完才切，早切会让新开的会话读到还没复制记忆的目录。

完成条件：`dyna home projects` 里有这个项目（`inHome` 还是 `false`）。

## 2. 盘点并复制知识库

1. `dyna home config plan --only knowledge --project <名字>`：三张表给人。
   - 盘点表：每份 git 跟踪的文件或目录、文件数、归类、去哪。「去哪」空着的是「判不了」，只有「项目目录」「留在代码仓库」两个值。
   - 写死 `docs/` 的文件：仓库自己的工具里指着本仓库 `docs/` 的行；留在代码仓库，第 5 步改路径。
   - 开着且改了 `docs/` 的 PR：每个让人二选一，「先合，之后再复制」或「把它的 `docs/` 改动搬进 home、PR 里删掉」。表后写着「查不到」的，说明 `gh` 没能列 PR，让人先处理 `gh` 再回来。
2. 「判不了」的行和每个 PR，都按人这一轮的话定。选「先合」的 PR：让人合，合完在主 checkout 拉到最新，再往下。
3. 把 `plan --only knowledge --project <名字> --json` 的输出存成 `<home>/.backup/<时间>/plan.json`，按人的话填完每个空的「去哪」。
4. `dyna home config apply --only knowledge --project <名字> --plan <上面那个文件>`：复制 git 跟踪的文件，`docs/` 最后落位（先复制进临时目录，引导文件就位后才改名成 `docs/`，中途失败就没有 `docs/`，重跑从头来），提交到 home。它不改代码仓库里的任何文件，也不会盖掉已搬的项目。把这时主分支的提交号记下，第 5 步要用。
5. 选「搬进 home」的 PR：对每个，取出它改的 `docs/` 文件（相对它和主分支分叉点的改动），写进项目目录里同样的相对位置，一起提交到 home；PR 那一侧留到第 5 步，跟删 `docs/` 一起在它的分支上去掉这些改动。
6. 提交被 docs 检查拒了：它列了文件和行号（重名 slug、死链），在 home 里的项目目录修好，再提交项目目录里的这些文件，提交成功才算这一步完成。已复制的文件留着，不重跑 `apply`（`docs/` 已在，它会说「已搬」）。

备份：计划文件在 `<home>/.backup/<时间>/`，`apply` 还会再留一份；`.backup/` 不进 git。

完成条件：`dyna home projects` 里这个项目 `inHome: true`；`apply` 打印的「已复制 N 个文件」的 N 等于盘点表里去「项目目录」的行的文件数之和；每个 PR 都有人定的去向。

## 3. 记忆

三小步，同一次里做完，中间不开别的会话（合出来的索引在压缩前有 200 行左右，早开会话会让它们读到一份超长的记忆）：

1. `dyna home config plan --only memories` 给人看（每个有记忆的目录、项目前缀、文件数、索引行数），人说了再 `dyna home config apply --only memories`：记忆文件复制进 `<home>/memory/`，文件名带项目前缀，各份索引合成一份 `MEMORY.md`，提交到 home。旧目录不动，同名文件已在就停下报出来、不覆盖。
2. `dyna home config apply --only memory`：只切 `autoMemoryDirectory` 这一项，改前的 `settings.json` 备份进 `<home>/.backup/<时间>/`。`memory` 项已是（早先跑过四项配置）就跳过这小步。
3. 用 Skill 工具调 `idea-loop:dreaming`，说只跑记忆那一段，压到 `dyna home memory check` 退出码 0（140 行内）。

压不下去：把 `autoMemoryDirectory` 改回备份里 `settings.json` 的原值，告诉人原件还在旧目录、压缩没成。

完成条件：`dyna home memory check` 通过且 `autoMemoryDirectory` 指到 home 的 `memory/`；或压缩没成、目录已改回、人已知道。人拒绝这一项：记「人拒绝」，往下走。

## 4. 用户级 skill

1. `dyna home config plan --only skills --json`：给人看每行的名字、是不是软链、指向哪、近 30 天调用次数。人逐行定「留」或「删」，填进 JSON 每行的 `decision`，存成 `<home>/.backup/<时间>/skills-plan.json`。
2. **删的清单单独再确认一次**：把所有「删」的行再列成一张表给人，人说「删」才继续；人改了主意，改回「留」，再确认一次。
3. `dyna home config apply --only skills --plan <上面那个文件>`：先备份整个 `~/.claude/skills/` 进 `<home>/.backup/<时间>/skills/`，留的复制进 `<home>/skills/`（软链复制它指向的内容，home 里存实体），删的从 `~/.claude/skills/` 移除（软链指向的原内容不动），全部定了就把 `~/.claude/skills` 换成指向 `<home>/skills/` 的软链，提交到 home。有行没定，它不换软链，把没定的报出来，回到第 1 步补。

完成条件：`dyna home config plan --only skills` 里这一项是「已是」；或人拒绝这一项，记「人拒绝」。

## 5. 代码仓库的 PR

删文件的 PR 在代码仓库的主 checkout 之外开，不碰主 checkout：

1. 用 `dyna worktree add <名字> --base <基准分支>` 建 worktree，从基准分支切出分支。
2. 在这个 worktree 里：
   - 删掉搬走的引导文件和 `docs/`（盘点表里去「项目目录」的行；去「留在代码仓库」的不动，`.gitattributes`、`.gitignore` 本来就留着）。
   - 项目级启用 idea-loop 的设置：提交在仓库里的那份（`.claude/settings.json`）在 PR 里去掉；只在本机的文件（`.claude/settings.local.json`）不进 git，先备份进 `<home>/.backup/<时间>/`，再直接改本机文件。
   - 把盘点表「写死 `docs/` 的文件」里指向本仓库 `docs/` 的路径，改成项目目录里的路径（`<home>/projects/<名字>/docs/…`）；指向外部网址的不动。
   - 代码仓库 `AGENTS.md` 删掉「issue 分类」一节和 idea-loop 写的 `## idea-loop` 一块（这两处的内容已在项目目录的 `ISSUE_TRACKER.md`、项目地图里）。
   - 第 2 步里选了「搬进 home」的 PR，在它们各自的分支上去掉那些 `docs/` 改动。
   - 这个仓库的测试读了仓库自己的 `docs/` 的，改成 `docs/` 不在时跳过那几条断言（或读固定在测试旁的样本），在 worktree 里跑一遍相关测试。
3. 提交、推送、开 PR 给人合，PR 描述写清删了什么、去了哪（项目目录）、人合之前要做的事（见下）。合并只由人做。
4. **合之前**对着主分支最新的状态再复制一次：第 2 步记下的提交号到主分支最新之间，`docs/` 和引导文件有变化的文件（新增、改了、删了）按同样的相对位置同步进项目目录；`ISSUE_TRACKER.md` 在第 2 步被改写过，它在这一段里变了就把差异给人，由人定怎么并；同步完提交到 home，提交被拒的照第 2 步第 6 点修。没有变化就写「没有变化」。

完成条件：PR 已开、链接给了人；合之前的再复制做过一次并提交。

## 6. 收尾

- 停用这个项目的 `dreaming-<仓库名>` 定时任务（用『定时任务』：做法照 `dyna runtime show 定时任务`），只停用不删，名字写进交回，删由人点。`dispatch-<仓库名>` 不管：起 `dispatch-home` 时调度自己停；`triage-<仓库名>`、`seo-scan-<仓库名>` 是项目级的，不动。
- 交回一张改前改后对照表，每项数字都来自这一次真跑出来的输出：

| 项 | 改前 | 改后 |
|---|---|---|
| 搬进 home 的文件数 | 盘点表里去「项目目录」的行的文件数之和 | `apply` 打印的已复制数 |
| 记忆条数 | 各旧目录的文件数之和 | `<home>/memory/` 的文件数（不含索引） |
| `MEMORY.md` 行数 | 合并后压缩前 | `dyna home memory check` 报的行数 |
| `~/.claude/skills` | 条目数 | 条目数，是否软链到 home |
| 删文件的 PR | — | 链接、是否已合 |
| 停用的定时任务 | — | 名字 |

完成条件：这张表交给了人，PR 链接和停用的任务名都在里面。
