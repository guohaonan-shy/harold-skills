# uiux-research baseline

`uiux-research` 的产物是**一页给人看的 HTML**。这一页该包含什么、怎么写才对，还在跟人一起收敛——所以这里
**不预设内容断言、不打分**。baseline 只做一件事：每次改了调研 agent、契约或 skill，用同一组问题再跑一遍，
把产物交给人看，人在每个 case 旁边标注问题，标注留档，逐步收敛出「这页应该包含什么」。

> 这是仓库 `CLAUDE.md` §5 的有意例外（原因写在那里）：不是产物比别的重要，而是它的形状还没定，
> 需要一个固定的问题集让人逐次标注，而不是靠记忆比较。

## 里面有什么

```
evals/uiux-research/
├── run.mjs                     一条命令跑全部或指定 case
├── project/                    最小产品上下文（每个 case 都从它的一份干净副本起步）
│   ├── DESIGN.md               Toeflair 设计法的最小版
│   └── PRODUCT.md              产品是什么、用户是谁、这些问题发生在哪几块界面
└── cases/<case>/
    ├── case.json               default prompt（人原本会敲的话）+ 上次真实会话里这次调研帮了什么 / 没帮上什么
    └── annotations.md          留给人标注问题的文件（跑一次记一段，不删旧的）
```

六个 case 取自以前真实的设计会话里调研过的问题：

| case | 问题 | 上次真实会话里 |
|---|---|---|
| `leave-confirm` | 退出确认：入口用 X 还是返回箭头、弹窗怎么摆 | 帮上了：入口改 X、删除按钮改红，弹窗照 Promova 的骨架做 |
| `resume-after-pause` | 暂停后怎么接着练 | 帮上了：找到录音前 3-2-1 倒数的 flow，人选了它 |
| `failure-card` | 失败页要不要放在卡片里 | 帮上了：白底上卡片没有存在理由，人选了无卡片版本 |
| `error-title-tone` | 错误卡标题怎么写得轻松 | 帮上了：改用「感叹词 + 平实事实」 |
| `failed-item-fate` | 进行中的条目失败后留在原位还是归档 | 没帮上：搜到的全是招聘页 |
| `pause-on-modal` | 弹窗出现时要不要暂停 | 没帮上：时间 / 行为维度，静态截图答不了 |

「上次」那一列只是给人对照的：好的结果不一定要复现上次的结论，但最后两个 case 该做到的是**照实说答不了 / 没找到**，
而不是硬凑出看着完整的参考。

## 怎么跑

```bash
node idea-loop/evals/uiux-research/run.mjs --list                    # 看有哪些 case 和它们的 prompt
node idea-loop/evals/uiux-research/run.mjs --only leave-confirm      # 跑一个（冒烟）
node idea-loop/evals/uiux-research/run.mjs                           # 跑全部六个（会真的调 Refero，花钱，夜里跑）
node idea-loop/evals/uiux-research/run.mjs --only a,b --model <alias> --timeout-min 30
```

每个 case 都在 `/tmp/idea-loop-uiux-research/<case>/` 下重新起一份项目副本（git 仓库），用工作树里的 `idea-loop/`
（不是装好的那份）把 default prompt 敲给 `claude -p`，prompt 末尾只加一句「无人值守，不要提问」。跑完留下：

- `output/index.html` 和 `output/shots/`——**产物，人打开这个**（`file://` 能直接开，也能在内嵌浏览器里开）
- `digest.json`——这一跑的事实：调用会话有没有碰 Refero（应为 0）、researcher 调了几次、`research-check` 红绿、花费、模型
- `result.txt`、`run.stream.jsonl`、`project/`——排查用

同一个 case 再跑会覆盖这个目录，**所以标注要写在仓库里的 `cases/<case>/annotations.md`**，不写在 `/tmp`。

## 人怎么用

1. 打开 `output/index.html`，对着页面顶部的「研究问题」（人的原话）和具名问题看：它回答了吗？通用结论成立吗？每个来源的场景和设计逻辑有用吗？截图点得开吗？最后「要我们决策的问题」抓住了真正没定的事吗（答不了的时间 / 行为问题有没有照实写、没有硬凑）？（内嵌浏览器对 `file://` 只显示静态快照，点不了；要在里面看就在 `output/` 起一个本地静态服务。）
2. 在 `cases/<case>/annotations.md` 追加一段：哪里缺了什么、多了什么、错在哪、希望它怎么样。
3. 重复几次之后，把反复出现的标注收成一条「产物应该（不该）包含什么」，写回 `agents/uiux-researcher.md` 或
   `references/design/research-backend.md`；收敛到一定程度，再决定哪些值得变成 `research-check` 的机械检查。

脚本里唯一跑的机械检查是已有的 `scripts/research-check.mjs`（页面形状：顶部的「研究问题」/ 具名问题 / 上下文、通用结论，每个来源的两段齐不齐，图在不在、点不点得开，章节顺序对不对：研究问题与上下文 → 通用结论 → 各来源 → 要我们决策的问题，决策块是最后一块、之后没有别的块；章节里面写什么不查），它红了说明形状坏了，
绿了**不说明**内容好。内容好不好只有人说了算。
