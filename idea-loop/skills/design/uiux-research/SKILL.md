---
name: uiux-research
description: 设计调研——人想知道「别人怎么做」时调它：把人的话收成一句具名问题，起 plugin 自带的 uiux-researcher agent（最新的 Opus，思考强度 medium）去 Refero 的 screens / flows 层查，参考截图下载到本地，写成一页 file:// 能直接打开的 HTML（顶部是具名问题、「研究问题」块里的人的原话与交给 agent 的上下文，再是这些产品的通用结论；中间每个来源一组可点开放大的按 flow 排的截图，加场景 / 设计逻辑两段；最后一块是结合我们需求、要人决策的问题）；调用方会话里只收这页的路径和一句结论，Refero 的调用和整张截图都不进上下文。任何提到 查一下别人怎么做 / 看看别的产品怎么处理 / 参考一下竞品 / 有没有现成的做法 / 业界惯例 / UX pattern / user flow / 退出确认弹窗怎么做 / 空状态怎么写 / how do other products handle / how does X do it / reference research / Refero 的场景都该用它。只查 UX pattern、flow、某类页面的通常做法、文案语气，不查视觉风格。uiux-imagine / uiux-refine 的编排者只在人说要查时才调；执行者碰到拿不准的 UX 问题只写成「建议调研的问题」，不自己查。
allowed-tools: Read, Grep, Glob, AskUserQuestion, Bash(git rev-parse:*), Bash(git check-ignore:*), Bash(git ls-files:*), Bash(ls:*), Bash(node *research-check.mjs:*)
---

# uiux-research

**回答一个具名问题：别人怎么做的、为什么这样做，给人一页能直接打开的 HTML。** 这份文件是入口，写的是**调用机制**；怎么查、页面长什么样写在 `agents/uiux-researcher.md` 和 `../../../references/design/research-backend.md`，这里不复述。

> 先读一次 `../../../references/wiki-conventions.md` 的 §2（`design/tmp/` 的位置与「不进 git」的做法）。

## 0 谁来调，什么时候调

调研**由人决定**：人觉得有必要看看别人怎么做，才查。

- 人直接调 `/idea-loop:uiux-research <一句话>`。
- **普通对话里**（不在 imagine / refine 的编排里）人说「查一下别人的退出确认弹窗怎么做」「看看别的产品怎么写这种空状态」，模型可以自己调起这个 skill。
- **在 imagine / refine 的会话里**，编排者**只在人说要查时**才调。不因为 uiux-imaginer / designer 交回里有「建议调研的问题」就自己调——那是摆给人的取舍，查不查人定。
- 视觉风格不查（配色、字体、气质）：那是 `DESIGN.md` 和随机种子的事。人要的是风格参考，如实说这个 skill 不做，不换着法子去查。

## 1 收成一句具名问题

**一句话，一个决定。** 「退出确认：入口用 X 还是箭头、弹窗怎么摆」是；「这块该是什么感觉」不是。人的话比这大（几个决定连在一起）或太虚，**先问一次**或拆开：一次最多问一个问题，附你的拆法当推荐；不要替人缩成一个他没问的问题。收好之后，在发出前用一句话复述给人，不等确认，直接起。

**同时留住人的原话**：人敲下的那句话，一字不改，和具名问题分开存着。页面顶部要原样摆出这两样（以及你交给 researcher 的上下文；人的原话放在标题为「研究问题」的那块），人才看得出自己问的是什么、agent 拿到的又是什么。

给它起一个**问题短名**（小写、连字符、≤ 4 个词，如 `leave-confirm`），用作目录名。同名目录已存在，加 `-2`，不覆盖上一次的结果。

## 2 定落图目录

项目根 = `git rev-parse --show-toplevel`。第一次用确认 `docs/design/tmp/` 被 git 忽略（`git check-ignore`），不在就按 wiki-conventions §2 的做法追加到 `$(git rev-parse --git-common-dir)/info/exclude`——**落图目录不能进 git 的跟踪**。

| 情况 | 落图目录（绝对路径） |
|---|---|
| **有 spec**：在 imagine / refine 的会话里调，或人点名了一份 spec，或这场对话明显在为某一份 spec 做设计 | `<项目根>/docs/design/tmp/<spec-slug>/research/<问题短名>/`（imagine 和 refine 用同一处） |
| **没有 spec**：普通对话 | `<项目根>/docs/design/tmp/research/<问题短名>/` |

拿不准是哪份 spec（有好几份在设计中、人也没点名）就按没有 spec 放，并在最后一句说明；不猜。

## 3 起 uiux-researcher

用 Agent 工具起 `idea-loop:uiux-researcher`，交给它的只有：

1. 人的原话（一字不改）；
2. 具名问题（上一步那一句）；
3. 产品上下文：目标项目的 `DESIGN.md` 路径（有就给）、一句话说明当前在做什么、平台（web / ios，不确定按 web）；
4. 落图目录的绝对路径。

**不转述方向、不给它任何参考图或上一轮的结论**，也不告诉它「你觉得应该选哪个」。它每次新起，做完就结束。

## 4 收到交回，摆给人

交回应当只有 `index.html` 的绝对路径和一句结论。

1. **核对**：自己再跑一次校验——

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/research-check.mjs" <落图目录>/index.html
   ```

   不绿就把校验输出转回给 researcher（SendMessage 接着它的上下文）补，不替它改页面。researcher 说问题不成立或没做成的，原话告诉人，不拿一页看着完整的页面糊弄。
2. **把 `index.html` 以文件发给人**（会话里发送文件的工具；没有就给 `file://` 地址让人在自己的浏览器里开）。随文件带的话只有两样：具名问题、那一句结论。**不把页面内容、截图、搜索过程搬进对话。** 页面里的截图点一下放大，要靠页面的脚本：内嵌浏览器对 `file://` 只显示静态快照、点不了，要在里面看就在落图目录起一个本地静态服务再开，或让人用自己的浏览器开。
3. 到此为止。**不替人挑**用哪个来源、不顺手把结论转给任何执行者——要不要用、用哪些，是人看完之后的话。

## 5 接回 imagine / refine

只在 imagine / refine 的会话里有这一节。

- **人看完不表态** → 不转。调研结果留在落图目录里，会话继续。
- **人说要转哪些**（「Acme 那个的场景和设计逻辑给它」「第二条决策给它」）→ 编排者从 `index.html` 里取出**对应的文字**（来源的场景 / 设计逻辑，或页面上的通用结论 / 页尾要人决策的条目，原样），作为**这一轮人的意见**用 SendMessage 转给同一个 uiux-imaginer 或 designer，开头写明「调研结论（文字，来自 `research/<问题短名>`）」。**只转文字：不给图，不给图片路径，也不给 `index.html` 的路径**（执行者打开页面就看到图了——种子子代理尤其不接触参考图）。
- **人在 imagine 开工前查过** → 编排者记着这几段文字，起 uiux-imaginer 时作为输入的一部分带上（`../uiux-imagine/SKILL.md` §2）；uiux-imaginer 把它写进交给种子子代理的需求。
- **用上的结论怎么记**：imagine 记进方向说明的「约束与素材」，refine 记进冻结记录；这是执行者的活，编排者转文字时提醒一句「用上了请照常记」即可。
- **执行者交回里的「建议调研的问题」** → 编排者把它和这一轮其它要人判的取舍一起摆给人（带执行者的推荐做法）。人说「查」，就按本文件调一次，问题用那一句；人不说，不查。

## 不做

- 编排者**不自己调 Refero**、不读搜索结果、不看截图；Refero 只在 uiux-researcher 里被调。
- 不替人决定查不查、转不转、用哪个来源；不下方向结论。
- 不改画布、变种板、方向说明、spec；不把落图目录里的东西提交。
