# 搁置设计：主 checkout 的 `pending/`

人说「这块界面先不做」时，设计整份挪进主 checkout 的 `docs/design/pending/<spec-slug>/`（怎么挪、怎么找回见 `idea-loop:wiki-conventions` 的「design/pending」）。它只在本地、不进 git，所以没有 PR 会替它记账：dreaming 每次对账一遍，免得它们被遗忘在角落。这一项由 dreaming 自己查，不起 agent。

## 怎么查

1. 主 checkout 是 `git worktree list` 的第一行。dreaming 自己的 worktree 是新切的，里面没有 `pending/`，不读它。
2. 列出主 checkout 里 `docs/design/pending/` 下的每个目录；目录不在或为空，这一项整节写一行 `无`。
3. 每个目录 `<名>`，看它的 spec 了结没有，判法跟 [missed-archive.md](missed-archive.md) 一样，对 `origin/<基准分支>`：`git show origin/<基准分支>:docs/spec/<名>/<名>.md` 的 frontmatter `issues:`，逐个 `gh issue view <号> --json state`。
   - 读不到（已经没有 spec 目录），或 `issues:` 里的 issue 全关了：**已了结**。
   - 还有 issue 开着：**未了结**。`issues:` 是空的，判不了，按未了结。
4. 搁置时 spec 里留的指针指向的目录名可能跟 `<名>` 不同（别的需求接着做这块界面时另起了 slug）；读不到 spec 时，先在 `docs/spec/*/` 里搜这个目录名再下结论。

## 提议表里的一行

`搁置设计` 一节，**每一份一行**，了结的和没了结的都列：

| 列 | 写什么 |
|---|---|
| 对象 | `docs/design/pending/<名>/` |
| 发现 | 已了结：哪个 issue 全关了或 spec 目录已不在；未了结：哪个 issue 还开着 |
| 证据 | 主 checkout 路径、目录里有什么（`imagine/`、`canvas/` 到哪一版）、spec 查法与结果 |
| 建议处置 | 已了结 `删除`，未了结 `留着`（闭集） |
| 选项 | 删 / 留着 / 改成… |

`删除` 的行归人定（本地文件，删了 git 找不回，见 `proposal-table-check` 的 `splitAskRows`）；`留着` 的行只是列出来，自动那份不动它。

## 执行段

- **留着**：什么都不做。
- **删除**：只在人批了之后，从主 checkout 里删掉那一个目录（`rm -r <主 checkout>/docs/design/pending/<名>/`）。不进 git、不进 PR；只在汇报里说删了哪几份。人一直不回，就一直留着，下次对账再出现。
