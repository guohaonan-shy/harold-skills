# 漏归档：绕过合并步骤合进去的需求

`idea-loop:pr-review` 的合并步骤先归档、再合并，没有钩子拦：在网页上点合并、或在别的会话里合并，会绕过归档，设计产物就留在项目目录的 `docs/design/tmp/<spec-slug>/` 里。dreaming 兜这个缺口。这一项由 dreaming 自己机械地查，不起 agent。

## 怎么查

对 home 已提交的内容，不对工作区里别的会话还没提交的文件（下面 `<home>` 是 home，`<名字>` 是项目名）：

1. 列出 `docs/design/tmp/` 下的目录：`git -C <home> ls-tree --name-only HEAD projects/<名字>/docs/design/tmp/`。目录名 `research` 跳过（没有 spec 时的调研页放那里，不算设计产物）。
2. 每个目录 `<名>`，看它里面有没有 `research/` 之外的东西：`git -C <home> ls-tree -r --name-only HEAD projects/<名字>/docs/design/tmp/<名>/`，滤掉 `…/docs/design/tmp/<名>/research/` 开头的路径，还剩文件才算有设计产物。
3. 有设计产物的，看它的 spec：`git -C <home> show HEAD:projects/<名字>/docs/spec/<名>/<名>.md` 的 frontmatter `issues:`，逐个 `gh issue view <号> --json state` 查。
   - 读不到（已经没有 spec 目录），或 `issues:` 里的 issue 全关了：**漏归档**，出一行。
   - 还有 issue 开着：需求还在走，不出行。`issues:` 是空的，判不了，不出行。

上一次 dreaming 没清干净而留在 `docs/design/tmp/` 里的 `dreaming-<日期>/` 也走这三步：它没有 spec 目录，会被查出来。

## 提议表里的一行

`漏归档` 一节，一个目录一行：

| 列 | 写什么 |
|---|---|
| 对象 | `docs/design/tmp/<名>/` |
| 发现 | spec 的 issue 全关了或已经没有 spec 目录；里面还留着哪些设计产物（`canvas/`、`delta/`……） |
| 证据 | 上面的 `ls-tree` 输出摘要与 issue 状态 |
| 建议处置 | `补归档` 或 `丢弃`（闭集） |
| 选项 | 批 / 不批 / 改成… |

怎么建议：画布、冻结记录还在、对应的功能确实上线了，建议 `补归档`；需求已作废、画布与线上对不上、或是 `dreaming-<日期>/` 这类过程残留且 `delta/` 里没有要进档案的对象，建议 `丢弃`。拿不准的建议 `补归档`：它要过 reviewer 核对和归档脚本的校验，核不过就不执行，不会丢东西；丢弃只能靠 git 历史找回。

## 执行段

**补归档**，跟执行段其余改动同一次 `commit`：

1. 开发环境：在代码 worktree（它就是基准分支）里照 `<项目目录>/DEVELOPMENT.md` 准备，自己挑一个空闲端口起服务；浏览器照 `idea-loop:browser` 的「并行时抢锁」，owner 写 `dreaming`。
2. 起 `idea-loop:ui-reviewer`，模式「归档」，输入照 `idea-loop:pr-review` 合并 reference 的「合并前归档」第 1 步：spec 名、项目目录的绝对路径、代码 worktree、端口、图的前缀 `dreaming-<日期>-merge-`。没有 PR：输入里「PR 号」一格填 `dreaming-<日期>-<spec-slug>`，图和草稿就落在代码 worktree 的 `.tmp/pr-review/dreaming-<日期>-<spec-slug>/` 下；没有 review loop 文件，「决定」取自冻结记录。
3. 核不过（`failed`）或未完成：这一行不执行，把它交回的条目原样写进提交消息正文，用『推送』说这一部分没跑成，留着等下一次。
4. 通过：不等人看草稿，直接跑 `dyna design archive write <项目目录> <spec-slug>`（先 `--dry-run`）。脚本先校验，再并进 `prod/`、清掉这个 `tmp/<spec-slug>/`；退出码 1 是拒绝，把它列的违规写进提交消息正文，这一行不执行，也用『推送』说一句。

`dreaming-<日期>/` 这类没有画布的残留：它的 `delta/` 本来就是归档脚本的输入，不起 ui-reviewer，直接照 [archive-reconcile.md](archive-reconcile.md) 的「执行段」第 2、3 步校验、归档。

**丢弃**：删掉项目目录里的 `docs/design/tmp/<名>/`（冻结时提交的东西是被跟踪的，`commit` 会把删除一起提交）。

两种处置后 `docs/design/tmp/<名>/` 都不应还在；它的删除随这次 `commit` 进 home（`commit` 列这个目录路径）。
