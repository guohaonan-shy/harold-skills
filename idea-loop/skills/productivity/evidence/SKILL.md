---
name: evidence
description: 证据：支撑你的观点、让人读得懂你说的事——什么算证据，有哪几种（截图标注、UI 流程图、图表、动图、录屏）。跟人说一个判断或结论、交付任何给人看的东西（对话、spec、PR）时用。
---

home 固定文案「证据」一节是总纲，这里只写它之外的。

## 证据是什么

证据支撑一个观点、想法或决策。读的人清楚方向和高层设计，不清楚实现细节，要靠证据快速看懂这件事、快速做出判断，不用回头追问「现在到底是怎么做的」「有多少」「这个词是什么意思」。

- **出题前对最新基准再核一次**，前提变了就重写或撤掉。
- **比对类证据在同条件下做**：同语言、同数据、同版本、同设备。条件对不上，就不拿来比。
- **复现才是证据。** 凭读代码写出来的根因是猜测；用户看得见的问题，按用户的操作把路径真的走一遍；后端和数据的问题，原样贴查询结果、日志、接口响应，标上条件和时间。没复现的写明没复现、卡在哪、依据是什么。
- **证据取自要判断的那个东西本身**：判断问题，取自复现；判断设计，取自冻结画布；判断交付，取自实现。原样取用。

## 整体风格

- **用能说清要点的最小一种视图**；一句话说清的，只写这句话。
- **叫法用读的人已经认识的**：术语表（`GLOSSARY.md`）里的标准叫法，或这场会话里已经说过的；两处都没有的，第一次出现时说清它是什么、在哪。
- **叠上去的东西要说明**：为了让人看懂而叠加的光圈、鼠标位置点、角落的秒表不属于产品，在这一组图的开头用一句话说明。

写完逐条对过一遍，每条说得出在哪句话上做到了；这部分没有脚本校验。

## 证据的几种形态

每种形态让人看到的东西不同，按这条证据要人看到什么挑一种，再读它的做法文件：

| 形态 | 让人看到什么 | 工具 | 做法 |
|---|---|---|---|
| 截图标注 | 单个画面上的问题：哪一处不对 | 『浏览器』截组件，`dyna design flow compose` 单格加光圈 | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/screenshot.md` |
| UI 流程图 | 用户路径整体摆出来：交互哪里变了，站在用户的角度快速过一遍 | `dyna design flow compose` | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/ui-flow.md` |
| 图表 | 结构、时序、状态、数量对比 | excalidrawer 的入口 skill | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/chart.md` |
| 动图 | 构思、设计、修改的过程中，当前或改后的交互和动效是什么样 | Playwright 帧序列或录屏 + ffmpeg | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/gif.md` |
| 录屏 | 端到端的交付：一条流程完整走下来，放进 PR 里验收 | Playwright `recordVideo` / 模拟器录屏 + ffmpeg 转 mp4 | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/video.md` |
| 表或一行例子 | 规则覆盖了谁、数值对不对 | 正文 | 正文：场景 × 有没有覆盖，或输入 → 之前的结果 → 现在的结果 |

图放在哪、文件怎么起名、要不要上传，由调用你的 skill 定，这里不管。
