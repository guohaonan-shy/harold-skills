---
type: raw
source_type: conversation
captured: 2026-11-24
title: "#490 运行环境说明放哪（triage grill）"
tags: [issue-workflow, dyna-app-layer-cleanup]
related: ["[[dyna-app-layer-cleanup]]"]
---

U 是人的原话，逐字保留；A 是 AI 的结论与发现，取证过程略去。会话是 #490 的 triage 会话，由 0.2.0 父会话（#331）开出。dyna 的四处改法已按规则定在 spec 里，这里只问了 issue 留下的那道题：运行环境说明放在插件里，还是放进每台机器的 home。

## A1

摆了两个选项：A 插件继续带 `claude-desktop.md`、`magi.md`（以后加 `t3code.md`），推荐；B 全放 home，插件一份不带。真实例子：PR #489 修桌面端交出会话要套伪终端，A 改一处、升级后每台机器都拿到，B 每台机器各改各的；仓库里 7 个检查文件读插件里的说明；这两份说明 2026-11 改了 17 次。

## U1

我觉的idea-loop在setup光有一个模版，让ai根据模版以及执行环境自己构建。然后放到～/home/runtime或者用户自己的某个项目下？

## A2

顺着 B 问两处：一、生成的说明放哪（推荐 `~/home/runtime`：调度开在 home，dyna 已经读那里）；二、插件现有两份怎么办（搬进 home、插件删掉，或留作 setup 生成时读的样例；例子是 PR #489 的伪终端做法，文档里查不到，只照模板生成的新机器会再踩一次）。

## U2

放哪：我倾向于根据用户的使用习惯自己定，home仓库，～/根目录，项目目录都应该支持

现有两份：搬进 home，插件删掉

## A3

提出三处的查找顺序：项目 `<仓库根>/.idea-loop/runtime/<名>.md` → home `~/home/runtime/<名>.md` → 用户根目录 `~/.idea-loop/runtime/<名>.md`，先找到的那份生效，`selected` 同一顺序；setup 生成时问人放哪，推荐 home。

## U3

如果这样，这个是不是需要根据plugin的安装决定？

## A4

查了这台 Mac 的 `~/.claude/plugins/installed_plugins.json`：idea-loop 没有一处装在用户级；项目级装在 4 个项目（TOFEL-demo、harold-personal、excalidrawer、takehome-voice-runtime），harold-skills 和它的 worktree 是 local 级。完全按安装范围放，桌面端说明要放 5 份以上，开在 `~/home` 的调度会话一份也读不到；安装范围也只有 Claude Code 有，dyna 读它等于把 harness 层的东西放进 dyna。问安装范围是只用来定 setup 的推荐、直接定位置，还是不看。

## U4

我之后肯定是想往home这一套走的，但是单个项目、用户纬度这种感觉还是得支持吧？

## A5

按这句定：home 是主路，setup 推荐 home；项目、用户根目录两处也支持，dyna 固定按「项目 → home → 用户根目录」找，先找到的整份生效。安装范围不进 dyna，也不替人定位置。

## 本轮决议

| 议题 | 决议 |
|---|---|
| 插件带不带运行环境说明 | 不带。插件只留能力清单和能力模板，setup 让 AI 照模板和当前运行环境生成说明（U1） |
| 现有 `claude-desktop.md`、`magi.md` | 搬进 home，插件删掉（U2） |
| 说明放哪 | home、用户根目录、项目三处都支持，home 是主路（U2、U4） |
| 三处同时有 | 项目 → home → 用户根目录，先找到的整份生效；`selected` 同一顺序（A3 提出，U4 没有推翻，按「往 home 走、单项目和用户维度也支持」落） |
| 插件安装范围 | 不用来定位置（A4 的证据；U4 没要求按它定） |
