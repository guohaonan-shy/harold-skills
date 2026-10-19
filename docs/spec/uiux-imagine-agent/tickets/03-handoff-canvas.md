# 03 — 交接画布：refine 从 imagine 选中的那一版接着做

**Blocked by**：01 — imagine 拆成编排者 + uiux-imaginer
**设计冻结**：不涉及 UI

## 要建什么

imagine 收工时不再把人选中的那一版删掉：uiux-imaginer 把它导出成一张独立的交接画布（去掉对比页外壳、变种切换和别的变种，保留状态切换、真动效和从线上克隆来的组件与样式），放在 imagine 工作目录下的交接子目录（spec §4.8 约定的位置）。refine 开工时，designer 拿这张交接画布当第一版画布，不再从方向说明的文字重建，也不再重抓线上组件。

要点（spec §4.8）：

- imagine 收工的「清掉渲染物」改成：对比页、落选变种、style tile、两个本地服务清掉；交接画布和方向说明留着。refine 冻结后连同 imagine 工作目录一起删（现有规矩不变）。
- refine 的开工前置在「方向说明在、过校验」之外加上「交接画布在」。方向说明在而交接画布不在（旧流程留下的 spec）时，退回从文字重建，并在交回里明说走了退路。
- designer 定义里「不读发散那一段的任何渲染物」改成「只读交接画布，不读对比页和落选变种」；它从交接画布复制出 refine 的画布，在上面接着做。
- 部分冻结、其余回 imagine 的情况：第二轮 imagine 以冻结画布为基线，收工交出的交接画布只含重开的那几块；designer 只把这几块接进已冻结的画布。

## 验收标准

- [ ] imagine 收工后：交接画布在、能在浏览器里打开并切换状态；对比页和落选变种不在；方向说明在。 ⏭ 延后 → 05：要起真的 uiux-imaginer 才看得到；05 的 uiux-imaginer 直跑格与 imagine 格断言收工后 `handoff/` 在、对比页与落选变种不在。定义里的导出规则（uiux-imaginer §10 第 4–6 步、browser-usage「The handoff canvas」）与编排者核对（imagine SKILL.md §5 第 2 步）已写
- [ ] 收工后调 refine：designer 第一版画布与交接画布在相同 viewport 下截图比对一致；designer 的过程里没有重起前后端、没有重抓线上组件。 ⏭ 延后 → 05：05 的 refine 格种子带 `handoff/`，断言第一版画布来自它、ledger 第一行有比对结论、没重抓线上组件。designer 定义 §2「从交接画布起手」已写比对步骤与那行 ledger，`static-ui-protocol.md` §R 加了例外
- [ ] 对一份只有方向说明、没有交接画布的 spec 调 refine：designer 从文字重建，交回里写明走了退路。 ⏭ 延后 → 05：现有 refine 格的种子本来就没有 `handoff/`，05 在断言表里补「交回里明说走了退路」。refine SKILL.md §0 与 designer 定义 §2 的退路行已写
- [ ] 部分冻结后重开：交接画布只含重开的几块，已签字的部分在冻结画布上原样不动。 ⏭ 延后 → PR 交付验收：要先冻结一部分、再跑第二轮 imagine、再调 refine，一次三段的真会话，eval 的种子与断言不覆盖（也没有哪一格的范围能让它变得可证明）；定义里已写：uiux-imaginer §10 第 4 步「重开一部分的第二轮发散」、designer 定义 §2「部分冻结后重开」含已签字部分的回归截图
- [x] refine 冻结后 imagine 工作目录（含交接画布）与 refine 工作目录都清掉。（designer 定义 §11.1 清整个 `.tmp/uiux-imagine/<spec-slug>/`，`handoff/` 在其中；refine SKILL.md §5 的核对清单与 baseline 的 `freeze-clears-tmp` 断言都是按目录判，不用改）
- [x] plugin 脚本单测套件全绿。（`node --test 'idea-loop/scripts/*.test.mjs'`：193/193）

## 选中的存量回归

无 test-cases 库。本仓库真实存在的是：

- **baseline eval 的 refine 那一格**——它的「冻结后两个临时目录都清掉」「交互图写回 spec」「状态留在设计中」三条断言在改了起步方式后必须照旧成立；用 `--grade-only` 重判，整跑交给人晚上跑。
- **baseline eval 的 imagine 那一格**——它现在断言「只交出方向说明、其余清空」，这张改了收工的清理范围，要跟这张一起看它会不会误红（断言本身的更新在 05）。
