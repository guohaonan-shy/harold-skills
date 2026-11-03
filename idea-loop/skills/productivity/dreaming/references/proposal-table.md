# 提议表：形状，和批了之后怎么执行

提议表是提议段唯一的输出，也是执行段唯一的输入：人没批的行，执行段不碰。下文 `proposal-table-check` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/proposal-table-check.mjs"`：写完表、给人看之前先过它，退出码 0 才交出去，2 就按它逐条点名的问题改。

## 放哪、谁看

- 表写在 dreaming 自己 worktree 根的 `.tmp/dreaming/<YYYY-MM-DD>/proposal.md`（不进仓库）。这个 worktree 从 `origin/<基准分支>` 新切，不是任何一个进行中需求的工作区。
- **有行**：一屏摆得下就在会话里按节摆给人；摆不下就发 Artifact，会话里按节摆。`候选` 和 `DESIGN.md 条目` 有行时另做审核页（[review-page.md](review-page.md)）。人不在场时，再发一条推送通知：一句话，几类、共几行。
- **空表**：只推一句「这次无事」，不发 Artifact。
- 人在会话里逐行回「批 / 不批 / 改成…」。不批的行不执行；「改成…」按人的话改那一行再执行。

## 表怎么汇成

提议段的行来自三个专职 agent 与 dreaming 自己的机械检查，各写一段，dreaming 把它们并成一张表：

| 段 | 谁写 | 放哪 |
|---|---|---|
| 文档 | `idea-loop:adr-reconciler` | `.tmp/dreaming/<YYYY-MM-DD>/rows-docs.md` |
| 候选、DESIGN.md 条目，及它们牵出的缺陷行 | `idea-loop:design-steward` | `.tmp/dreaming/<YYYY-MM-DD>/rows-design.md` |
| 档案对象、档案状态，及产品坏了的缺陷行 | `idea-loop:ui-reviewer` 的对账模式（[archive-reconcile.md](archive-reconcile.md)：源码波出 `档案对象`，实时波出 `档案状态` 与缺陷） | dreaming 自己的 tmp 目录与交回的结果文件 |
| 初扫页面 | dreaming 自己（[initial-scan.md](initial-scan.md)：`prod/` 为空，或 reviewer 报了 `补扫页面`） | dreaming 自己的 tmp 目录 |
| 漏归档 | dreaming 自己机械地查 | 直接写进表 |
| retro 候选 | dreaming 自己（[retro-candidates.md](retro-candidates.md)：读候选池、调计数脚本） | 直接写进表 |

同一行类型只出现在一节里：`缺陷` 有两个来源，并成一节。并好后过校验脚本，退出码 0 才交出去。

## 一张表的形状

一个 `#` 标题（写日期）。标题下、第一个 `##` 节之前，先写说明行，每行一句，不是表的行，校验脚本不数它们：

- **对账范围**（起了 ui-reviewer 的那次一定有）：`对账范围：增量——…` 或 `对账范围：全量——…`，三样都要写：全量还是增量、为什么、对了几个状态。怎么定、怎么写，见 [incremental-scope.md](incremental-scope.md)。
- **上一张还没处理**：`上一次（<日期>）的提议表还没处理`，只在上一张确实没处理时写，两张表不合并。

下面按行类型分 `##` 节，节名就是行类型，闭集。每节一个表，列固定为：

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|

- 一行一个对象（一份文档、一个档案状态、一条候选、一个漏归档的需求、一条攒够次数的 retro 候选、`DESIGN.md` 的一处）。五列都要填。
- 「建议处置」从该行类型自己的闭集里取，后面可以跟一个括号写补充（`订正（路径改名）`）。闭集里找不到合适的，说明这份文件缺一条：先补闭集和校验脚本的单测，再写表。
- 「选项」写人的几种回法（至少「批 / 不批 / 改成…」；两种解释分不清时把两种都写上）。
- 跑过的部分，一节没有行就写一行 `无`：节在，才说明这一部分跑过了。没跑的部分整节不写。
- 节内可以有表格以外的说明行，最常见的是全站初扫末尾的 `未扫：…`；说明行不算「行」，不让表变成非空。
- 没跑成的批（实时波交回 `incomplete`、环境起不来）写在表末尾一行说明里：哪些状态没判、为什么，再附一句「下次可说全量补上」。它也是说明行，不让空表变成非空。
- 「一致」的状态没有话要说，不进表。

| 节（行类型） | 一行是什么 | 建议处置的闭集 |
|---|---|---|
| `文档` | 文档对账（`adr-reconciler`）里一份有话要说的文档 | 写 ADR 删 spec · 写 ADR 未采纳删 spec · 报警 · 订正 · 标注被取代 · 删漏网工单 · 标搁置 · 去审核 · 去设计 · 问人 · 迁移布局 · 删除 |
| `档案对象` | 设计档案里源码一侧查出问题的一个对象 | 改代码路径 · 删对象 · 补扫页面 · 标进入方式过期 |
| `档案状态` | 实时重新驱动后，一个有话要说的状态 | 替换档案 · 改进入方式 · 补进不去说明 |
| `初扫页面` | 全站初扫建出来的一整页（人按页面批） | 新增页面 |
| `候选` | 一条待蒸馏的设计法候选 | 改写已有规则 · 追加新规则 · 已覆盖不加 · 留在原处 · 起草通用原则 issue · 起草缺陷 issue · 驳回 |
| `漏归档` | 基准分支上 `docs/design/tmp/<spec-slug>/` 里还留着设计产物、而 spec 已完成或已没有 spec 目录的一个需求（绕过合并步骤合进去的），见 [missed-archive.md](missed-archive.md) | 补归档 · 丢弃 |
| `retro 候选` | 候选池（`docs/records/retro-candidates/`）里出现 ≥ 3 次、还在池里的一条候选，见 [retro-candidates.md](retro-candidates.md) | 开 issue：机械检查 · 开 issue：改 skill · 留在池里 · 驳回 |
| `DESIGN.md 条目` | `DESIGN.md` 里对账出问题的一处 | 改法 · 移出 · 删除 · 改写为全局规则 · 合并为一条 · 新建 DESIGN.md · 处理 lint 警告 · 交人裁决 |
| `缺陷` | 一条要开到目标仓库的 issue 草稿 | 开 issue · 已有 #N（N 是已开着的那条的编号） |

### 「发现」的开头是判定

- `档案状态`：以 `档案过期：` / `进入方式过期：` / `进不去：` 开头，判定和处置对得上（档案过期 → 替换档案，进入方式过期 → 改进入方式，进不去 → 补进不去说明）。
- `缺陷`：以 `产品坏了：` 或 `法对代码错：` 开头。分不清是档案过期还是产品坏了，按产品坏了报，在冒号后写出两种解释。

### 证据格要有的东西

- **档案行的两张图**：`档案状态` 里除了「进不去」，和 `缺陷` 里的「产品坏了」，证据格放两张图并排，次序固定：先是 `prod/` 里档案原本的样子，再是 `tmp/` 里这次新拍的。「进不去」没有可拍的，写「缺…」「试过…」：缺什么前置条件、试过哪些路线。
- **产品坏了不改档案**：「产品坏了」的行只进 `缺陷` 一节，处置只有「开 issue」或「已有 #N」。把坏掉的样子写进档案，就是把一次回归冻成真值。
- **初扫行指向 `tmp/`**：`初扫页面` 的证据指向 `tmp/` 下这次建出来的页面草稿。
- **删对象写引用**：`档案对象` 的 `删对象`，证据里写「引用：」，列出还引用它的节点与边；没有就写「引用：无」。
- **`候选`**：证据里有图（这条规则说的那块界面，取自设计档案或实现）；实在没有界面写「无图：原因」。处置是 `改写已有规则` 或 `追加新规则` 的，还要写「并进：」（进哪一章哪一条）和旧文新文并排（`旧：「…」→ 新：「…」`，追加写 `旧：无`）。人可能不在场，并排的文字写在表里。
- **`retro 候选`**：证据格放各次出现的逐字原话和决定记录链接，不能空；人批的时候靠它核对次数。
- **`DESIGN.md 条目`**：证据里写「依据：」并点名那条标准（design-modeling 的哪一节，具体到哪条规则或哪一行；官方 design.md 规范；或 lint 规则名），还要有旧文（`旧：「…」`）和改后的样子（`→ 新：「…」`，删掉写 `→ 删`）。`新建 DESIGN.md` 没有旧文；`交人裁决` 的新文写在「选项」里，每个选项一份。

档案那几类行怎么产生，见 [archive-reconcile.md](archive-reconcile.md) 与 [initial-scan.md](initial-scan.md)。

## 样例

下面这张表是合规的，校验脚本的单测会跑它，改格式时这里和脚本一起改。例子是虚构的结账产品。

```markdown
# 提议表 2026-10-19

对账范围：增量——自 2026-10-12 的提交 a1b2c3d 起，改过的代码牵到 3 个状态（档案共 42 个）

上一次（2026-10-12）的提议表还没处理

## 文档

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|
| docs/spec/cart-promo/cart-promo.md | 自称 实现中；促销徽章组件与接口都已在树上，PR 标题对得上 | src/cart/promo.ts、PR 已合并 | 写 ADR 删 spec | 批 / 不批 / 改成… |

## 档案对象

无

## 档案状态

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|
| pages/cart--empty | 档案过期：空购物车的文案改了，引用的代码自上次改动有 3 次提交 | ![档案里的](docs/design/prod/pages/cart/assets/cart--empty.png) ![现在的](docs/design/tmp/dreaming-2026-10-19/delta/pages/cart/assets/cart--empty.png) | 替换档案 | 批 / 不批 / 改成… |

## 初扫页面

无

## 候选

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|
| 候选：卡片内边距统一 16px（来源：对象正文的候选；组件 PromoCard、OrderCard 重复，共 2 次） | 与已有规则「卡片内边距 12px」矛盾 | ![促销卡](docs/design/prod/components/PromoCard/assets/promo-card.png) ![订单卡](docs/design/prod/components/OrderCard/assets/order-card.png) 并进：Components · 卡片（改写）；旧：「卡片内边距 12px」→ 新：「卡片内边距 16px」 | 改写已有规则 | 采纳 / 改措辞 / 留在原处 / 驳回 |

## 漏归档

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|
| docs/design/tmp/cart-promo/ | spec 已是「完成」；tmp 里还留着 canvas/ 与 delta/，没经过归档 | git ls-tree origin/main docs/design/tmp/cart-promo/ 列出 12 个文件；spec 状态：完成 | 补归档 | 批 / 不批 / 改成… |

## retro 候选

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|
| 候选：下单前先核对自动填好的字段（落点 `idea-loop:seo-outreach`；docs/records/retro-candidates/2026-10-26-seo-outreach-verify-autofilled-fields.md） | 出现 3 次（acme-shop#12、#19、#23）；已推翻 0 条；无反例 | acme-shop#12：「提交前先看一眼自动填的邮箱对不对。」，决定记录：[[12]]；acme-shop#19：「又是自动填错了邮箱。」，决定记录：[[19]]；acme-shop#23：「还是先核对再提交。」，决定记录：[[23]] | 开 issue：改 skill | 批 / 留在池里 / 驳回 / 改成… |

## DESIGN.md 条目

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|
| Motion 章第 3 条 | 带日期的先例：不属于设计系统本身 | DESIGN.md 第 88 行；旧：「结算弹层淡入 0.2s（2026-07-16 定）」→ 删；依据：design-modeling「五条写法规则」第 5 条「只写当前状态」、「明确不进 DESIGN.md 的内容」里的带日期的先例 | 删除 | 按新文改 / 改措辞 / 不改 |

## 缺陷

| 对象 | 发现 | 证据 | 建议处置 | 选项 |
|---|---|---|---|---|
| pages/cart--checkout | 产品坏了：结算按钮点了没反应；也可能是档案没跟上。控制台 TypeError | ![档案里的](docs/design/prod/pages/cart/assets/cart--checkout.png) ![现在的](docs/design/tmp/dreaming-2026-10-19/delta/pages/cart/assets/cart--checkout.png) | 开 issue | 批 / 不批 / 改成… |

没跑成的批：pantry 页的 2 个状态（开发服务没起来），没判。下次可说全量补上。
```

## 执行段

只执行批了的行，在提议段同一个 worktree 里做，PR 也从它开。顺序：

1. 先处理会删掉东西的行，再处理会改写的行，最后跑 link sweep、刷各层 `index.md`（`docs/spec/index.md` 用 `spec-status.mjs index <docs>`）。
2. 每类行这样执行：

| 行类型 | 怎么执行 |
|---|---|
| `文档` | 照 [docs-reconcile.md](docs-reconcile.md) 的「几种情况怎么处置」：先写 ADR（提议段把草稿放在 `adr-drafts/`），再 `git rm` 整个 spec 目录；写 ADR、删 spec 时，顺带把设计档案里「决定」的来源链接 `[[<spec-slug>]]` 改指新 ADR（编号不复用、原地改写）。迁移布局照 `idea-loop:wiki-conventions` 的「从平铺布局迁移」 |
| `候选` / `DESIGN.md 条目` | 照 [candidate-distillation.md](candidate-distillation.md) 与 [design-md-reconcile.md](design-md-reconcile.md) 的「执行段」 |
| `缺陷` | 照 `idea-loop:spec-status` 的「开一个待验证的 issue」开到**目标仓库**，标题和正文用表里起草的，查重时连状态 id 一起搜。产品坏了的行只开 issue，档案不动，它的 `evidence/` 图随 tmp 目录一起丢 |
| `retro 候选` | 照 [retro-candidates.md](retro-candidates.md) 的「执行段」：批了开 issue 的，开到落点所在的仓库，并把候选文件的状态改成 `已开 issue（<链接>）`；驳回的改成 `驳回（<理由>）`；留在池里的不动。dreaming 不改 skill |
| `漏归档` | 照 [missed-archive.md](missed-archive.md) 的「执行段」：补归档是对它跑一次 ui-reviewer 归档模式、人看草稿、归档脚本并进 `prod/`；丢弃是 `git rm -r docs/design/tmp/<spec-slug>/`。都跟其余改动同一个 PR |
| `候选` 的「起草通用原则 issue」 | 同样人批了才开，开到 harold-skills 仓库，命令照 `idea-loop:design-modeling` 的「蒸馏」 |
| `档案对象` / `档案状态` / `初扫页面` | 产物都在 `docs/design/tmp/dreaming-<日期>/delta/`：先删掉没批的对象，再跑档案的归档脚本整目录并进 `prod/`。步骤见 [archive-reconcile.md](archive-reconcile.md) 的「执行段」与 [initial-scan.md](initial-scan.md) 的「执行段」 |

档案对象文件的任何改动都走 `delta/` 加归档脚本，包括「处理完的候选从档案对象里删掉」：把改过的对象全文放进 `delta/`，随同一次归档并进 `prod/`。

3. **只提交知识库文件**：`docs/`、`DESIGN.md`、`GLOSSARY.md`（`docs/design/prod/` 里归档脚本写的页面、状态、组件与素材在 `docs/` 之内）。归档后 `docs/design/tmp/dreaming-<日期>/` 若还在（这次没有要归档的档案行），整个删掉，不然它留在 `origin/<基准分支>` 上，下一次 dreaming 会把它当成漏归档。开一个 PR（`gh pr create`，标题「dreaming：<日期> 知识库对账」，正文按节列执行了哪些行、哪些没批留着、开出去的 issue 编号）。
4. 结果摆给人：动了什么、留了什么、为什么留。
