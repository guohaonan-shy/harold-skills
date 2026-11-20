---
name: uiux-research
description: 调研别人怎么处理一个 UX 问题：流程、某类页面的常见做法、文案语气。人问别的产品怎么做时用，或设计收敛每一轮给评委意见配参考时用；视觉风格不归它。
allowed-tools: Read, Grep, Glob, AskUserQuestion, Bash(ls:*), Bash(dyna research submit:*), Bash(dyna serve:*)
---

别人怎么做的、为什么这样做：你只管收输入、起调研、把结果交出去；怎么查、文件长什么样归 `idea-loop:uiux-researcher`。两个分支，看谁在要：

| | 整页调研 | 轻用法 |
|---|---|---|
| 谁起 | 人说「查一下」「别的产品怎么做」 | 设计收敛的会话，**每一轮自动起，不用人批** |
| 输入 | 一句具名问题 | 这一版各状态的截图、带编号的评委意见、人的意图与思路、ledger |
| 交回 | 一页 `index.html` 和一句结论，摆给人看 | 一个 `research-light.json`（每条评委意见的用户路径、参考图、新的设计意图），会话收下后拼进设计评审报告 |
| 详细 | 下面「整页调研」起 | 「轻用法」一节 |

整页调研仍只在人说要查时才起；designer 和评委不调研，它们要查的写成「建议调研的问题」交回。参考图只给人看，不放进 designer 和评委的上下文。

人要的是视觉风格参考（配色、字体、气质）时，如实说这个 skill 不做：那是 `DESIGN.md` 和发散段随机种子的事。

## 整页调研

查不查、转不转、用哪个来源，都由人定。

### 收成一句具名问题

**一句话，一个决定。** 「退出确认：入口用 X 还是箭头、弹窗怎么摆」是；「这块该是什么感觉」不是。调用方已经给了一句具名问题（比如 imagine / refine 里执行者写的「建议调研的问题」），就用它。人的话比这大（几个决定连在一起）或太虚，**先问一次**或拆开：一次最多问一个问题，附你的拆法当推荐；只收人问到的范围。收好之后，用一句话复述给人，不等确认，直接起。

**同时留住人的原文**：人敲下的那句话，一字不改，和具名问题分开存着。页面顶部要原样摆出这两样和交给 researcher 的上下文，人才看得出自己问的是什么、agent 拿到的又是什么。

给它起一个**问题短名**（小写、连字符、≤ 4 个词，如 `leave-confirm`），用作目录名。同名目录已存在，加 `-2`，保留上一次的结果。

### 定落图目录

项目目录照 `idea-loop:wiki-conventions` 的「项目目录」拿。落图目录在它的 `docs/design/tmp/` 下，只在本地：home 的提交只带列出的文件，调研页不会被带进去。

| 情况 | 落图目录（绝对路径） |
|---|---|
| **有 spec**：在 imagine / refine 的会话里调，或人点名了一份 spec，或这场对话明显在为某一份 spec 做设计 | `<项目目录>/docs/design/tmp/<spec-slug>/research/<问题短名>/`（imagine 和 refine 用同一处） |
| **没有 spec**：普通对话 | `<项目目录>/docs/design/tmp/research/<问题短名>/` |

拿不准是哪份 spec（有好几份 spec 在做设计、人也没点名）就按没有 spec 放，并在最后一句说明。

### 起 uiux-researcher

用 Agent 工具起 `idea-loop:uiux-researcher`，交给它的只有：

1. 人的原文（一字不改）；
2. 具名问题；
3. 产品上下文：项目目录（`DESIGN.md` 在它下面，有才有）、一句话说明当前在做什么、平台（web / ios，不确定按 web）；
4. 落图目录的绝对路径。

当前运行环境里 researcher 收不到 Mobbin 的原生工具（`dyna runtime show 调用 MCP` 写的不是原生工具调用）：再加一条，把调 Mobbin 三个搜索工具（`search_screens`、`search_flows`、`search_sections`）的写法，照那一节原样放进提示。

方向、参考图、上一轮的结论、你的倾向都不给：它从零查。它每次新起，做完就结束。

### 收到交回，摆给人

交回应当只有 `index.html` 的绝对路径和一句结论。researcher 说 **Mobbin 没连上**：整页调研到此停下，不换来源、不重试；告诉人怎么连，照 `dyna runtime show 装与设置` 里 Mobbin 那一条（要 Mobbin 付费计划），说明只有设计调研受影响。交回末尾带 `ai_usage_notice` 的话，原样转给人。

1. **核对**：自己再跑一次 `dyna research submit <落图目录>/index.html`。不绿就把校验输出用 SendMessage 转回给 researcher 补，页面只由它改。researcher 说问题不成立或没做成的，原文告诉人。
2. **把页面摆给人看**：照 `dyna runtime show 浏览器` 的「给人看」，在落图目录用 `dyna serve start` 起静态服务器，打开 `index.html`。跟页面一起说的话只有两样：具名问题、那一句结论；页面内容、截图、搜索过程留在页面里。
3. 到此为止（完成条件：校验绿、页面摆给了人）。要不要用、用哪些来源、转不转给谁，是人看完之后的话。

## 轻用法

设计收敛的会话每一轮在评委的意见交回之后起一次，不问人。

1. **备好输入**：一个落图目录，每轮一个，放在 `<项目目录>/docs/design/tmp/<spec-slug>/research/` 下（如 `round-2/`；只在本地，同整页调研的「定落图目录」）；各状态的截图路径；评委的每条意见按 `findings` 的顺序编成 `1`、`2`、……，带 `state`、`where`、`detail`、`why`、`reference`；人这一轮的意图与思路原文；ledger 全文（每条带编号）。
2. **起 `idea-loop:uiux-researcher`**：Agent 工具，交给它这五样，并说明走轻用法；运行环境收不到 Mobbin 原生工具时，同整页调研那样把调 Mobbin 的写法放进提示。它每次新起、做完就结束。
3. **收到交回**：只有 `research-light.json` 的路径和一句话。自己再跑一次校验，命令和参数见 `references/light-return.md` 的「校验管什么」，`--opinions` 填刚才的编号，`--ledger` 填 ledger 的编号；不绿就把输出用 SendMessage 转回它补。Mobbin 没连上时文件也合格：会话不重试、不报错，报告里照出「这一轮没有参考图：Mobbin 没连上」。
4. 到此为止（完成条件：校验绿）。文件和截图留在落图目录，交给拼设计评审报告的那一步；你不读搜索结果、不下方向结论、不替人定要不要推翻 ledger。

## 边界

- Mobbin 只在 uiux-researcher 里调：你不读搜索结果、不看截图。
- 不下方向结论；不改画布、变种板、方向说明、spec；落图目录里的东西不提交。
