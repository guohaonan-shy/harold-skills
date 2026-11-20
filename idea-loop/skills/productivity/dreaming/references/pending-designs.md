# 暂缓设计：项目目录的 `pending/`

人说「这块界面先不做」时，设计整份挪进项目目录的 `docs/design/pending/<spec-slug>/`（它是什么见 `idea-loop:wiki-conventions` 的「目录」里 `design/pending/` 那一行；怎么挪、怎么找回在 `uiux-refine`、`uiux-imagine` 里）。它只在本地、从不提交，所以没有提交会替它记账：dreaming 每次对账一遍，免得它们被遗忘在角落。这一项由 dreaming 自己查，不起 agent。

## 怎么查

下面 `<home>` 是 home，`<名字>` 是项目名，`<项目目录>` 是 `<home>/projects/<名字>/`。

1. `pending/` 不提交，所以读工作区，不读 home 的 `HEAD`：列出 `<项目目录>/docs/design/pending/` 下的每个目录；目录不在或为空，这一项整节写一行 `无`。
2. 每个目录 `<名>`，看它的 spec 了结没有，判法跟 [missed-archive.md](missed-archive.md) 一样，对 home 已提交的内容：`git -C <home> show HEAD:projects/<名字>/docs/spec/<名>/<名>.md` 的 frontmatter `issues:`，逐个 `gh issue view <号> --json state`。
   - 读不到（已经没有 spec 目录），或 `issues:` 里的 issue 全关了：**已了结**。
   - 还有 issue 开着：**未了结**。`issues:` 是空的，判不了，按未了结。
3. 暂缓时 spec 里留的指针指向的目录名可能跟 `<名>` 不同（别的需求接着做这块界面时另起了 slug）；读不到 spec 时，先在 `<项目目录>/docs/spec/*/` 里搜这个目录名再下结论。

## 提议表里的一行

`暂缓设计` 一节，**每一份一行**，了结的和没了结的都列：

| 列 | 写什么 |
|---|---|
| 对象 | `docs/design/pending/<名>/` |
| 发现 | 已了结：哪个 issue 全关了或 spec 目录已不在；未了结：哪个 issue 还开着 |
| 证据 | 项目目录路径、目录里有什么（`imagine/`、`canvas/` 到哪一版）、spec 查法与结果 |
| 建议处置 | 已了结 `删除`，未了结 `留着`（闭集） |
| 选项 | 删 / 留着 / 改成… |

`删除` 的行归人定（本地文件，删了 git 找不回，由 `dyna dreaming table split` 判进问人的小表）；`留着` 的行只是列出来，自动那份不动它。

## 执行段

- **留着**：什么都不做。
- **删除**：只在人批了之后，从项目目录里删掉那一个目录（`rm -r <项目目录>/docs/design/pending/<名>/`）。不进 git、不进提交；只在汇报里说删了哪几份。人一直不回，就一直留着，下次对账再出现。
