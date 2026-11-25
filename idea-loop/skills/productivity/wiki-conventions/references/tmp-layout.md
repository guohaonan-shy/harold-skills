# `.tmp/` 每个子目录收什么、什么时候删

SKILL.md「中间产物」定了规则：中间产物放 `<worktree 根>/.tmp/<skill>/<对象>/`。这一份是每个子目录的清单，每个调用方查自己那一行。

```
<worktree 根>/.tmp/
├── grill/<YYYY-MM-DD>-<topic>/   复现过程的截图、网络日志、trace —— grill 收工时删
├── to-spec/<spec-slug>/          起草时的复现输出（repro/）、SEO 研究的 context.json —— spec 定稿后可删
├── implement/<spec-slug>/        pending.md（等人决定的工单）、evidence/（人验素材）、notes/（explorer 的共享笔记）、browser.lock（浏览器锁）—— PR 合并后删
├── fake-mic/<会话名>/            一个带假麦克风的浏览器会话：config.json（会话配置）、mic.wav（喂进去的音频）、.playwright-cli/（快照）（运行环境的『浏览器』「要麦克风的流程」，`dyna runtime show 浏览器`）—— PR 合并后删
├── pr-review/<PR 号>/            每轮的 Codex 输出、机械检查输出、汇报、evidence/（review 配图）—— PR 合并后删
├── dreaming/<YYYY-MM-DD>/        这一次运行的提议表 proposal.md 与中间物 —— 执行段完成后删
├── retro/<YYYY-MM-DD>-<主题>/    压缩过的会话记录 digest.md —— retro 收工时删
└── review-loop/<PR 号>.md        这个 PR 的 review loop（`idea-loop:pr` 的「review loop 文件」）—— 合并时归档进 PR 后删
```

`evidence/` 下是交付证据，过程中以本地文件发给人看，用到时才上传到 PR 的素材分支，不进代码分支和 `docs/`（`idea-loop:pr` 的交付证据）。
