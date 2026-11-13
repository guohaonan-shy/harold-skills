# 每周分拣

`idea-loop:issue-triage` 可以由『定时任务』每周自己跑一次：最早的 15 个 backlog issue 各由一个子代理查完、贴证据评论，按子代理的建议去向翻好状态。

用到的能力（『定时任务』『向人提问』）：用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的这几节；任务建在哪个目录、时间用哪个时区、prompt 怎么起 skill，都在『定时任务』里。

1. 用『定时任务』列出已有的任务。运行环境没有这个能力：走 `idea-loop:runtime` 的退路，把下面第 4 步的 prompt 给人，同时告诉人任务 id 要叫 `triage-<仓库名>`（仓库名取主 checkout 的目录名，命令是 `basename "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"`），这一步记「未做：运行环境 <名> 没有『定时任务』」。
2. 已有 id 为 `triage-<仓库名>` 的任务：报给人（时间、是否开着），这一步完成。
3. 没有：用『向人提问』问人要不要装，选项「装，每周一早上 9 点左右（推荐）」「装，换个时间」「不装，我自己手动跑」。选「换个时间」的，再问每周哪天几点。选「不装」：什么都不建，这一步记「人拒绝」，告诉人想分拣时手敲 `/idea-loop:issue-triage`。
4. 人要装：用『定时任务』创建：
   - 任务 id：`triage-<仓库名>`；标题：`<仓库名> 每周 backlog 分拣`
   - 时间：人定的，换成运行环境要的时区，分钟避开 0 和 30
   - 目录：本仓库的主 checkout
   - prompt：调起 `idea-loop:issue-triage`，写法照『定时任务』里的 prompt 写法
5. 告诉人：到点没跑上时补不补跑、跑完的会话在哪看，照『定时任务』里的「行为」；跑完 issue 已翻好状态，只有留在 backlog 的（等人补信息）或疑似 P0 时才推送；每次最多 15 个，仓库里已有的存量 backlog 想一次分完，手敲 `/idea-loop:issue-triage 全部`，它每 15 个一批、一批接一批跑完。
