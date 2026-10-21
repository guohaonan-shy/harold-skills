# refine 的画布

refine 的画布是这份 spec 定稿用的高保真设计：方向说明的那一版，做到能让人签字冻结，下游 `idea-loop:implement` 拿它当真值比对。它只有一个方向，求的是做对；imagine 的变种板才是为了在几个方向之间选。

## 放在哪

一份 spec 一个目录，位置见 `idea-loop:wiki-conventions` 的「目录」（`design/tmp/<spec-slug>/canvas/`）。打磨时只在本地；冻结时删掉没签字的版本和 `work/`，其余经设计 PR 提交（[freeze.md](freeze.md)）：

```
canvas/
├── v1.html, v2.html, …        静态画布的各个版本
├── motion-v1.html, …          动效画布的各个版本（开了动效才有）
├── assets/                    画布引用的素材、矩阵截图、动效定格帧
├── work/                      打磨过程：ledger.md、每轮评分 round-<N>.json、给评委的截图
├── <spec-slug>-design.md      冻结记录（签字后才有）
└── flows/                     写回 spec 的交互图（签字后才有）
```

lint hook 只认 `canvas/` 下直接放着的 HTML，所以画布不放进子目录。

## 版本

- 起手那一版是 `v1.html`。之后每一次改动，都从最新一版复制出下一版 `v<N+1>.html` 再改，旧版不动。
- 最新一版就是当前的画布：预览、截图、评委看的都是它。
- 一轮评审对应一个版本：`work/round-<N>.json` 评的是 `v<N>.html`，ledger 每一行写清是哪一版。
- 签字签的是某一版，冻结记录和 spec 里的画布指针都写那一版的路径。
- 动效画布从签过字的静态版本复制出 `motion-v1.html`，往后同样递增。

## 三条约定

下游实现开两个标签页，一边是冻结的画布，一边是实现，逐格比对。画布照 `idea-loop:ui-measure` 的「三条环境约定」写：块与关键元素带 `data-anchor`，字体走目标项目自己的加载方式，每个状态用 `?state=<名字>` 打开。锚点名和状态名是契约，换版本、调构图都不改；状态名进验收矩阵和冻结摘要，设计档案的状态文件和交互图的每一格也用同一个名字。

## 预览

编排者在 `canvas/` 起一个静态服务器，`http://127.0.0.1:<port>/v<N>.html?state=<名字>` 就是某一版的某个状态。截图和测量都走它。
