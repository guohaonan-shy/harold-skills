---
name: design-change
description: 设计已冻结的需求里，人接受了一处跟画布不同的设计，要把这处改进画布时用。
---

冻结之后，`docs/design/tmp/<spec-slug>/canvas/` 是这个需求唯一的设计真相，`idea-loop:designer` 是它唯一的修改者：编排者不手改画布，不手改 `delta/`。人接受了一处跟画布不同的设计，来源三种：review 里人接受了实现；实现者做不下去、停下汇报里人接受了改法；人自己改主意。

调用这个 skill 的会话是**编排者**：PR 开出前是 `idea-loop:implement` 的会话，开出后是 `idea-loop:pr-review` 的会话。调用方的 skill 说清停下后怎么交人、代码不一致时怎么派实现者；这里只讲画布怎么改、怎么评、怎么记。

没有设计稿的 UI 改动（没有画布）不走这一条：实现者在 `delta/` 记「最小差异」。

## designer 做

编排者用 Agent 工具新起 `idea-loop:designer`，任务「设计变更」，给：

- 画布路径（`canvas/` 里最新一版）
- 人的原话
- 受影响的状态名（画布 `?state=` 的名字）
- 相关截图（实现的截图、停下汇报里那张图，或人给的）
- 评委没过时，要改的意见

它做：

- 从最新一版复制出 `v<N+1>.html`，旧版不动，**只改受影响的格子**：人的原话对应的那几个状态的标记与样式。别的格一字不动；改完把没动的格在同一 viewport 下各截一张，跟改之前一致，不一致就修回。
- 状态名与锚点名是契约，改格不改名；人要的是新增一格，用新名字，加进冻结摘要的状态矩阵。
- 改过的格重截，覆盖 `assets/` 里同名的矩阵截图；用 `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-lint.mjs" <v<N+1>.html 的路径>` 过一遍。
- 人的原话与画布、方向说明矛盾时，照人的原话改，交回时点出矛盾。不落 ledger：`work/` 在冻结时已经清掉，这一次的记录在冻结记录的「冻结后的变更」里，由编排者记。
- 评委意见交回来时，编排者用 SendMessage 接着这个 designer，改成 `v<N+2>`。

交回照 `designer.md` 的「交付」格式：新一版的版本号；改动的每一格的截图路径，放 `canvas/work/change-<序号>/`（不提交）；「改了什么」写清改了哪几格、没动的格已比对一致。

## 评与停

编排者新起一个 `idea-loop:ui-master`，跑完即弃，只给：改动那几格的截图、冻结记录「意图」节的那句话、这一轮看静态。

把评委的 `findings`、`score` 和这一次变更自己前几轮的分数（`history`，从旧到新；打磨期的分数不带进来）写成 `canvas/work/change-<序号>/round-<N>.json`，跑：

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/critic-score.mjs" "<canvas>/work/change-<序号>/round-<N>.json"
```

退出码 `2` 是评委的输出不合格式：作废这一轮，新起一个 ui-master 重评。按它的停止判定走：

| 停止判定 | 做什么 |
|---|---|
| `继续` | 把评委意见 SendMessage 交回同一个 designer，改完再评 |
| `瓶颈` | 停下，把评委意见和新旧两版截图交给人，照调用方 skill 写的方式 |
| `方向` | 同 `瓶颈`：评委认为方向有问题，由人判 |
| `通过` | 往下 |

## 过了之后

编排者：

1. 提交画布：`git add -f docs/design/tmp/<spec-slug>/canvas/v<N+1>.html docs/design/tmp/<spec-slug>/canvas/assets docs/design/tmp/<spec-slug>/canvas/<spec-slug>-design.md`（`work/` 不进），提交信息 `docs(design): <spec-slug> 设计变更 —— <一句话>`，推送到当前分支：实现期间是集成分支，review 期间是 PR 分支。
2. 冻结记录「冻结后的变更」记一行，跟画布同一个提交（第一次记时把冻结时写的「无」换成表头）：

   ```
   | 日期 | 画布版本 | 改了哪几格 | 人的原话 | 评委分 |
   |---|---|---|---|---|
   | 2026-10-24 | v6 | cookbook--search-loading | 「加载态不要骨架屏，一条细进度条就够」 | 9 |
   ```

   「改了哪几格」写状态名，多格用逗号；「评委分」是最后一轮 `critic-score.mjs` 的分数；「画布版本」是这一行之后的最终画布：它与冻结摘要里的画布指针不同时，以这一节最后一行的版本为准。
3. 回到调用方 skill：代码跟新画布不一致、而且来源不是「接受实现」的，由它派实现者照新画布做；人不再单独看新画的那几格，实现出来后在 review 里照常看到。
