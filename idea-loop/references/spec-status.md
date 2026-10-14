# spec 的状态与 backlog 移交标记

spec 走到哪一步、谁在哪一刻把它往前推，以及 backlog 条目上的「已移交」标记怎么写、怎么撤。改状态和标记**只走 `scripts/spec-status.mjs`**，不手改 frontmatter 的 `status` 行，也不手改 `docs/spec/index.md` 的表——脚本先核前提再写，写完顺手刷索引，前提不满足就拒绝并说明原因。

下文的 `spec-status` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/spec-status.mjs"`，`<docs>` 指目标项目的 `docs/` 目录。

## 1 状态机

```
草稿 ──→ 审核中 ──→ 设计中 ──→ 在飞
          │                     ↑
          └──── 不碰 UI ─────────┘
```

| 状态 | 含义 | 谁、在哪一刻写入 | 脚本核的前提 |
|---|---|---|---|
| `草稿` | 起草 routine 从 backlog 起草、还没人审 | `to-spec` 的 backlog 模式落盘时（新建，写在 frontmatter 里） | — |
| `审核中` | 人在审 | grill 会话里的 `to-spec` 落盘时（新建）；起草 routine 给草稿开出审核会话时（`set … 审核中`） | — |
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
