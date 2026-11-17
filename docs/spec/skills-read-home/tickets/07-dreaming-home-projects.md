# 07 — dreaming-home 整理完记忆后逐个对账项目清单里的项目，并重写地图

**Blocked by**：05 — engineering 与 productivity 的 skill 写成「项目目录」（改同一批 dreaming 文件）
**设计冻结**：不涉及 UI

## 要建什么

一台设备只剩一个每周 dreaming 定时任务 `dreaming-home`，开在 home。它的形状和开头的「记忆一段」已由 #332 钉住，不改。这张工单接上记忆一段之后的部分：按项目清单的顺序，对每个项目做一遍。

1. **取项目**：`where --project <名字>`。在项目清单登记的本地 clone 里 `git fetch`，从 `origin/<主分支>` 切一个 worktree 放在 home 的 `.worktrees/` 下（home 的 `.gitignore` 要忽略它），对完删掉。`<主分支>` 取项目目录 `DEVELOPMENT.md` 的「分支」一节。
2. **对账**：`docs/` 在项目目录，对的是上一步那个 worktree 里的代码；提议表、执行、问人跟现在一样，改动用 `commit` 直接提交到 home。起对账子代理时把项目目录和代码 worktree 两个路径都给它。
3. **重写项目地图** `projects/<名字>/AGENTS.md`，不超过 2000 字。模板跟 #252 setup 起草第一版时用的是同一份（几层、每层放什么、什么问题去哪查），外加一行指向 `projects/<名字>/memory/MEMORY.md`。输入是项目目录的 `docs/index.md`、目录树和引导文件。
4. 全部项目跑完，**重写 `~/home/AGENTS.md` 的「## 设备地图」一节**，不超过 2000 字，输入是 home 顶层目录和项目清单。「## 项目」一节由 setup 维护，dreaming 不改。

**增量范围**：基准点取 `dreaming-home` 上一次成功的执行（对账范围那份参考已改成这个 id，保持）。一次执行里有任何一个项目没对完，这次就不算成功，下一次那个项目从更早的基准点算起——在汇报里写明这次不算成功、哪个项目没对完。

**跑不了的项目**：本地 clone 不存在、fetch 失败、或 `where` 报「还没搬」的，跳过它，汇报里写一行原因，不挡后面的项目。

**已知限制写进 skill**：开在 home 时项目自己的 hook、`.mcp.json`、`.claude/skills` 都不加载，对账只用 idea-loop 自己的工具。

人手敲 dreaming 时（会话开在某个项目的代码 worktree 里）只对这一个项目，步骤同 1–3。

## 验收标准

- [x] dreaming skill 在记忆一段之后有「逐个对账项目」一段，写明上面 1–4 步、跑不了的项目怎么办、整次成功的判法
- [x] 项目地图模板含指向 `projects/<名字>/memory/MEMORY.md` 的一行，与 setup 起草第一版用同一份模板（不复制两份）
- [x] 设备地图重写只改「## 设备地图」一节，地图和设备地图都写明 2000 字上限
- [x] home 的 `.gitignore` 模板忽略 `.worktrees/`
- [x] 记忆一段的原文没被改动（#332 钉住的文档测试仍绿）
- [x] 改了的 SKILL.md 主体 < 5000 字，并调过 `idea-loop:writing-for-agents`

## 选中的存量回归

- dreaming 的记忆、增量范围、自主执行、来源波各组文档测试：都钉着 dreaming 的原话。
- `home-config` 的测试：`.gitignore` 模板。
