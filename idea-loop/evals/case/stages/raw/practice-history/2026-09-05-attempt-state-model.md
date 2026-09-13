---
type: raw
source_type: prototype
tags: [practice-history, attempt-state-model]
captured: 2026-09-05
summary: 一次 attempt 的状态模型定不下来，用可点击原型取证，选了「草稿不占 attempt 编号」那一版
related: ["[[practice-history-surface]]"]
---

# 一次 attempt 的状态模型该长什么样

## 1 问题

**一次 attempt 从开始到出分，中间有哪些状态；草稿算不算一次 attempt。**

这句话原样显示在原型页面顶部，整场没改写。

## 2 原型

[[attempt-state-model]]（同桶 `assets/`）。状态面板显示当前状态与来路，自由操作区有
「开始 / 离开 / 提交 / 评分成功 / 评分失败 / 重试 / 丢弃」七个按钮，walkthrough 分三个 tab：
正常出分、中途离开再回来、评分失败重试。

两个变体：

- **A —— 草稿占编号**：一开始录音就分配 attempt #N，草稿是 #N 的一个状态。
- **B —— 草稿不占编号**：草稿是一张独立的未编号纸，提交那一刻才分配 attempt #N。

## 3 裁决

选 **B**。

人的原话："草稿占编号的话，我在一道题上开三次又关三次，历史里就多三条空记录。
学生看到 attempt #4 但只有一次真的答过，这个数字就废了。attempt 编号得是'我真的交过几次'。"

附带落定的两条：

- 草稿**每题只保留一份**，再开一次就续写那份，不叠加。
- 评分失败**不消耗 attempt 编号的重新分配**——它仍是那次 attempt，只是没出分，重试是同一条记录上的动作。
