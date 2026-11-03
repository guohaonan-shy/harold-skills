# UI 走查：有设计产物时多起一个 ui-reviewer

`../SKILL.md` 的「跑一轮」第 2 步在**有设计产物**时读这份；没有设计产物的 PR 不读。

## 起的时候

和 `idea-loop:pr-reviewer` **同一条消息**起 `idea-loop:ui-reviewer`（每轮走查模式），不等走查走完才起 pr-reviewer。

- 给 ui-reviewer 的指针：spec 名、集成 worktree 的绝对路径、分到的端口（挑一个没人在听的）、模式、图的前缀 `r<轮次>-ui-`、这一轮的工作目录。
- 给 pr-reviewer 的多一个指针：将来的发现文件路径 `.tmp/pr-review/<PR 号>/round-<N>/ui-findings.json`。此时文件还不存在，pr-reviewer 自己等它。

## 盯着它交回

- `ok`：发现文件已经在位，什么都不用做。
- `status: incomplete`（服务起不来、页面打不开、锁拿不到），或 `skipped`、`failed` 而没有发现文件：立刻在这一轮的工作目录写 `ui-incomplete.md`（一句话：状态与原因）。pr-reviewer 看到它就不再等，UI 这一轴记「未完成」，写进汇报的「没覆盖到的」。

照实告诉人：**未完成不等于没问题**，但不阻塞代码审查。

## 走查发现的去处

走查的发现并进汇报的 Spec 部分。修复归属工单的办法见 `../SKILL.md` 的「回工单」；选了「接受实现，走设计变更」的，走 `../SKILL.md` 的「设计变更」。
