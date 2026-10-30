# 合并

人在会话里明确说合并时才走这份。没有 mergeReady 判定，也没有自动批准：人看过审核报告（PR 描述）和最新一轮的汇报，自己决定。`review-loop`、设计产物的意思同 [`../SKILL.md`](../SKILL.md)。

**合并时不再做「spec 翻完成、删工单」，也不再等 CI**：这个 docs 提交在交审核报告之前已经推送，CI 已经绿（[`deliver.md`](deliver.md)）。

## 合并

1. `review-loop check .tmp/review-loop/<PR 号>.md` 列出没处理完的条目，再看 PR 描述「要你做的事」还有没有没勾的；再确认 spec 已经是「完成」、工单已经删了（交报告前的 docs 提交）。有未处理的条目或没勾的就提醒人一句，人仍然说合并就继续。spec 还没完成的（比如跑满两轮停下后人直接说合并），先照 `deliver.md` 的第 2 步推那个 docs 提交、等 CI 绿，再往下。
2. **有设计产物就先归档**：走下面的「合并前归档」，走完再到第 3 步；没有就直接第 3 步。冻结时经设计 PR 提交的画布和冻结记录就在 `tmp/<spec-slug>/` 里。**归档是合并步骤里的一步，没有任何钩子替你拦**：已知缺口是在网页上点合并、或在别的会话里合并会绕过这一步，由每周的 `/idea-loop:dreaming` 的「漏归档」兜底；所以合并统一在 issue 会话里走这份 reference。只有调研目录的需求不归档：调研页随 `tmp/` 的生命周期删，想早点清就手动删；用进设计的调研结论已经写在方向说明或冻结记录里，随设计一起归档。
3. **归档 review loop**：`review-loop archive .tmp/review-loop/<PR 号>.md <owner/repo> <PR 号>`，每次停下、每轮 review 各贴成 PR 上的一条评论，引用的本地图同时上传、换成链接（`idea-loop:pr` 的「review loop」）。中途失败直接重跑，贴过的不会重复。
4. **合并**：`gh pr merge <PR 号> --<合并方式>`，合并方式取目标仓库 `DEVELOPMENT.md` 的「分支」节。
5. 做「合并后的清理」。

## 合并前归档

把这次 UI 改动的设计差异，经实现核过、经人看过，才并进线上档案 `prod/`。差异 `delta/` 由 ui-reviewer 在这里对着最终画布和实现整份写出（按旧流程冻结、`delta/` 已经提交的需求，它把现有的当草稿接着改）。**写 `prod/` 只有归档脚本一条路，人没批过不跑。** 每个有设计产物的 spec 各做一遍：

1. **起 UI 审查（归档模式）**：用 Agent 工具起 `idea-loop:ui-reviewer`，只给指针：spec 名、集成 worktree 的绝对路径、分到的端口、模式「归档」、图的前缀 `r<最近一轮的轮次>-ui-merge-`、草稿存放处 `.tmp/pr-review/<PR 号>/archive/`，和这个 PR 的 review loop 文件 `.tmp/review-loop/<PR 号>.md`（它从里面取人的批示写进「决定」）。
2. **看它核得过不过**：
   - **不通过**（`status: failed`，什么都没写）：把它交回的 `failed.json` 里的条目，按 `idea-loop:pr` 的「review 汇报」的 Spec 条目格式记成 review loop 的一条新条目（轮次取 `review-loop next … pause`，标题「第 N 次停下 · 归档被拦下，核不过」），在会话里给人看，每条的图跟在文字后面。**不合并**，等人批示（改实现 / 接受实现，走设计变更 / 不修），照 SKILL.md 的「人批示之后」处理；处理完人再说合并，从「合并」第 1 步重来。
   - **未完成**（服务起不来、页面打不开）：照实告诉人缺什么，**不合并、不归档**，不当成通过。
   - **通过**：往下。
3. **在会话里给人看草稿**：把 `draft.md` 作为新条目记进 review loop 文件（`pause` 类，标题「第 N 次停下 · 归档设计档案，等你过目草稿」），按条目一段一段贴，截图和动图跟在对应那条的文字后面，发推送通知。人要改，就把批示原话（记进「你的批示」）用 SendMessage 转回**同一个** ui-reviewer，它改完交回再贴，直到人说通过。
4. **人通过后跑归档脚本**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <集成 worktree> <spec-slug>`。它先校验再写，退出码 1 是拒绝（`prod/`、spec 和 `tmp/` 都没动）：把它列的违规或冲突回到 review loop 按「归档被拦下」处理，**不合并**。退出码 0 之后，输出里提示的缺失项（`.gitattributes` 没管素材、`.gitignore` 没忽略 `tmp/`、`prod/index.md` 没定视口 / 主题 / 语言）如实告诉人：脚本不改它们，补不补由人定。
5. **提交并推送到 PR 分支**：`git add -A docs/design/prod docs/spec/<spec-slug>`（被改写的 spec 图片链接也在里面），再 `git add -u docs/design/tmp/<spec-slug>`（冻结时提交过的画布和冻结记录，旧流程冻结的还有 `delta/`，被归档脚本清掉了，这一步把删除也提交上；新写出的 `delta/` 在被排除的 `tmp/` 里，不进提交），提交信息「归档 <spec-slug> 的设计差异」，推送。工作区应当干净。
6. **等归档提交触发的 CI 全绿**（它也是推到 PR 分支的提交，会让 CI 重跑；`gh pr checks <PR 号> --watch`），然后回到「合并」第 3 步：`tmp/` 已清空。

第 2、3 步的条目就是这次归档的审查结论与人的批示（原话逐字），第 4、5 步做了什么写进该条目的「做了什么」。多个 spec 要归档的，每个各占一条。

## 合并后的清理

合并之后逐项做，PR 描述「参考」里的清理清单就是这几项加上这个 PR 特有的：

1. **删素材分支**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/evidence.mjs" cleanup <owner/repo> <PR 号>`。
2. **收掉还留着的执行方 worktree**（卡住过、没被回收的）：目标仓库 `DEVELOPMENT.md` 的「清理」写了命令就先跑它；停掉它端口上的服务，`git worktree remove --force <路径>`，`git branch -D <它的分支>`。
3. **删临时文件**：`.tmp/review-loop/<PR 号>.md`、`.tmp/implement/<spec-slug>/`、`.tmp/pr-review/<PR 号>/`。
4. PR 描述「参考」清理清单里这个 PR 特有的几项。
