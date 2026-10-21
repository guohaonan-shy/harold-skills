# refine 的画布

refine 的画布是这份 spec 定稿用的高保真设计：方向说明的那一版，做到能让人签字冻结，下游 `implement` 拿它当真值比对。它跟 imagine 的变种板不是一种东西：变种板为了让人在几个方向之间选，refine 的画布只有一个方向，求的是做对。

## 放在哪

一份 spec 一个目录，位置见 wiki-conventions 的「目录」一节（`design/tmp/<spec-slug>/canvas/`），本地、不进 git：

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

下游 `implement` 开两个标签页，一边是冻结的画布，一边是实现，逐格比对。三条约定保证两边比的是同一个东西，一条都不能破（全文在 `ui-measure` skill，`../../../engineering/ui-measure/SKILL.md` 的「三条环境约定」）：

1. **锚点**：块与关键元素带 `data-anchor`，名字是契约，换版本、调构图都不改。两个 DOM 靠它对齐。
2. **渲染环境**：字体走目标项目自己的加载方式，不走公共 CDN；截图前等 `document.fonts.ready`，关动画与过渡。
3. **状态用 URL 切**：同一个界面的加载中、空、出错、展开等状态，用 `?state=<名字>` 打开。状态名进验收矩阵和冻结摘要，`implement` 按名字拼 URL 比对，设计档案的状态文件和交互图的每一格也用同一个名字。

## 预览

编排者在 `canvas/` 起一个静态服务器，`http://127.0.0.1:<port>/v<N>.html?state=<名字>` 就是某一版的某个状态。截图和测量都走它。
