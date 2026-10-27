# 01 — imagine / refine 的设计过程目录按当前 worktree 根定位

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

在 worktree 会话里跑 idea-loop 的 `uiux-imagine` 或 `uiux-refine`，设计过程产物（`imagine/`、`canvas/`、`research/`，以及方向说明校验、评分命令读的文件）都落在**这个 worktree 根**下的 `docs/design/tmp/<spec-slug>/`，不落进主 checkout，也不因为前缀为空拼成磁盘根目录下的 `/docs/...`。

现状：两份 skill 的 SKILL.md 用 `${CLAUDE_PROJECT_DIR}` 当前缀拼这些路径，共五处——imagine 的目录约定那句和收工前的方向说明校验命令；refine 的目录约定那句、开工前提里的方向说明校验命令、评分命令。worktree 会话里，skill 文本中的这个变量被替换成主 checkout 的路径，而 Bash 环境里它为空，两种都不是当前 worktree。

改法：两份 skill 在目录约定那一句定义「worktree 根 = `git rev-parse --show-toplevel`」，五处路径都改成以 worktree 根为前缀。写法沿用 `uiux-research` 的「定落图目录」（「项目根 = `git rev-parse --show-toplevel`」）和 `wiki-conventions` 的「中间产物」（「`<worktree 根>` 取 `git rev-parse --show-toplevel`」）；叫法用「worktree 根」。交给 uiux-imaginer、designer 的目录照旧给绝对路径，前缀同样是 worktree 根。

不改：`uiux-research`（已经按 worktree 根定）；冻结、设计变更同步、ui-reviewer、implementer 里相对写的 `docs/design/tmp/<spec-slug>/`（不经过这个变量）；hook 与脚本（没有一处读这个变量）。

加一条文本绊线测试，放在插件的脚本测试里（跟其他 `*-doc.test.mjs` / `*.test.mjs` 一起由 `node --test` 跑）：扫插件 `skills/` 与 `agents/` 下全部 Markdown，断言没有一处出现 `CLAUDE_PROJECT_DIR`；并断言 `uiux-imagine`、`uiux-refine` 的 SKILL.md 都写明 worktree 根取 `git rev-parse --show-toplevel`。先写测试看它红（五处命中），再改文本看它绿。可照 `dreaming-incremental-doc.test.mjs`（读 skill 文本断言步骤在场）和 `seo-check.test.mjs` 里断言 `merge-gate-hook` 不再存在的那段写。

插件版本按仓库惯例递增（idea-loop 的 `plugin.json`），README 里若写到这几处目录也一并对齐。

## 验收标准

- [x] 新的绊线测试在改文本之前是红的，报出五处 `CLAUDE_PROJECT_DIR`（实际报出六处：imagine 开工前提里还有一处 `issues.mjs set` 的命令，工单漏数，一并改了）
- [x] idea-loop 插件的 `skills/`、`agents/` 下没有一处出现 `CLAUDE_PROJECT_DIR`
- [x] `uiux-imagine` 的 SKILL.md：目录约定那句写明 `imagine/`、`canvas/`、`research/` 在 worktree 根（`git rev-parse --show-toplevel`）下的 `docs/design/tmp/<spec-slug>/`；方向说明校验命令以 worktree 根为前缀
- [x] `uiux-refine` 的 SKILL.md：目录约定那句同上；开工前提里的方向说明校验命令和评分命令都以 worktree 根为前缀
- [x] 插件全部脚本测试通过（`node --test` 跑 idea-loop 的 `scripts/`）
- [x] 插件版本已递增
- [ ] 人验 ⏭ 延后 → 人：下一次在 worktree 会话里跑 imagine，主 checkout 的 `docs/design/tmp/` 下没有新目录

## 选中的存量回归

- `direction-note-check.test.mjs`：方向说明校验脚本的输入就是这里改的路径，确认脚本本身行为没变。
- `critic-score.test.mjs`：评分命令读的路径改了前缀，确认脚本本身行为没变。
- `dreaming-incremental-doc.test.mjs` 等读 skill 文本的绊线测试：改的是 skill 文本，确认没有别的绊线被碰断。
