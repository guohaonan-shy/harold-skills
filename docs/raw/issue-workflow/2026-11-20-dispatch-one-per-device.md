---
type: raw
source_type: conversation
captured: 2026-11-20
title: "#386 triage：一台设备一个调度，上限按状态、配置进 home、每 30 分钟一轮"
tags: [issue-workflow, dispatch-one-per-device]
related: ["[[dispatch-one-per-device]]"]
---

U 是 Harold 的原话，A 是 AI 的结论。2026-11-20，#386 的 triage 会话。

## A1

只剩一个调度后，「每轮最多新开几个」跨项目怎么算：A 每个项目各按自己的表（今晚 22:07 那轮 harold-skills 3 + Toeflair 3）；B 整台设备一个总数。推荐 A。

## U1

整台设备一个总数，每轮x个，总数上线不超过一个数（这个数可以很大）。

现在有in-review的状态吗？如果有的话，我都在想让定时任务加上webhook的接入，当某个issue进入in-review就可以新增对应的空位置

## A2

in-review 有：既是 issue 状态，也是侧边栏分组，PR 全部转 ready 后 pr-review 把会话移进去。问三件事：总数数哪些会话；设备级配置放哪；进 in-review 时要不要立刻补位。

## U2

- 总数：我觉的按照状态分上限，比如in-triage 我倾向于6个，in-progress 我觉的可以多一些（甚至可以不设置上限），in-review不设置上限
- 配置：全搬进 home 一张表
- 补位：我倾向于让schedule agent（定时任务）感知事件变化，而不是让执行agent来做这个事儿

## U3

我说的是这个，github、linear应该都是有webhook的我记得？

（附截图：claude.ai 云端 Routine 的 Trigger 菜单，可选 Schedule、GitHub event「Run when a GitHub webhook event fires」、API「Run when your own code calls it」。）

## A3

截图是云端 Routine 的触发，GitHub 事件能叫醒它。本机桌面定时任务（`create_scheduled_task`）只收 cron、一次性时刻、手动三种。调度要在本机开会话、交到桌面端、移侧边栏分组，云端 Routine 碰不到本机，所以 webhook 叫不醒本机调度。本机能做的是查得更勤：每 15 分钟一轮、没空位就当场结束；或者保持每小时，事件接入另开 issue。

## U4

我觉的可以先搞成30分钟，schedule的模型可以换成sonnet，思考强度可以换成low/medium

## 本轮决议

| 议题 | 决议 |
|---|---|
| 每轮新开数 | 整台设备一个数 X，跨项目合计 |
| 总数上限 | 按状态分：triage 6，in-progress 默认不设（可配），in-review 不设 |
| 配置放哪 | 时段、每轮 X、各状态上限全搬进 home 一张表，项目的「调度」表删掉 |
| 感知名额空出 | 由调度自己感知，不让执行会话去叫；webhook 本机接不上，先改成每 30 分钟一轮 |
| 调度会话的模型 | Sonnet，思考强度 low/medium（spec 取 medium） |
