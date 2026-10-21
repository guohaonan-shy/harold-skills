# spec 的状态与 issue 的 label

spec 走到哪一步、谁在哪一刻把它往前推；覆盖它的 GitHub issue 上的 label 怎么跟着走。改状态和 label**只走 `scripts/spec-status.mjs`**，不手改 frontmatter 的 `status` 行，也不手改 `docs/spec/index.md` 的表——脚本先核前提再写，写完顺手刷索引，前提不满足就拒绝并说明原因。

下文的 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指目标项目的 `docs/` 目录。

## 状态机

```
草稿 ──→ 审核中 ──→ 设计中 ──→ 在飞
          │                     ↑
          └──── 不碰 UI ─────────┘
```

| 状态 | 含义 | 谁、在哪一刻写入 | 脚本核的前提 |
|---|---|---|---|
| `草稿` | 从 GitHub issue 起草、还没人审 | `to-spec` 从 issue 起草落盘时（新建，写在 frontmatter 里） | — |
| `审核中` | 人在审 | grill 会话里的 `to-spec` 落盘时（新建）；`issue-dispatch` 给草稿开出审核会话时（`set … 审核中`） | — |
| `设计中` | 人审完，spec 碰 UI，在设计 | 人对这份 spec 调 `uiux-imagine`，它开工第一步（`set … 设计中`）。人调它这个动作本身就是「审完了、要设计」 | 「前端交互」不是「不涉及」；开头没有「需要 grill」 |
| `在飞` | 设计已冻结（不碰 UI 的跳过）、人同意了 spec、工单已切 | `to-ticket` 切完工单时（`set … 在飞`） | 从 `审核中` 来：「前端交互」是「不涉及」；从 `设计中` 来：「实现决策」里有冻结摘要。两种都要 `tickets/` 下至少一张工单、开头没有「需要 grill」 |
| `已拍板未排期` · `parked` | 定了但不排期 · 故意搁置 | 人说了，当时的会话写 | — |

脚本只放行这些步：

| 从 | 能翻成 |
|---|---|
| `草稿` | `审核中` · `parked` |
| `审核中` | `设计中` · `在飞` · `已拍板未排期` · `parked` |
| `设计中` | `在飞` · `审核中`（不做设计了）· `已拍板未排期` · `parked` |
| `在飞` | `parked` |
| `已拍板未排期` | `审核中` · `parked` |
| `parked` | `审核中` · `已拍板未排期` |

几条要点：

- **冻结不翻状态。** `uiux-refine` 冻结后 spec 仍是 `设计中`，「实现决策」里多了冻结摘要；翻 `在飞` 归 `to-ticket`。
- **`设计中` 没冻结不切工单**，所以 `在飞` 之前不会有实现的 commit。一份 spec 混着 UI 和非 UI、非 UI 的部分不想等设计，就在审核时拆成两份 spec。
- **人同意这一条脚本核不了**，由 `to-ticket` 在切票前问人。
- spec 新建时的状态（`草稿` / `审核中`）由 `to-spec` 直接写进 frontmatter，然后跑 `spec-status index <docs>` 刷索引。
- 合并后照旧整个目录删（wiki-conventions 的「文件在不在，就是状态」），由 `dreaming` 做，删完跑 `spec-status index <docs>`。

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
issues handoff    <docs> <spec-slug> <n>    # 把 #n 写进 spec frontmatter——只改本地文件，不碰 GitHub
issues sync       <docs> <spec-slug>        # 按 spec 的状态同步 label；第一次同步时在 issue 上留一条评论指向 spec
issues unhandoff  <docs> <spec-slug> <n>    # 从 spec 里移出 #n，去掉 label，回到待办
issues drop       <docs> <spec-slug> <n>    # 从 spec 里移出 #n，关成 not planned
issues resolve    <docs> <spec-slug> <pr>   # PR 合并：关掉 spec 列出的每个 issue（completed），去掉 label
```

`issues` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.mjs"`。gh 在 `<docs>` 目录下跑，所以作用在那个仓库上。

| 时机 | 谁 | 做什么 |
|---|---|---|
| 从 issue 起草 spec | `to-spec`（`idea-loop:issue-explorer` 调它） | 每个覆盖到的 issue `handoff`；「关联」里逐条挂 `#<号>` |
| 草稿提交、推送之后 | `issue-dispatch` | `sync`：issue 第一次挂上 `status:草稿` |
| spec 翻状态 | 谁翻谁顺带（`spec-status set` 里自动做） | — |
| 人审核时把某个 issue 踢出 spec | 审核会话 | `unhandoff`，并从 spec 的「问题」「方案」「User Stories」「关联」里删掉它 |
| 人审核时决定某个 issue 不做 | 审核会话 | `drop`，并从 spec 里删掉它 |
| spec 的 PR 合并 | `issue-dispatch` 对账时 | `resolve` |

`handoff` 只写本地文件，是为了让起草的产物在提交推送之前都只在本地：推送失败时 GitHub 上不会留下指向一份不存在的 spec 的 label。它会拒绝已经有 `status:*` label 的、已关闭的、或已经写在另一份 spec frontmatter 里的 issue。

审核会话里 `unhandoff` 的 issue，label 当场去掉，但主分支上那份 spec 的 frontmatter 要等它的 PR 合并才不再列它；在那之前 `candidates` 不会把它当待办交出去，免得同一个 issue 被起草两次。
