---
name: uiux-research
description: 调研别人怎么处理一个 UX 问题：流程、某类页面的常见做法、文案语气。人问别的产品怎么做时用；视觉风格不归它。
allowed-tools: Read, Grep, Glob, AskUserQuestion, Bash(git rev-parse:*), Bash(git check-ignore:*), Bash(git ls-files:*), Bash(ls:*), Bash(node *research-check.mjs:*)
---

回答一个具名问题：别人怎么做的、为什么这样做，给人一页能直接打开的 HTML。你只管收问题、起调研、把页面交给人；怎么查、页面长什么样归 `idea-loop:uiux-researcher`。查不查、转不转、用哪个来源，都由人定。

人要的是视觉风格参考（配色、字体、气质）时，如实说这个 skill 不做：那是 `DESIGN.md` 和发散段随机种子的事。

## 收成一句具名问题

**一句话，一个决定。** 「退出确认：入口用 X 还是箭头、弹窗怎么摆」是；「这块该是什么感觉」不是。调用方已经给了一句具名问题（比如 imagine / refine 里执行者写的「建议调研的问题」），就用它。人的话比这大（几个决定连在一起）或太虚，**先问一次**或拆开：一次最多问一个问题，附你的拆法当推荐；只收人问到的范围。收好之后，用一句话复述给人，不等确认，直接起。

**同时留住人的原话**：人敲下的那句话，一字不改，和具名问题分开存着。页面顶部要原样摆出这两样和交给 researcher 的上下文，人才看得出自己问的是什么、agent 拿到的又是什么。

给它起一个**问题短名**（小写、连字符、≤ 4 个词，如 `leave-confirm`），用作目录名。同名目录已存在，加 `-2`，保留上一次的结果。

## 定落图目录

项目根 = `git rev-parse --show-toplevel`。第一次用确认 `docs/design/tmp/` 被 git 忽略（`git check-ignore`），不在就照 `idea-loop:wiki-conventions` 的「目录」追加到 `$(git rev-parse --git-common-dir)/info/exclude`：落图目录只在本地。

| 情况 | 落图目录（绝对路径） |
|---|---|
| **有 spec**：在 imagine / refine 的会话里调，或人点名了一份 spec，或这场对话明显在为某一份 spec 做设计 | `<项目根>/docs/design/tmp/<spec-slug>/research/<问题短名>/`（imagine 和 refine 用同一处） |
| **没有 spec**：普通对话 | `<项目根>/docs/design/tmp/research/<问题短名>/` |

拿不准是哪份 spec（有好几份在设计中、人也没点名）就按没有 spec 放，并在最后一句说明。

## 起 uiux-researcher

用 Agent 工具起 `idea-loop:uiux-researcher`，交给它的只有：

1. 人的原话（一字不改）；
2. 具名问题；
3. 产品上下文：目标项目的 `DESIGN.md` 路径（有就给）、一句话说明当前在做什么、平台（web / ios，不确定按 web）；
4. 落图目录的绝对路径。

方向、参考图、上一轮的结论、你的倾向都不给：它从零查。它每次新起，做完就结束。

## 收到交回，摆给人

交回应当只有 `index.html` 的绝对路径和一句结论。

1. **核对**：自己再跑一次校验：

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/research-check.mjs" <落图目录>/index.html
   ```

   不绿就把校验输出用 SendMessage 转回给 researcher 补，页面只由它改。researcher 说问题不成立或没做成的，原话告诉人。
2. **把页面摆给人看**：照 `idea-loop:browser` 的「给人看」，在落图目录起静态服务器，用内嵌浏览器打开 `index.html`。跟页面一起说的话只有两样：具名问题、那一句结论；页面内容、截图、搜索过程留在页面里。
3. 到此为止。要不要用、用哪些来源、转不转给谁，是人看完之后的话。

## 边界

- Refero 只在 uiux-researcher 里调：你不读搜索结果、不看截图。
- 不下方向结论；不改画布、变种板、方向说明、spec；落图目录里的东西不提交。
