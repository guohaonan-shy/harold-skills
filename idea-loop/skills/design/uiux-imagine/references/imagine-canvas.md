# imagine 的画布

imagine 的画布是为了让人在几个真正不同的方向之间选：同一个问题出几个变种，摆在一块变种板上对比，每个变种只做到刚好分得出彼此。它跟 refine 的画布不是一种东西：refine 只有一个方向，求的是做对。

## 目录里有什么

位置见 wiki-conventions 的「目录」一节（`design/tmp/<spec-slug>/imagine/`），本地、不进 git：

```
imagine/
├── board.html            变种板：用 ?variant=<名字> 切变种，?state=<名字> 切状态
├── assets/               变种板引用的素材、抓来的组件与样式、生成的图
├── rounds.md             每轮记录：交回原文、人的原话、点名留下的变种；会话重开后从这里接着做
├── direction-note.md     方向说明：七节，选中变种带构成清单；交给 refine 的那封信
└── handoff/              交接画布：选中的那一版导成的独立页面，refine 的第一版画布从它来
    ├── index.html
    └── assets/
```

## 生命周期

- 变种板、落选变种、抓来的东西只服务于人当下的反应，不往下传。
- 方向说明与交接画布是 imagine 交给 refine 的两样东西。refine 冻结时清掉整个 `imagine/`。
- refine 部分冻结后重开时，`handoff/` 整个重写，只含重开的那几块。
- 交接画布保留 `?state=` 状态切换，状态名与方向说明「验收矩阵」里的一致，refine 的画布沿用同一套名字（见 uiux-refine 的 `refine-canvas.md`）。
