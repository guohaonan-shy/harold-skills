# design-modeling 设计稿

> 状态：草稿，待 Harold 审。来源：issue #22 第 2 项「DESIGN.md 的迭代方式不固定」；PR #19 分支上 Distill-back 分两个去处的提案（未合）；与工作流优化会话的分工交接。
> 本稿只管 `design-modeling` 这一个 skill 与它直接拥有的文件。imagine / refine 怎么调用它、什么时候调用，归工作流优化那边。

## 1 用途

项目的 `DESIGN.md` 只有一个写入者：`design-modeling`。新建、更新、删除都走它。

`DESIGN.md` 的定位：**这个产品的视觉语言，用自然语言写，跨页都必须服从。** 它不是设计相关内容的总收件箱。plugin 的 `references/design/` 只写通用的 UI/UX 原则，不带任何项目特色；两边之间靠一张准入分层表（§4）分流。

为什么要单独一个 skill：Toeflair 现在那份 609 行的 `DESIGN.md` 至少有六个写入口（imagine 语言高度、refine 的 Distill-back 与动效先例库、static-ui-protocol 的 Distill-back 与「没有就 bootstrap 一份」、expression-framework、component-protocol、人手动提交、旧 design-workflow 插件），每个入口的判断标准都不一样，结果是：

| 文件里混进的内容 | 例子 | 本该去 |
|---|---|---|
| 身份底线、禁令 | One Voice、Retired-Ink | 留在 DESIGN.md |
| 判例 | 第 7 节 9 条（其中一条是划掉的旧条目） | 留在 DESIGN.md，划掉的删 |
| 现状盘点 | Marketing bands 表，带 `HomePage.astro:101` 这类行号 | 代码本身；需要的规则抽成一句话 |
| 已知缺陷 | `.btn-brand-inverse` 3.98:1、`IntroTrialCTA` white/60 4.01:1 | `docs/quality-backlog.md` |
| 迁移计划 | Legacy migration 一节 | spec / ticket |
| 历史与实现细节 | 「What changed 2026-06-23」、token reconciliation、`.impeccable` sidecar | ADR / 代码注释 / git 历史 |

唯一写入者的作用不是拦截（格式由 hook 里的官方 lint 管，§7），而是**让判断标准只有一份**。

## 2 调用方式

- **模型可调用**（不加 `disable-model-invocation`）。原因：imagine 语言高度选定语言之后，要在同一个会话里交棒给它新建 `DESIGN.md`——选定的 tile、实测的对比度都在上下文里，换会话就丢了。这跟 `grill` 在访谈中途调 `prototype` 是同一种接法。
- **代价**：每一次写入都在 skill 内部停下等人确认措辞。模型可以起草，不能自己落笔。
- **人直接调用**：蒸馏、对账两种模式通常由人发起（「把这几页的候选蒸馏一下」「对一下 DESIGN.md」）。
- description 不走本仓库的「pushy」写法（idea-loop 的有意例外），只写它是 `DESIGN.md` 的唯一写入口、三种模式各自的触发情形，避免在无关对话里被动触发。

## 3 三种模式，按项目状态自动选

| 项目状态 | 模式 |
|---|---|
| 没有 `DESIGN.md` | **新建** |
| 有，且有未处置的候选（§6），或人口述了一条规则 | **蒸馏** |
| 有，人要求检查它与代码是否一致，或第一次接手一份不是本 skill 写的 `DESIGN.md` | **对账** |

一次运行可以先对账再蒸馏，但每种模式的写入各自经过一次人确认。

### 3.1 新建

两种来源，先判是哪一种并说出来：

- **有线上 UI（推断）**：从代码和真 DOM 的 computed style 量，不凭印象。量出来的值分三桶：**一致的**（候选底线）、**不一致的**（待人裁决的开放问题）、**偶然的**（没人选过的默认值，不入法）。三桶分开报告——把一个不一致的值写成底线，等于把一次意外冻结成法。
- **没有 UI（建立）**：只接 imagine 语言高度已经选定的语言（色彩角色、字体与字阶、形状、register、实测对比度）。本 skill 不做发散、不出变种。

**单独被调用、项目既没有 UI 也没有走过 imagine** → 拒绝，指回 imagine 的语言高度（待定，见 §11）。

产出：按 §5 写成的 `DESIGN.md`，`## Case Law` 从空开始。写完由 hook 跑官方 lint（§7）。

### 3.2 蒸馏

输入两种：

1. 冻结记录 `docs/design/<slug>/<slug>-design.md` 里 `## 设计法候选` 一节中，**没有去向行**的条目（§6）。`grep` 就能列全，不另起一份 backlog。
2. 人在会话里口述的规则。口述的也按候选处理，走同一张表。

对每一条：

1. 过准入分层表（§4），给出去向和一句理由；
2. 进 `DESIGN.md` 的，起草措辞（判例按「情境 → 决定 → 理由」），人确认后写入；
3. 归通用原则的，起草成 harold-skills 的 issue 文字，人同意后 `gh issue create -R guohaonan-shy/harold-skills`；
4. 在候选条目末尾追加去向行（§6）。

**什么时候蒸馏**：默认等那一页上线之后——上线的代码是证据，冻结时的画布还不是。可以由人提前。

### 3.3 对账

拿法去量代码，处理四种情况，每一种都摆给人逐条确认：

| 发现 | 处置 |
|---|---|
| 法和代码对不上 | 人判：法错了 → 改法；代码错了 → 记进 `docs/quality-backlog.md`。**不自动处理**——法在撒谎比法过期更危险 |
| 不该在文件里的内容（§1 那张表的后四行） | 挪到该去的地方，`DESIGN.md` 里不留指针以外的东西 |
| 一条判例已在两页以上被照着用过 | 提议并进对应章节的正文（变成那一节的规则），从 `## Case Law` 删掉 |
| 被取代的判例、划掉的条目 | 直接删，历史留给 git |

对账的健康信号借 mattpocock domain-modeling 作者自己承认的失效模式：**这份文件变短的次数应该和变长一样多**。只追加不收敛，它就会长回 609 行。

Toeflair 第一次跑本 skill 就是对账。

## 4 准入分层表

从上往下问，**第一个命中的就是去处**：

| 层 | 去处 | 判据 |
|---|---|---|
| 工作流 | plugin 的 `skills/*/SKILL.md` | 说的是环怎么跑 |
| 通用设计原则 | plugin 的 `references/design/` | **换一个产品照样成立** |
| 产品视觉语言 | 项目 `DESIGN.md` | 只对这个产品成立，**而且跨页都要服从** |
| 页面决定 | 那一页的冻结记录 `docs/design/<slug>/` | 只对这一页成立 |
| 现状、缺陷、迁移 | `docs/quality-backlog.md` / spec | 说的是「现在什么样」，不是「应该什么样」 |

两个用来校准的真实判例：

- 「营销页图像语言 = 无人静物摄影」被判错：同一页就用了静物照、线稿、生成插图、代码动效四种，图像风格按每页内容选——**页面决定**，不是产品视觉语言。
- 所有 intro 页共用的收尾渐变 `IntroTrialCTA` 从没进 `DESIGN.md`——它跨页、只属于本产品，**本该在产品视觉语言这一层**，漏了。

产品视觉语言这一层里，还收一类现在没有的内容：**页面家族的复用机制**（例如五个 intro 页共用的构图顺序）。它跨页、只属于本产品、又能被检查。

## 5 DESIGN.md 写成什么样

### 5.1 格式：Google DESIGN.md spec，校验全交给官方 CLI

- YAML frontmatter 放 token（`colors` / `typography` / `rounded` / `spacing` / `components`，`{path}` 引用）；刻意没有的 token 组写进 `omitted` 并附理由，不留着被 lint 报缺。
- 正文 `##` 章节：Overview、Colors、Typography、Layout、Elevation & Depth、Shapes、Components、Do's and Don'ts。**可以省略，出现的必须按这个顺序**；不认识的章节保留不报错，重复章节不允许。
- 我们现行 `design-md-format.md` 要求八节必须齐全，与 Google 不一致。这份文件**不再维护，删掉**：格式由 skill 每次运行时现读 `npx -y @google/design.md@latest spec`，永远跟 CLI 同一个版本；spec 管不到的内容规则与候选格式很短，直接写在 SKILL.md 里。
- 格式和结构的校验**不自己写脚本**，全交给官方 CLI（§7）。

### 5.2 内容规则：我们自己的，靠写入时的人确认和 PR review，不靠机器

1. **正文是主体，token 是上下文**（Google PHILOSOPHY 的主张）。一个具体的参照物胜过一串形容词；一长串 Don't 通常说明正文本身没写清楚。
2. **底线少而能检查**：全文五到八条，每条带可检查的 token 或实测值。「无障碍」不是底线，「正文对比度 ≥ 4.5:1，从真 DOM 读」才是。
3. **禁令带理由**：没有理由的禁令每次会话都会被重新争论。
4. **判例**放在自定义的 `## Case Law` 章节（spec 允许未知章节），每条带日期，写成「情境 → 决定 → 理由」，按时间顺序追加。
5. **不写**：file:line 引用、划掉的条目、已知缺陷、迁移计划、历史叙事、实现细节（§1 那张表）。
6. 三层法（底线 / 判例 / 禁令）保留为我们的扩展：底线落在各自相关的章节里，禁令落在 Do's and Don'ts 的 Don't 半边，判例落在 `## Case Law`。

### 5.3 已知不一致，迁移时一起处理

- **eval fixture 不过官方 lint**：`idea-loop/evals/case/project/DESIGN.md` 的 frontmatter 把 `colors` 写成了字符串，`lint` 报 error（每个字符被当成一个颜色）。要改成合法的 token map。fixture 会被 imagine / refine 的 eval 读，改它要通知工作流会话重跑。
- **Toeflair 的 DESIGN.md 格式上是过的**：0 error、9 warning（8 个 orphaned token，1 个 `button-primary` 白字压 `#137fec` 3.98:1）。它的问题在内容，不在格式——正好是对账模式的第一个案子。

## 6 「设计法候选」：与冻结记录的接口

refine 签字时不再写 `DESIGN.md`，改为在冻结记录 `<slug>-design.md` 里写这一节（refine 那边的改动归工作流会话；格式由本 skill 定，因为它要读）：

```markdown
## 设计法候选

- **<一句话规则>**
  - 情境：……
  - 决定：……
  - 理由：……
  - 证据：<画布 data-anchor 或 assets/ 下的截图>
  - 来源：人的原话 / 模型提议
  - 建议层：产品视觉语言 / 通用设计原则 / 不确定
```

- 没有候选时写一行「无」——空着分不清是没有还是漏了。
- 「情境 / 决定 / 理由」与判例同形，进 `DESIGN.md` 时原样搬。
- 蒸馏后由本 skill 在条目末尾追加一行去向，取值闭集：
  - `→ DESIGN.md Case Law <日期>` / `→ DESIGN.md <章节名> <日期>`
  - `→ harold-skills#<N>`
  - `→ quality-backlog`
  - `→ 留在本页`
  - `驳回：<理由>`
- 没有去向行 = 未处置。`dreaming` 的报告里只提醒「有 N 条候选未处置」，不碰 `DESIGN.md` 本身。

## 7 校验：hook（plugin 内）

### 7.1 hook（plugin 侧）

- `idea-loop/hooks/hooks.json` 已有 PostToolUse `Write|Edit` → `design-lint-hook.mjs`。新增一个薄包装脚本：改的文件名是 `DESIGN.md` 才跑 `npx -y @google/design.md@latest lint`，有 error 就把结果回给 agent。
- **跟最新版**：这样校验一直跟着最新的 spec 走。
- **网络失败只提示不拦**：`@latest` 每次要问 registry，离线时 hook 不该卡住写文件。
- 局限：只在装了 plugin 的会话里、agent 改文件时触发，拦不住人在编辑器里手改。项目要不要在 PR 上跑同一个 CLI，是项目自己的事（§7.2）。

### 7.2 CI 不归本 skill（2026-10-06 定）

项目的 CI 是项目自己的事，本 skill 不生成、不修改。项目若要在 PR 上兜底，推荐的做法是 PR 改到 `DESIGN.md` 时跑 `@latest` 的 `lint`（有 error 即红）与 `diff base head`（判为退化即红）；`diff` 用同一个版本评两边，CLI 升级不会让无关 PR 突然变红。

实测记下的 CLI 现状（0.4.0）：token 引用断了是 error；章节顺序错只是 warning（单跑 `lint` 拦不住，靠 `diff` 拦）；**重复章节 spec 说是 error，CLI 没实现**——由于只有本 skill 写，这个风险由它自己避免。

### 7.3 语义偏移归 review

「这一条该不该进 `DESIGN.md`」lint 管不了。PR 改了 `DESIGN.md` 时，pr-review 的 Standards 轴按 §4 那张表审——这一处接线归 pr-review，本稿只提需求。

## 8 文件布局

```
idea-loop/
├── skills/design-modeling/
│   └── SKILL.md                    分层表、三种模式、写入流程、内容规则、候选格式都在这里；没有 references/
├── hooks/hooks.json                PostToolUse 加一条 design-md-hook
└── scripts/
    ├── design-md-hook.mjs          薄包装：判文件名是 DESIGN.md → 跑 @latest lint → error 回给模型（exit 2），离线只提示
    └── design-md-hook.test.mjs     用假 CLI 测，不连网
```

allowed-tools 收窄到：`Read`、`Edit`、`Write`、`Bash(npx -y @google/design.md@latest:*)`、`Bash(git diff:*)`、`Bash(git log:*)`、`Bash(gh issue create:*)`、`AskUserQuestion`。

## 9 要改的现有文件

**本会话负责**（plugin 的 references 与 hook）：

| 文件 | 改什么 |
|---|---|
| `references/design/design-md-format.md` | 删除（imagine 停止引用它之后，由工作流会话那边的改动先行）；`README.md` 第 241 行指向它的那一行同步改 |
| `references/design/static-ui-protocol.md` | Distill-back 一段改成「写候选，交 design-modeling」；删掉「没有 DESIGN.md 就 bootstrap 一份」 |
| `references/design/expression-framework.md` | 「蒸馏回 DESIGN.md §7」改成写候选 |
| `references/design/component-protocol.md` | 同上 |
| `references/design/motion-protocol.md` | 动效先例的 Distill-back 改成写候选 |
| `references/design/ui-craft-checklist.md` | 第 5 节 drift check「新值当判例提」改成写候选 |
| `evals/case/project/DESIGN.md` | frontmatter 改成合法 token map（§5.3） |
| `hooks/hooks.json`、`scripts/design-md-hook.mjs` + 测试 | §7.1（已写） |
| `README.md`、`.claude-plugin/plugin.json`、仓库 `CLAUDE.md` | 加 design-modeling，skill 数 9 → 10 |

**交给工作流优化会话**：`uiux-refine` 签字时写候选（§6）、动效先例库改写候选。`uiux-imagine` 语言高度改成调用本 skill 的那一处，2026-10-06 改由本会话做，已完成。

**plugin references 去项目化（2026-10-06 定为同一批做）**：`references/` 与 `skills/` 里的项目示例全部换成虚构产品（Fieldnote、徒步 app 的路线卡片），`scripts/no-project-leak.test.mjs` grep 已知项目名当绊线；`evals/case/` 与 `docs/` 不扫。

**项目侧，不进本 plugin 的 PR**：Toeflair 第一次对账。

## 10 与 domain-modeling（#21）对称

| | domain-modeling | design-modeling |
|---|---|---|
| 管的文件 | `CONTEXT.md`（领域语言） | `DESIGN.md`（视觉语言） |
| 格式规格 | `CONTEXT-FORMAT.md` | 官方 `npx @google/design.md spec`，运行时现读 |
| 失效模式 | 膨胀成 spec；被别的 skill 调用时漏加载 | 膨胀成总收件箱；同上 |
| 唯一写入口 | 是 | 是 |

两个 skill 可以共用骨架：唯一写入者、格式文件跟着 plugin 走、写入前人确认、变短和变长一样重要。#21 落地时对齐，本稿不等它。

## 11 已定（2026-10-06，Harold）

1. **§6 候选格式与 §3.3「两页以上被用过就并进正文」**：照本稿。格式已同步给工作流优化会话。
2. **单独调用、项目既没有 UI 也没走过 imagine**：拒绝，指回 imagine 的语言高度。
3. **锚点**：可选。DESIGN.md 的 Overview 有锚点就指过去（imagine 选定的 brand board，或已有项目的几张线上标杆截图），本 skill 不负责产出它。
