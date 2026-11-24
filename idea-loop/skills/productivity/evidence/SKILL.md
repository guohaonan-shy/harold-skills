---
name: evidence
description: 写给人看的东西（spec、PR 描述、汇报、要人定的题）要配证据、截图、流程图、图表、动图、录屏时用。
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
- **陌生叫法第一次出现就说清，落到一个具体对象上。** 缩写、内部术语、流程里的叫法（例：「这批题」写成「上周新增的 15 套样题」），说清它是什么、在哪。指它用具体的叫法，不用裸编号；引用编号时带半句内容。
- **叠上去的东西要说明**：为了让人看懂而叠加的光圈、鼠标位置点、角落的秒表不属于产品，在这一组图的开头用一句话说明。

写完逐条对过一遍，每条说得出在哪句话上做到了；这部分没有脚本校验。

## 配什么图：你来判断

看这条证据要人判断的是什么，按下表挑最快能让人看懂的那一种，再读它的做法文件（路径前缀都是 `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/`）：

| 要人判断的是什么 | 形态 | 工具 | 做法 |
|---|---|---|---|
| 一个画面上某处对不对 | 截图标注 | 『浏览器』截组件，`dyna design flow compose` 单格加光圈 | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/screenshot.md` |
| 几个画面之间怎么走、之前 / 之后 | UI 流程图 | `dyna design flow compose` | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/ui-flow.md` |
| 结构、时序、状态、数量对比 | 图表 | excalidrawer 的入口 skill | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/chart.md` |
| 动起来哪里不对、动效顺不顺（一件事，10MB 装得下） | 动图 | Playwright 帧序列或录屏 + ffmpeg | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/gif.md` |
| 一段多步流程整体走下来对不对，或动图超 10MB | 录屏 | Playwright `recordVideo` / 模拟器录屏 + ffmpeg 转 mp4 | `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/video.md` |
| 规则覆盖了谁、数值对不对 | 表或一行例子 | 正文 | 正文：场景 × 有没有覆盖，或输入 → 之前的结果 → 现在的结果 |

图放在哪、文件怎么起名、要不要上传，由调用你的 skill 定，这里不管。
