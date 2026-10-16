# spec 的状态、backlog 移交标记与 issue 状态

spec 走到哪一步、谁在哪一刻把它往前推；backlog 条目上的「已移交」标记怎么写、怎么撤；项目改用 GitHub issue 当 backlog 时，issue 上的状态 label 怎么跟着 spec 走（§3）。改状态和标记**只走 `scripts/spec-status.mjs`**，不手改 frontmatter 的 `status` 行，也不手改 `docs/spec/index.md` 的表——脚本先核前提再写，写完顺手刷索引，前提不满足就拒绝并说明原因。

下文的 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指目标项目的 `docs/` 目录。

## 1 状态机

```
草稿 ──→ 审核中 ──→ 设计中 ──→ 在飞
          │                     ↑
          └──── 不碰 UI ─────────┘
```

| 状态 | 含义 | 谁、在哪一刻写入 | 脚本核的前提 |
|---|---|---|---|
| `草稿` | 从 backlog 条目或 issue 起草、还没人审 | `to-spec` 的 backlog 模式落盘时（新建，写在 frontmatter 里） | — |
| `审核中` | 人在审 | grill 会话里的 `to-spec` 落盘时（新建）；`issue-dispatch`（或项目自己的起草 routine）给草稿开出审核会话时（`set … 审核中`） | — |
| `设计中` | 人审完，spec 碰 UI，在设计 | 人对这份 spec 调 `uiux-imagine`，它开工第一步（`set … 设计中`）。人调它这个动作本身就是「审完了、要设计」 | §5.3 前端交互不是「不涉及」；开头没有「需要 grill」 |
| `在飞` | 设计已冻结（不碰 UI 的跳过）、人同意了 spec、工单已切 | `to-ticket` 切完工单时（`set … 在飞`） | 从 `审核中` 来：§5.3 是「不涉及」；从 `设计中` 来：§4 有冻结摘要。两种都要 `tickets/` 下至少一张工单、开头没有「需要 grill」 |
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

- **冻结不翻状态。** `uiux-refine` 冻结后 spec 仍是 `设计中`，§4 多了冻结摘要；翻 `在飞` 归 `to-ticket`。
- **`设计中` 没冻结不切工单**，所以 `在飞` 之前不会有实现的 commit。一份 spec 混着 UI 和非 UI、非 UI 的部分不想等设计，就在审核时拆成两份 spec。
- **人同意这一条脚本核不了**，由 `to-ticket` 在切票前问人。
- spec 新建时的状态（`草稿` / `审核中`）由 `to-spec` 直接写进 frontmatter，然后跑 `spec-status index <docs>` 刷索引。
- 合并后照旧整个目录删（wiki-conventions §1），由 `dreaming` 做，删完跑 `spec-status index <docs>`。

```bash
spec-status set <docs> <spec-slug> <状态>     # 核前提 → 写 status → 刷索引
spec-status index <docs>                      # 只刷索引
spec-status check <docs>                      # 列出所有 spec，和旧平铺布局、非法状态这类问题
```

`to-spec` / `to-ticket` / `implement` 开工时先跑一次 `check`：报了旧平铺布局，就停下提议按 wiki-conventions §2.2 迁移，不在旧布局上接着写。

## 2 backlog 移交标记

项目的 backlog（例如 `docs/quality-backlog.md`）里的条目被一份 spec 覆盖时，条目上写「已移交 → [[<spec-slug>]]」。起草 routine 靠这个标记跳过已经有 spec 的条目，否则它会为同一条再起草一份。

```bash
spec-status handoff   <backlog 文件> <spec-slug> <条目>             # 写标记
spec-status unhandoff <backlog 文件> <spec-slug> <条目> [<状态>]    # 撤标记
```

- **`<条目>`**：表格型写 `#<编号>`（第一列的编号）；勾选列表型写条目里一段能唯一定位它的文字，比如加粗的标题。对不上、或者对上不止一条，脚本拒绝。
- **怎么写**：表格型把状态列换成标记；勾选列表型在条目第一行末尾追加标记，勾选框不动。routine 过滤时只看 `已移交 → [[` 这一个字面串。
- **怎么撤**：表格型的状态列换回 `<状态>`（不给就是 `待办`）；勾选列表型去掉追加的标记。

谁在什么时候调：

| 时机 | 谁 | 做什么 |
|---|---|---|
| spec 落盘，覆盖了 backlog 条目 | `to-spec`（两种模式都要） | 每条 `handoff`，并在 spec 的 §8 关联里挂上它 |
| 人审核时把某条踢出 spec | 审核会话 | `unhandoff`，并从 spec 的 §1–§3、§8 删掉那条 |
| 人审核时把「建议关闭」里的某条关掉 | 审核会话 | 标记留着，在 backlog 里按项目自己的写法关掉那条 |
| spec 的 PR 合并 | 起草 routine 对账时 | 改成 backlog 自己的「已解决」写法（项目的事，不归 idea-loop） |

backlog 的**模块划分表**也是项目配置，写在 backlog 文件里的「模块」一节，`to-spec` 的 backlog 模式从那里读。

## 3 GitHub issue 的状态

项目用 GitHub issue 当 backlog 时（`issue-dispatch` 调度的就是这种），§2 的「已移交」标记换成 issue 上的**状态 label**。issue 只有这一组 label 归 idea-loop 管；类型、模块之类的 label 是项目自己的，idea-loop 不读也不写。

| issue 的状态 | GitHub 上 | 谁写 |
|---|---|---|
| 待办 | open，没有任何 `status:*` label | 人开 issue 时就是这个状态 |
| 不接手 | open，`status:parked`，且没有 spec 覆盖它 | 人手动打；`issue-dispatch` 永远不接 |
| 跟着 spec 走 | open，`status:<spec 的状态>`——`草稿` / `审核中` / `设计中` / `在飞` / `已拍板未排期` / `parked`，恰好一个 | 脚本按 spec 的状态同步，不手打 |
| 已解决 | closed，completed | spec 的 PR 合并后，`issue-dispatch` 对账时 |
| 不做 | closed，not planned | 审核会话里人决定不做时 |

**spec 是真相，label 是它的投影。** spec 覆盖了哪几个 issue 记在 spec frontmatter 的 `issues: [12, 15]` 里；`spec-status set` 每翻一次状态，就把这些 issue 的 label 同步成新状态。所以 `uiux-imagine`、`to-ticket` 这些翻状态的 skill 不用知道 issue 的存在。同步失败（没联网、gh 没登录）不回滚状态，脚本在 stderr 说怎么补。

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
| 从 issue 起草 spec | `to-spec` 的 backlog 模式（`idea-loop:issue-explorer` 调它） | 每个覆盖到的 issue `handoff`；§8 关联逐条挂 `#<号>` |
| 草稿提交、推送之后 | `issue-dispatch` | `sync`：issue 第一次挂上 `status:草稿` |
| spec 翻状态 | 谁翻谁顺带（`spec-status set` 里自动做） | — |
| 人审核时把某个 issue 踢出 spec | 审核会话 | `unhandoff`，并从 spec 的 §1–§3、§8 删掉它 |
| 人审核时决定某个 issue 不做 | 审核会话 | `drop`，并从 spec 里删掉它 |
| spec 的 PR 合并 | `issue-dispatch` 对账时 | `resolve` |

`handoff` 只写本地文件，是为了让起草的产物在提交推送之前都只在本地：推送失败时 GitHub 上不会留下指向一份不存在的 spec 的 label。它会拒绝已经有 `status:*` label 的、已关闭的、或已经写在另一份 spec frontmatter 里的 issue。

审核会话里 `unhandoff` 的 issue，label 当场去掉，但主分支上那份 spec 的 frontmatter 要等它的 PR 合并才不再列它；在那之前 `candidates` 不会把它当待办交出去，免得同一个 issue 被起草两次。
