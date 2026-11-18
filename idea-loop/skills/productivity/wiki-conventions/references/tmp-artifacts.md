# 中间产物

不进知识库、但要跨好几步（甚至跨会话）用的工作文件，放在当前 worktree 根的 `.tmp/` 下，按 skill 与对象分子目录：

```
<worktree 根>/.tmp/
├── grill/<YYYY-MM-DD>-<topic>/   复现过程的截图、网络日志、trace —— grill 收工时删
├── to-spec/<spec-slug>/          spec 图的 excalidrawer 源文件（sugar JSON、.excalidraw）—— 只有 PNG 进 docs/，spec 定稿后可删
├── implement/<spec-slug>/        pending.md（等人决定的工单）、evidence/（人验素材）、notes/（explorer 的共享笔记）、browser.lock（浏览器锁）—— PR 合并后删
├── pr-review/<PR 号>/            每轮的 Codex 输出、机械检查输出、汇报、evidence/（review 配图）—— PR 合并后删
├── dreaming/<YYYY-MM-DD>/        这一次运行的提议表 proposal.md 与中间物 —— 执行段完成后删
├── retro/<YYYY-MM-DD>-<主题>/    压缩过的会话记录 digest.md —— retro 收工时删
└── review-loop/<PR 号>.md        这个 PR 的 review loop（`idea-loop:pr` 的「review loop 文件」）—— 合并时归档进 PR 后删
```

- `<worktree 根>` 取 `git rev-parse --show-toplevel`；不在 git 仓库里就是项目根。
- 生命周期跟着 worktree，所以不放系统 `/tmp`：那里重启会清，不同 worktree、不同会话的东西也分不清归谁。一次性的、跑完即弃、不跨步骤的东西仍然可以用系统临时目录；spec 图的源文件定稿前还要改好几轮，算跨步骤。
- 按 `<spec-slug>` / `<topic>` 分子目录：同一个 worktree 里先后跑两份 spec，固定文件名放在共享的顶层会悄无声息地互相覆盖。
- 设计侧的过程产物（工作区、方向说明、交接画布、评分、评委截图）在 `docs/design/tmp/<spec-slug>/`，不在这里：归档脚本认得那里。
- `evidence/` 下是交付证据，过程中以本地文件发给人看，用到时才上传到 PR 的素材分支，不进代码分支和 `docs/`（`idea-loop:pr` 的交付证据）。

**本地忽略**：第一次用时确认 `.tmp/` 在 `$(git rev-parse --git-common-dir)/info/exclude` 里（`git check-ignore` 可查），不在就追加一行。这样只在本地忽略，仓库的 `.gitignore` 不动，也不会被误提交。`docs/design/tmp/` 不加进忽略：冻结的画布要 `commit` 进 home，被忽略的路径 `git add` 会拒绝；过程产物不会被带进提交，因为 `commit` 只提交列出的文件。
