---
type: raw
source_type: web
captured: 2026-09-11
title: Lenny's Newsletter —— How to turn your AI into a world-class designer（Anshu Chimala）
tags: [design-workflow, critic-loop, seed-strings, asset-generation]
related: ["[[design-loop-v2]]", "[[2026-09-11-design-loop-prototype-critic]]"]
---

> 来源：https://www.lennysnewsletter.com/p/how-to-turn-your-ai-into-a-world 。抓取于 2026-09-11。作者 Anshu Chimala，前 Apple 设计师/工程师。文章后半段（Technique 7 "Remove AI tells"）在付费墙后，未抓到。以下是忠实摘录，非本仓库观点。

## 总体结构

按 Double Diamond 分三段：Discover（探索可能性空间）→ Define（建立个体设计身份）→ Deliver（打磨）。核心主张：全程注入个人品味和创意方向，"when you actively steer the design direction, you end up with something only you could have created."

## Discover

**Technique 1 · 随机种子字符串**。问题：标准 prompt 产出重复的通用结果，因为模型预测最可能的 token。做法：让模型用 shell 生成随机字母数字串，以它为设计灵感来源，避免落回熟悉模式。作者展示了生产力 app 落地页从"紫色渐变、左文右图"模板变成真正多样的构图。原 prompt：

> "I want you to build me a landing page for my productivity app. Follow this procedure: 1. Generate a long, random alphanumeric string using a shell script. 2. Define the creative direction (color scheme, layout, typography, etc.) based on the string. 3. Use your judgment to bring this direction to life and make it look great."

作者没有规定种子长度或每轮数量。

**Technique 2 · 有野心且具体的 prompt**。不要直接要求"独特"，给具体创意方向（"bold pixel art theme"、"isometric living 3D city"）。建议流程：让 AI 列一堆**刻意缺乏细节**的想法，目的只是激发想象；可视化其中喜欢的几个，记录自己对不同方向的反应；让 AI 精修；迭代到满意；然后让 AI 写出构建它的 prompt。

## Define

**Technique 3 · subagent 反馈环**。设一个"设计评委"模型，看当前设计的**截图**（不是代码），对照"工作室级别的执行"打分。原 prompt：

> "I want you to improve this design. To figure out what to focus on, use a Fable 5 subagent as a design critic. Follow this procedure at each iteration: Capture a screenshot of the current design; Invoke the critic in a fresh context, with just the screenshot, not the code, implementation details, or earlier iterations/critiques; Ask it to evaluate the aesthetic that the design is going for, imagine how a top design studio would execute this aesthetic, then outline the biggest gaps."

评委指引：同时看"high-level structure and composition as well as fine details"；"Watch out for patterns that feel overdone, excessive, or obviously AI-generated"；"tight, specific feedback, not vague prose"；"Be bold and opinionated, not rely on what's safe or easy"。

架构：执行者是 Claude Fable 5 或 Opus 5，评委是 Fable 5；评委每轮新开上下文只收一张截图；停止阈值 9/10 以上，**阈值不告诉评委**；评委 token 占总量不到 10%，所以用得起最贵的模型；作者建议先跑一两轮看收敛再决定继续。整个环在 Claude Code 里用 subagent 跑。

**Technique 4 · 图片生成**。模型天然不用视觉素材，默认用代码渐变和形状。给 API key（OpenAI / Gemini / fal.ai），显式要求生图。原话："Add more personality using image generation. Consider shaders or 3D effects in combination with images to create more interesting visuals."

**Technique 5 · 视频生成做动效**。用 fal.ai 一类聚合器（提到 Seedance 2.5）：生成抠色背景的循环片段嵌进 UI；在关键帧图片之间插值生成产品状态之间的流畅过渡。例子：行李箱落地页，悬浮 → 落地 → 打开三个状态与滚动位置同步。

## Deliver

**Technique 6 · 减法**。AI 倾向过量。去掉：不必要的装饰效果（glow、渐变）；图片已经说清时的冗余标签；原生 OS 控件能用时的自造组件。原 prompt："Simplify the layout into an image-centric grid; Get rid of gradients, glows, and unnecessary containers; Aim for a truly minimalist aesthetic that feels Apple-native." 作者的卡路里 app 从过度设计（粉色 glow、随机高亮、啰嗦标签）变成真正的极简。

**Technique 7 · 去 AI tells**。付费墙后，未抓到。

## 提到的工具

Claude Code、Claude Opus 5、Claude Fable 5、GPT-5.6 Sol、Codex、OpenAI / Gemini 生图 API、fal.ai、Seedance 2.5、Lovable、Replit、Factory、Antigravity、Grok Build。
