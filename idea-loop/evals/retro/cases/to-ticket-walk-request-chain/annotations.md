# to-ticket-walk-request-chain

> 回放判定会话的判定你不同意时，在下面记一行推翻，再跑 `retro-replay.mjs --settle to-ticket-walk-request-chain --run <那次的 run dir>`。
> 这里不打分；只记「这一次哪一边的答案判错了、为什么」。

**当时的原话**：为什么不是短名直接获取题目信息（毕竟短名是存在后端的）（人在 Toeflair#719 实现期看到补的那张工单时问的；harold-skills#229 原文引用）

**是/否题**：切票前有没有指出外层路由先按短名查题、spec 没覆盖这一段？

## 怎么跑（只能当场跑）

用例的提交 `f2c19254` 在 Toeflair 仓库（GitHub `guohaonan-shy/Tofelair`），不在本仓库，`--run-large` 按 `--worktree` 所在仓库取提交，取不到它。只能用 `--repo` 指到 Toeflair 的本地 checkout：

```
node ~/.idea-loop/bin/retro-replay.mjs --case to-ticket-walk-request-chain --repo <Toeflair 本地 checkout> --worktree <本 worktree>
```

## 材料怎么拼的（拼不出的在这里写明）

- **提交**：`f2c19254`（Toeflair，`design(writing-load-states): 冻结 (#806)`，2026-11-02），就是那次切票时的主分支：spec `writing-load-states` 已冻结、还没有工单；外层路由（`a431dbc5`，2026-11-01）已经在它的历史里，spec 全文没有一处提到短名或 slug。
- **prompt**：当时让 skill 产出东西的是 `/idea-loop:to-ticket` 加这份 spec 的 slug；原 prompt 的逐字措辞不在仓库里，这里写 slug、spec 路径、状态和一句「切成工单」，另加回放必须的补充：人不在场、禁止提交推送和 gh 写操作、不调 implement、最后说明停在哪（工单已落盘，还是停下在问什么）。**没有把题提前写进 prompt**：prompt 里不出现短名、外层路由，写了，改前的 skill 也会去查，用例就抓不住问题。
- **改前预计答「否」**：改前的「探代码库」只要求「每张工单的『要建什么』都能对着代码说清起点」，会话核 spec 点名的准备页和练习页就收工；当时的会话就是这样把四张工单挂在页面自己的按 ID 取题上。改后的「探代码库」要求从入口沿调用链一跳一跳走到数据来源、包括 spec 没点名的几跳，预计改后答「是」。
- **缺的**：回放拷贝没有 git 历史（runner 只打一个提交），改后那段里「看 spec 最后一次提交以来碰过这条链的提交」那半句在回放里用不上；题目只依赖「从入口走一遍」，外层路由的代码在 `f2c19254` 里已存在，走得到。当时会话的记录不在仓库里，人的追问原话取自 issue #229。回放里写出什么由 skill 自己决定。
- **判定依据**：看交回的最后一段回复和工作区里 `docs/spec/writing-load-states/tickets/` 下的工单文件：有没有指出外层路由先按短名查题、spec 没覆盖这一段（写进工单、写进停下的提问、或写在回复里都算）。

## 标注

<!-- 推翻一次判定，一行一边，照这个形状：
- 推翻 <run-id> 改前=是 ｜ 理由
- 推翻 <run-id> 改后=否 ｜ 理由
run-id 是 runner 打印的 run dir 的最后一段（形如 20261022T101500）。 -->
