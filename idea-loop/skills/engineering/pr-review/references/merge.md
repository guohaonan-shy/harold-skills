# 合并

人在会话里明确说合并时才走这份。没有 mergeReady 判定，也没有自动批准：人看过最新一轮的汇报和 PR 描述的「要你做的事」，自己决定。`review-loop`、设计产物的意思同 [`../SKILL.md`](../SKILL.md)。

## 合并

1. `review-loop check .tmp/review-loop/<PR 号>.md` 列出没处理完的条目，再看 PR 描述「要你做的事」还有没有没勾的。有就提醒人一句，人仍然说合并就继续。
2. **有设计产物就先归档**：走下面的「合并前归档」，走完再到第 3 步；没有就直接第 3 步。冻结时经设计 PR 提交的画布和 `delta/` 就在 `tmp/<spec-slug>/` 里；合并前钩子 `merge-gate-hook.mjs` 查的是同一件事，没归档就 `gh pr merge` 会被它拦下。只有调研目录的需求不归档、也不被拦：调研页随 `tmp/` 的生命周期删，想早点清就手动删；用进设计的调研结论已经写在方向说明或冻结记录里，随设计一起归档。
3. **归档 review loop**：`review-loop archive .tmp/review-loop/<PR 号>.md <owner/repo> <PR 号>`，每次停下、每轮 review 各贴成 PR 上的一条评论，引用的本地图同时上传、换成链接（`idea-loop:pr` 的「review loop」）。中途失败直接重跑，贴过的不会重复。
4. **spec 翻完成、删工单**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs" set <集成 worktree>/docs <spec-slug> 完成`；删掉这个 PR 落地的工单文件，`docs/spec/<spec-slug>/tickets/` 删空了就连目录一起删（spec 目录本身留着，等 `/idea-loop:dreaming` 写完 ADR 后整个删）。这两样作为一个只改 `docs/` 的提交（`docs(spec): <spec-slug> 完成`），推送到这个已经通过审核的 PR 分支，跟着这次合并进主分支。它覆盖的 issue 在合并后关掉：在 issue 会话里的，由会话的「换阶段」跑 `issues.mjs advance`；不在的，`idea-loop:issue-dispatch` 下一轮对账关掉，项目没跑 loop 的，合并后在主 checkout 上跑 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs" reconcile <docs>`。
5. **合并**：`gh pr merge <PR 号> --<合并方式>`，合并方式取目标仓库 `DEVELOPMENT.md` 的「分支」节。
6. 做「合并后的清理」。

## 合并前归档

把这次 UI 改动在 `tmp/<spec-slug>/delta/` 里的设计差异，经实现核过、经人看过，才并进线上档案 `prod/`。**写 `prod/` 只有归档脚本一条路，人没批过不跑。** 每个有设计产物的 spec 各做一遍：

1. **起 UI 审查（归档模式）**：用 Agent 工具起 `idea-loop:ui-reviewer`，只给指针：spec 名、集成 worktree 的绝对路径、分到的端口、模式「归档」、图的前缀 `r<最近一轮的轮次>-ui-merge-`、草稿存放处 `.tmp/pr-review/<PR 号>/archive/`。
2. **看它核得过不过**：
   - **不通过**（`status: failed`，什么都没写）：把它交回的 `failed.json` 里的条目，按 `idea-loop:pr` 的「review 汇报」的 Spec 条目格式记成 review loop 的一条新条目（轮次取 `review-loop next … pause`，标题「第 N 次停下 · 归档被拦下，核不过」），在会话里给人看，每条的图跟在文字后面。**不合并**，等人批示（修 / 改档案接受实现 / 不修），照 SKILL.md 的「人批示之后」处理；处理完人再说合并，从「合并」第 1 步重来。
   - **未完成**（服务起不来、页面打不开）：照实告诉人缺什么，**不合并、不归档**，不当成通过。
   - **通过**：往下。
3. **在会话里给人看草稿**：把 `draft.md` 作为新条目记进 review loop 文件（`pause` 类，标题「第 N 次停下 · 归档设计档案，等你过目草稿」），按条目一段一段贴，截图和动图跟在对应那条的文字后面，发推送通知。人要改，就把批示原话（记进「你的批示」）用 SendMessage 转回**同一个** ui-reviewer，它改完交回再贴，直到人说通过。
4. **人通过后跑归档脚本**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <集成 worktree> <spec-slug>`。它先校验再写，退出码 1 是拒绝（`prod/`、spec 和 `tmp/` 都没动）：把它列的违规或冲突回到 review loop 按「归档被拦下」处理，**不合并**。退出码 0 之后，输出里提示的缺失项（`.gitattributes` 没管素材、`.gitignore` 没忽略 `tmp/`、`prod/index.md` 没定视口 / 主题 / 语言）如实告诉人：脚本不改它们，补不补由人定。
5. **提交并推送到 PR 分支**：`git add -A docs/design/prod docs/spec/<spec-slug>`（被改写的 spec 图片链接也在里面），再 `git add -u docs/design/tmp/<spec-slug>`（冻结时提交过的画布和 `delta/` 被归档脚本清掉了，这一步把删除也提交上），提交信息「归档 <spec-slug> 的设计差异」，推送。工作区应当干净。
6. **回到「合并」第 3 步**：`tmp/` 已清空，合并前钩子这次放行。

第 2、3 步的条目就是这次归档的审查结论与人的批示（原话逐字），第 4、5 步做了什么写进该条目的「做了什么」。多个 spec 要归档的，每个各占一条。

## 合并后的清理

合并之后逐项做，PR 描述「参考」里的清理清单就是这几项加上这个 PR 特有的：

1. **删素材分支**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" cleanup <owner/repo> <PR 号>`。
2. **收掉还留着的执行方 worktree**（卡住过、没被回收的）：目标仓库 `DEVELOPMENT.md` 的「清理」写了命令就先跑它；停掉它端口上的服务，`git worktree remove --force <路径>`，`git branch -D <它的分支>`。
3. **删临时文件**：`.tmp/review-loop/<PR 号>.md`、`.tmp/implement/<spec-slug>/`、`.tmp/pr-review/<PR 号>/`。
4. PR 描述「参考」清理清单里这个 PR 特有的几项。
