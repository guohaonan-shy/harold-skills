# 每周对账


`/idea-loop:dreaming` 可以由 Claude 桌面 app 的定时任务每周自己跑一次：提议段在那个会话里跑完，提议表摆在会话里等人批；截图对账只对上次成功执行以来代码动过的状态做（`idea-loop:dreaming` 的「对账范围」）。dreaming 仍然只由人或定时任务触发，不会在别的对话里被模型调起。定时任务跑出的会话用的是建它的会话的目录，所以这一步必须在本仓库的主 checkout 里做。

1. `mcp__scheduled-tasks__list_scheduled_tasks`。没有这个工具（不在桌面 app 里）：把下面第 4 步的 prompt 给人，让人在桌面 app 的定时任务里自己建，同时告诉人任务 id 要叫 `dreaming-<仓库名>`（仓库名取主 checkout 的目录名，命令是 `basename "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"`，dreaming 在自己的 worktree 里也用它取名；dreaming 靠这个 id 找执行记录），这一步记「未做：不在桌面 app」。
2. 已有 id 为 `dreaming-<仓库名>` 的任务：报给人（时间、是否开着），这一步完成。
3. 没有：用 AskUserQuestion 问人要不要装，选项「装，每周一早上 9 点左右（推荐）」「装，换个时间」「不装，我自己手动跑」。选「换个时间」的，再问每周哪天几点。选「不装」：什么都不建，这一步记「人拒绝」，告诉人手动敲 `/idea-loop:dreaming` 时没有基准点，每次都是全量。
4. 人要装：`create_scheduled_task`：
   - `taskId`：`dreaming-<仓库名>`；`title`：`<仓库名> 每周知识库对账`
   - `cronExpression`：人定的时间，分钟避开 0 和 30
   - `prompt`：`/idea-loop:dreaming`
5. 告诉人：app 关着时到点不跑，下次打开 app 时补跑；跑完的会话在侧边栏的定时任务里看，提议表在那个会话里等人逐行批；下一次的截图对账从这一次成功执行的时间起算，手敲的那次不推进它，想把整个档案重新对一遍就在手敲时说「全量」。

完成条件：本仓库有一个开着的 `dreaming-<仓库名>` 定时任务，或人拒绝了，或记下了没建的原因。
