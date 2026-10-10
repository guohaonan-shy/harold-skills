# PR 页面——人审一次交付的地方

一份 spec 的所有工单共享**一条集成分支、一个 PR**。这个 PR 只写给一个读者：要判断这次交付能不能合并的那个人。他每次打开都要能马上知道两件事：**要我决定什么，要我看什么。**

> 曾经的 PR 描述把 spec 的「为什么」和每张工单的改动重写了一遍，再附上给 review agent 读的验收契约；轮次帖里是复现命令和检查日志。一个 PR 加起来四五万字，真正要人做的那一件事埋在中间。这份文件就是为了不再那样写。

## 1 PR 描述是总览，thread 是对话

| 阶段 | PR 状态 | 要人决定、要人看的东西 | 谁写 |
|---|---|---|---|
| **实现中**：工单没全部落地，或还有等决定的事 | draft | 每次停下开一个**停下汇报 thread**（§4） | `implement` 的编排者 |
| **review**：全部落地、没有等决定的事 | open | 每一轮开一个 **review thread**（§5），PR 描述的 `review` 节同步成最新一轮的结论 | `pr-review` 的编排者 |

人在 thread 里回答、批示、追问，**以他自己的身份**。Claude 的汇报和回复**以项目 bot 的身份**（§2）。

PR 描述本身是常驻的总览，由几个**节**组成，每节夹在隐藏标记之间，由 `scripts/pr-body.mjs` 按固定顺序写入。每个写入方只重写自己负责的节：

| 节 | 写入方 | 内容 |
|---|---|---|
| `header` | `implement`，开 draft PR 时 | spec 链接 + 一句话说这份 spec 解决什么问题 |
| `review` | `pr-review`，每轮重写 | 最新一轮两个问题的结论，加这一轮 thread 的链接（§5） |
| `ledger` | `implement`，每次停下都更新 | 执行记录，折叠，带每个停下 thread 的链接（§6） |

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-body.mjs" set <owner/repo> <PR 号> <节名> <内容文件>
```

标记以外的文字（人手写的说明、署名行）会被保留，放在所有节的下方。**不要直接 `gh pr edit --body` 整体覆盖**，那会把别人的节一起冲掉。PR 描述本身由 gh 当前登录的账号写：它是 PR 的一部分，不是一条发言。

## 2 Claude 的帖子：bot 身份，一次报告一个 thread

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-thread.mjs" open  <owner/repo> <PR 号> <pause|review> <轮次> <正文.md> <锚定的工单文件>...
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-thread.mjs" read  <owner/repo> <PR 号> <thread 首条评论 id>
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-thread.mjs" reply <owner/repo> <PR 号> <thread 首条评论 id> <回复.md>
node "${CLAUDE_PLUGIN_ROOT}/scripts/pr-thread.mjs" list  <owner/repo> <PR 号>
```

- **一次报告，一个新 thread。** 停下汇报和 review 轮次都这样。下一次停下、下一轮 review，再开新的，**不在旧 thread 里接着汇报**。轮次取 `list` 输出的 `next.pause` / `next.review`。
- **为什么是 review 评论**：GitHub PR 的 Conversation 评论是平铺的，不能回复某一条；能接着回复、能 Resolve 的只有 review 评论。所以每份报告是一条 **file 级的 review 评论**，锚在 PR diff 里的某个工单文件上（脚本只会锚在 diff 里有的工单文件上）。它照样显示在 Conversation 里。
- **以 bot 的身份发。** 仓库在 `~/.idea-loop/github-apps.json` 里配了 GitHub App（通常叫 `<project>-claude`）时，脚本用它的安装令牌发帖。令牌只活在脚本进程里，不打印、不写盘、不交给 agent。没配时借用 gh 当前登录的账号，但每条开头都写明「由 Claude 代发，不是本人所写」。**不以人的身份说话。** 人在对话里而不是 thread 里回答的，编排者把原文转贴进 thread，开头标「Harold 在对话里回答：」，让 PR 上的记录完整。

  ```json
  { "<owner>/<repo>": { "appId": 123456, "privateKeyPath": "~/.idea-loop/keys/<app-name>.pem" } }
  ```

  App 要的权限：Pull requests 写（发帖和回复）、Contents 读。**不给 Contents 写。**
- **编排者在 thread 里回复它做了什么。** 每处理完人的一条消息，就在同一个 thread 里回一条，带上提交链接：「03 的决定已写回工单（<短 SHA>），03 和依赖它的 05 继续」「S1 已修（<短 SHA>），回归测试 <测试名>」。人的追问也在这里回答。
- **resolve 是人的签收，不是 bot 的。** 一个 thread 里的事都处理完了，编排者回一句「都处理完了，确认无误请 resolve」，由人点 resolve，人也可以随时重新打开。编排者从 `list` 读每个 thread 的状态，把「都已 resolve」当作人签收的信号。另外，GitHub App 要有 Contents 写权限才能 resolve review thread，bot 不该为此拿到能改代码的权限。

## 3 不写什么

- **不复述 spec 和工单。** 「为什么」在 spec §1，每刀做了什么在工单里，`header` 里给一个链接就够。
- **不写给 agent 看的东西。** 验收契约就是分支上的工单文件，review 的 agent 直接去读，不在 PR 里另抄一份。复现命令、检查日志、修复前后对比这些过程材料，不出现在 PR 上。
- **不贴整段代码。** 唯一的例外是 Standards 的问题，它本来就是指着代码说的（§5）。

## 4 停下汇报（`pause` thread）

`implement` 每次停下（没有能做的工单了）就开一个，汇报这一次停下之前发生的事。

```markdown
## 第 N 次停下 · 落地 <K> 张，等你决定 <M> 件

> <一句话说明叠加层：光圈 / 蓝点 = 鼠标位置，角落秒表 = 从某事件起计时，都不属于产品>

### 需要你决定

#### <工单号 · 一句话说卡在哪>
<两三句：缺的是什么，为什么查代码定不了>

![<图说>](<素材 URL>)        ← 有助于理解时才放：分支逻辑一张 flowchart，界面行为一张流程图

- **A**：<做法>——<代价>
- **B**：<做法>——<代价>

推荐 A：<一句理由>。在等它的工单：<编号列表>

### 交付验收

#### 03 · <工单标题>

**流程**
- [ ] <看什么>

  ![..](<URL>)

**动效**
- [ ] <看什么>

  ![..](<URL>)

**执行方替你做的取舍**
- <取舍>：<为什么这样选>；不同意就说，改起来是 <小 / 中 / 大>

---
在这个 thread 里回复就行：决定写「03 选 A」，人验项不对就说哪一项、哪里不对，有疑问直接问。
```

- 只写**本次停下之前新落地**的工单，上一个 thread 里交过的不重复。
- 素材的做法与形态见 `evidence.md`。每项是复选框 + 一句「看什么」+ 素材。人在 GitHub 上直接勾选：bot 发的评论，有写权限的人也能勾。
- **只放要人判断的**：逐格比对已经全绿的格、单测覆盖的逻辑都不放。一张工单没有人验项，也没有取舍，就只写一行「无需人看」。
- 没有等决定的事，就不写「需要你决定」这一节。

## 5 review 轮次（`review` thread + 描述的 `review` 节）

`pr-review` 每跑一轮，开一个 `review` thread 放完整的结论，再把 PR 描述的 `review` 节重写成这一轮的摘要。人在 thread 里批示，编排者按批示修，修完在同一个 thread 里回复；下一轮由人触发，开新的 thread。

### thread 正文

```markdown
## Review 第 N 轮 · 审 <短 SHA>

### Spec：代码是否解决了 spec 要解决的问题
<一句结论：没发现偏差 / 发现 K 处>

#### S1 · <后果，用户视角的一句话>
<两三句：spec 或工单怎么说（引原文）→ 实际怎么做 → 什么时候会碰到>

![<图说>](<素材 URL>)      ← 必须有：flowchart / sequence / 流程图 / 动图，按问题的形状选

建议：<一个修法>。

### Standards：代码是否遵守仓库写下来的规则
<一句结论>；机械检查：<每项一词：lint 绿 / typecheck 2 处 / 测试 绿>（只算这次改动过的行）

#### C1 · <违反了什么>
> <规则原文>（`<规则文件>`）

​```<语言>
<diff 里那几行>
​```

建议：<改法>。

### 缺词（不阻塞）
| 概念 | 推荐叫法 |
|---|---|

<details><summary>本轮丢弃的候选：K 条</summary>
<每条一行：是什么，为什么丢（没复现 / 规则原文找不到 / 不在 diff 里 / 人上一轮说过不修）></details>

---
在这个 thread 里批示就行：「S1 修，C2 不修，C3 进 backlog」，有疑问直接问。
```

- **Spec 的问题必须配图。** 能复现、能画出来，才算问题。画不出来的放进「丢弃的候选」，只记一行。
- **Standards 的问题必须引用规则原文，而且代码片段必须在这次的 diff 里。** 对不上的同样丢弃。机械检查（lint、typecheck、仓库声明的检查命令）的结果并入 Standards，只计这次改动过的行；挂在改动行上的诊断才成为 `C` 条目。
- 编号 `S1` / `C1` 只在这一轮内有效，方便人批示时引用。
- **缺词**：这次 PR 引入或改名、但目标仓库 `GLOSSARY.md` 没收的领域概念，每条写概念和推荐叫法。不是问题，不阻塞，loop 不写术语表（新词只在 `grill` 里加，见 `glossary.md`）。没有就不写这一节。
- 两轴分开写，**不合并、不跨轴排序**：一处代码可以守规矩却做错了事，也可以做对了事却破了规矩，分开报才不会互相掩盖。

### 描述的 `review` 节

```markdown
## Review · 第 N 轮（[详情与讨论](<thread 链接>)）

**Spec**：<一句结论>。<S1 标题>；<S2 标题>
**Standards**：<一句结论>。<C1 标题>；机械检查 <一行>
```

只放结论和标题，图和讨论都在 thread 里。每轮整节重写，所以描述上永远是最新一轮；之前几轮的完整内容在各自的 thread 里。

## 6 `ledger`：执行记录（折叠）

```markdown
<details><summary>执行记录：6 张工单，已落地 5，等决定 1</summary>

停下记录：[第 1 次](<thread 链接>) · [第 2 次](<thread 链接>)

| 工单 | 提交 | 验收 | 延后 → 接手方 | 存量回归 |
|---|---|---|---|---|
| 01 · <标题> | <短 SHA 链接> | 6/6 | — | 绿 |
| 03 · <标题> | <短 SHA 链接> | 7/8 | 1 格 → PR 交付验收 | 绿 |

顺手发现的存量问题（不是这次引入的）：
- <一句话>（<在哪>）

</details>
```

账本只给想追溯的人看。人审交付时不需要打开它。
