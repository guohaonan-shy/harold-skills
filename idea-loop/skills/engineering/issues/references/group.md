# 一组：父 issue 和子 issue

一组 = 一个父 issue + 挂在它下面的子 issue（平台原生的 sub-issues）。归组、改组由分拣做（`idea-loop:issue-triage`，或项目的分拣 bot），每次改动在父 issue 上留一条评论写依据。

## 父 issue 的正文

`dyna issues new <docs> <标题> <正文文件> --sub=<号>,<号>…` 开父 issue：正文核下面四节，开成 triage（或 `--state=backlog`），挂上子 issue，优先级取它们里最高的。只核正文用 `dyna issues body <docs> <正文文件> --parent`。

```
标题：这一组共同的问题，不写方案

## 要解决什么          必填：一两句，这组 issue 共同的问题
## 子 issue 各自的问题  必填：每个子 issue 一行或一行表格：号、它自己的问题（取它正文的「问题」），优先级
## 冲突或共用的地方     必填：哪几个的判断或方案会互相推翻、哪几个能用同一个改法；grill 从这里开始
## 为什么放在一起       必填：依据：改的是同一处 prompt / 页面 / 模块 / 文件，或一个的方案会推翻另一个
```

父 issue 不带类型、模块：它们留在子 issue 上。

## 改组

- 挂进、摘出：`dyna issues sub add / remove <docs> <父号> <子号>…`，命令同步父 issue 的优先级。
- 每次改组，重写父 issue 正文的「子 issue 各自的问题」「冲突或共用的地方」两节，留一条依据评论。父 issue 已经有会话（in-progress、in-review，或 triage 里有同号会话）的，正文不动，只评论写清挂进或摘出了哪个。
- 父 issue 关了、子 issue 还开着：列出来，提议各自去哪。

## 会话和合并

- 调度只派父 issue 和没有父 issue 的 issue（`dyna issues candidates` 已去掉子 issue）。
- 父 issue 的会话读父 issue 和每个子 issue 的全文（`dyna issues read`），起草一份 spec；spec 的 `issues:` 写父 issue 和它覆盖的子 issue，没覆盖的不写。
- PR 正文每个 `issues:` 里的号一行 `Refs <owner>/<repo>#<号>`。合并后：覆盖了的子 issue 从它等着的状态直接翻 done（`dyna issues set <docs> done <号>`，`reconcile` 也会补）；子 issue 全关了，父 issue 翻 done；还有没覆盖的，父 issue 翻 triage（`--comment` 写关了哪些、剩哪些），白天调度再开会话评估剩下的。
