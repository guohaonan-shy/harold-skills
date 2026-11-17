# 10 — 在临时 home 里端到端走一遍：issue 会话起草的 spec 落进 home，代码 worktree 保持干净

**Blocked by**：01、02、03、04、05、06、07、08、09（全部）
**设计冻结**：不涉及 UI

## 要建什么

前面九张各自有单测和文档测试，这一张验它们拼起来后，真的 agent 会照着做。

在本机：临时目录里建一份假 home，把 harold-skills 的 `docs/` 和引导文件复制进 `projects/harold-skills/`，项目清单登记 harold-skills（远端是它的 GitHub 远端，本地路径是一个 harold-skills 的 worktree）。在那个 worktree 里，用 `--plugin-dir` 装改后的插件、`IDEA_LOOP_HOME` 指到假 home，跑 `claude -p`：用 Skill 工具调 `idea-loop:issue-session`，参数一个真实的、处于 triage 的 issue；禁掉 `gh` 的写操作（只读）；停在 spec 草稿写好并提交的那一刻。

不碰本机真的 `~/home`、不搬本机任何项目的 `docs/`。

## 验收标准

- [x] spec 出现在假 home 的 `projects/harold-skills/docs/spec/` 下，并已提交到假 home 的 main
- [x] 那个代码 worktree 的 `git status` 是干净的，没有切出 issue 分支
- [x] 会话里 issue 的读取对着 harold-skills 的 GitHub 仓库（看 `gh` 的调用记录）
- [x] 09 若延后了回放用例，这里补跑
- [x] 本机 `~/home` 和 `~/.claude/` 没有被改动（跑前跑后各看一次 `git -C ~/home status` 和改动时间）

## 选中的存量回归

- 全量测试：`node --test idea-loop/scripts/ idea-loop/evals/` 跑一遍，除插件版本测试（这个 PR 刻意不升版本）外全绿。
