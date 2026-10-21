---
name: spec-status
description: spec 的状态机和覆盖它的 GitHub issue 的状态 label。翻 spec 状态、把 issue 挂上或摘下 spec、同步或关掉 issue 时用。
---

spec 走到哪一步、谁在哪一刻把它往前推；覆盖它的 GitHub issue 上的 label 怎么跟着走。改状态只走 `spec-status.mjs`，不手改 frontmatter 的 `status` 行，也不手改 `docs/spec/index.md` 的表：脚本先核前提再写，写完顺手刷索引，前提不满足就拒绝并说明原因。

下文的 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指目标项目的 `docs/` 目录。

## 状态机

```
草稿 → 审核中 ─┬─ 碰 UI ──→ 待设计 → 设计中 ──冻结──┐
              └─ 不碰 UI ─────────────────────────┴→ 待实现 → 在飞
```

| 状态 | 含义 | 谁、在哪一刻写入 | 脚本核的前提 |
|---|---|---|---|
| `草稿` | 没人在场时起草、还没人审 | `idea-loop:issue-explorer` 调 `to-spec` 起草时（新建，写在 frontmatter 里） | — |
| `审核中` | 人在审 | grill 会话里的 `to-spec` 落盘时（新建）；`issue-dispatch` 给草稿开出审核会话时 | — |
| `待设计` | 人审完、同意了，spec 碰 UI，等人开设计会话 | 审核会话，人说审完时 | 「前端交互」不是「不涉及」；开头没有「需要 grill」 |
| `设计中` | 在设计 | `uiux-imagine` 开工第一步 | 同上 |
| `待实现` | 人同意了、设计已冻结（不碰 UI 的没有设计），等切票和实现 | 不碰 UI 的：审核会话，人说审完时；碰 UI 的：`uiux-refine` 冻结完 | 从 `审核中` 来：「前端交互」是「不涉及」；从 `设计中` 来：「实现决策」里有冻结摘要 |
| `在飞` | 工单已切 | `to-ticket` 切完工单时 | `tickets/` 下至少一张工单；碰 UI 的仍有冻结摘要 |
| `已拍板未排期` | 定了，但不排期 | 人说了，当时的会话写 | — |
| `搁置` | 故意搁置 | 人说了，当时的会话写 | — |

`待设计` 和 `待实现` 是排队的状态：设计和实现各有一个 loop，从这两个状态里取 spec、开会话往下做；人也可以自己开会话接着做。

脚本只放行这些步：

| 从 | 能翻成 |
|---|---|
| `草稿` | `审核中` · `搁置` |
| `审核中` | `待设计` · `待实现` · `已拍板未排期` · `搁置` |
| `待设计` | `设计中` · `审核中` · `已拍板未排期` · `搁置` |
| `设计中` | `待实现` · `审核中`（不做设计了）· `已拍板未排期` · `搁置` |
| `待实现` | `在飞` · `设计中`（设计要改）· `审核中` · `已拍板未排期` · `搁置` |
| `在飞` | `搁置` |
| `已拍板未排期` | `审核中` · `搁置` |
| `搁置` | `审核中` · `已拍板未排期` |

几条要点：

- **人同意 spec 落在审核会话里**：人说审完，审核会话把它翻成 `待设计` 或 `待实现`。`to-ticket` 只切 `待实现` 的 spec。
- **冻结就翻 `待实现`**，「实现决策」里同时多了冻结摘要。一份 spec 混着 UI 和非 UI、非 UI 的部分不想等设计，就在审核时拆成两份 spec。
- spec 新建时的状态（`草稿` / `审核中`）由 `to-spec` 直接写进 frontmatter，然后跑 `spec-status index <docs>` 刷索引。
- 合并后整个目录删（wiki-conventions 的「文件在不在，就是状态」），由 `dreaming` 做，删完跑 `spec-status index <docs>`。

```bash
spec-status set <docs> <spec-slug> <状态>     # 核前提 → 写 status → 刷索引
spec-status index <docs>                      # 只刷索引
spec-status check <docs>                      # 列出所有 spec，和旧平铺布局、非法状态这类问题
```

`to-spec` / `to-ticket` / `implement` 开工时先跑一次 `check`：报了旧平铺布局，就停下提议照 wiki-conventions 的「从平铺布局迁移」迁移，不在旧布局上接着写。

## issue 的 label

label 各代表什么，写在目标仓库根目录的 `ISSUE_TRACKER.md`（`setup` 建）。spec 覆盖了哪几个 issue 记在 frontmatter 的 `issues: [12, 15]` 里，`spec-status set` 每翻一次状态就把它们的 label 同步过去，所以翻状态的 skill 不用知道 issue 的存在。同步失败（没联网、`gh` 没登录）不回滚状态，脚本在 stderr 说怎么补。label 和 `issues` 只走 `issues.mjs`：

```bash
issues labels     <docs>                    # 建出缺的 status:* label
issues candidates <docs> [<limit>]          # 待办的 issue，最早的在前（JSON）；<docs> 里还有 spec 列着的不算
issues handoff    <docs> <spec-slug> <n>    # 把 #n 写进 spec frontmatter，只改本地文件，不碰 GitHub
issues publish    <docs> <spec-slug>        # spec 到了远端之后发布：列了 issue 的同步 label；没列的开一个 spec issue，号码写回 frontmatter
issues sync       <docs> <spec-slug>        # 按 spec 的状态同步 label；第一次同步时在 issue 上留一条评论指向 spec
issues unhandoff  <docs> <spec-slug> <n>    # 从 spec 里移出 #n，去掉 label，回到待办
issues drop       <docs> <spec-slug> <n>    # 从 spec 里移出 #n，关成 not planned
issues resolve    <docs> <spec-slug> <pr>   # PR 合并：关掉 spec 列出的每个 issue（completed），去掉 label
```

`issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`。gh 在 `<docs>` 目录下跑，所以作用在那个仓库上。

| 时机 | 谁 | 做什么 |
|---|---|---|
| 写 spec 时覆盖了已有 issue | `to-spec` | 每个覆盖到的 issue `handoff`；「关联」里逐条挂 `#<号>` |
| 对话里写的 spec 推送之后 | `to-spec` | `publish`：列了 issue 的同步 label；没列的开一个 spec issue，正文指向 spec 文件和当前分支 |
| 起草 PR 合并之后 | `issue-dispatch` | `publish`：issue 第一次挂上 `status:草稿` |
| spec 翻状态 | 谁翻谁顺带（`spec-status set` 里自动做） | — |
| 人审核时把某个 issue 踢出 spec | 审核会话 | `unhandoff`，并从 spec 的「问题」「方案」「User Stories」「关联」里删掉它 |
| 人审核时决定某个 issue 不做 | 审核会话 | `drop`，并从 spec 里删掉它 |
| spec 的 PR 合并 | `pr-review` 合并时 | `resolve` |

`handoff` 只写本地文件，是为了让起草的产物在提交推送之前都只在本地：推送失败时 GitHub 上不会留下指向一份不存在的 spec 的 label。它会拒绝已经有 `status:*` label 的、已关闭的、或已经写在另一份 spec frontmatter 里的 issue。

审核会话里 `unhandoff` 的 issue，label 当场去掉，但主分支上那份 spec 的 frontmatter 要等它的 PR 合并才不再列它；在那之前 `candidates` 不会把它当待办交出去，免得同一个 issue 被起草两次。
