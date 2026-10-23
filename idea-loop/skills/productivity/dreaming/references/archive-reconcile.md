# 档案对账：拿 `prod/` 去对运行中的界面

把设计档案（`docs/design/prod/`，下称「档案」）拿去对基准分支上真实跑着的界面，抓三种悄悄发生的漂移：绕过流程的改动（没走 `tmp/` 的提交）、环境变化（依赖升级、后端返回变了）、产品本身坏了。**前两种提议改档案，第三种报告给人，档案不被改成坏掉的样子。**

两波：先**源码波**（不开浏览器），再**实时波**（源码波干净也跑）。**两波都由 `idea-loop:ui-reviewer` 的对账模式做**，dreaming 只派工、汇它交回的行；源码波怎么查、怎么写，在它的定义里（「对账模式」的「源码波」）。只有 `prod/` 为空时的全站初扫留在 dreaming 自己手里，见 [initial-scan.md](initial-scan.md)。

用 Skill 工具调 `idea-loop:design-archive`，看它的「目录与分工」「进入方式从图上推导」「查询模块」。下文 `query` 指 `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-query.mjs" <worktree 根>`。提议表的行与处置闭集在 [proposal-table.md](proposal-table.md)。产物一律先写进 dreaming 自己的 tmp 目录，人批了才由归档脚本并进 `prod/`。

## 环境

- **worktree**：在 SKILL.md「起环境」那个从 `origin/<基准分支>` 新切的 worktree 里工作。开发环境跑基准分支的代码；`tmp/` 只在本地，放在自己的 worktree 里不会跟进行中需求的 `tmp/<spec-slug>/` 混。
- **开发服务**：照目标仓库 `DEVELOPMENT.md` 的「worktree 准备」准备，用一个自己挑的空闲端口起（`lsof -iTCP:<端口> -sTCP:LISTEN` 探一下，被占就换）。前后端要互相指向的，改它读的那个配置，别人的端口不碰。
- **浏览器**：和 `idea-loop:implement` 并行的执行方共用会话里那一个，照 `idea-loop:browser` 的「并行时抢锁」排队，owner 写 `dreaming`。锁目录默认放自己 worktree 的 `.tmp/dreaming/<日期>/browser.lock`；人说同一时间有 `idea-loop:implement` 在用同一个浏览器，就改用那一边的锁目录。
- **tmp 目录**：这一次运行的产物放 `docs/design/tmp/dreaming-<YYYY-MM-DD>/`（下称「dreaming 的 tmp 目录」）：
  - `delta/`：要进档案的对象，与 `prod/` 同构，人批了才由归档脚本并进 `prod/`；
  - `evidence/`：只给人看、不进档案的图（产品坏了的现状）。

  比对用的草稿图放 `.tmp/dreaming/<日期>/shots/`：一致的状态在 `docs/design/tmp/` 里不留任何新图。进行中需求的 `tmp/<spec-slug>/` 不归 dreaming 管，一个字节不碰。

## 源码波

交给 reviewer 的第一批（见实时波的派工）。它不开浏览器、不起服务，枚举 `prod/` 里的全部对象，查四件事：对象挂的代码路径还在不在、组件与动效有没有人引用、路由里有没有档案没收录的页面、页面的入口地址在不在路由里。发现写进结果文件的 `sourceWave.rows`，每行就是提议表 `档案对象` 一节的一行，处置落在 `改代码路径 · 删对象 · 补扫页面 · 标进入方式过期` 里；没有发现，整节写一行「无」。

dreaming 拿到它交回的结果后：

- **`改代码路径`、`删对象`、`标进入方式过期`**：行原样进 `档案对象` 一节；`改代码路径` 的对象全文已经在它写的 `delta/` 里。
- **`补扫页面`**（路由里有、档案里没有）：dreaming 自己当场按 [initial-scan.md](initial-scan.md) 扫这一页，产物进 delta，这一行换成 `初扫页面` 的一行（`发现` 写「档案里没有这一页」）；时间不够这次不扫，行原样留在 `档案对象` 一节，并把页面记进初扫那一节末尾的 `未扫：…`。全站初扫不交给 reviewer。
- **`sourceWave.addedToBatch`** 里的状态是 reviewer 为了确认入口地址是否过期、从后面几批里提前拿来判的：后面几批的清单里去掉它们。

## 实时波

对 `prod/` 里每个状态重新驱动一遍，统一交给 `idea-loop:ui-reviewer` 的对账模式：起服务、进状态、比对跟 `idea-loop:pr-review` 用的是同一套。

1. **派工**：用 Agent 工具起 `idea-loop:ui-reviewer`，只给指针：模式「对账」、仓库根（dreaming 的 worktree）、dreaming 的目录名、一组状态 id（不给需求差异；清单取自 `prod/index.md` 的页面清单，对每页跑 `query page <页面名>` 拿它的状态）、源码波「跑」或「不跑」、端口、浏览器锁目录、草稿图目录、结果文件路径。状态多（几十个以上）就按页面分批，一批一个 reviewer、一份结果文件；批与批之间串行（共用一个浏览器与一个开发服务）。**源码波只在第一批跑**，后面的批写「不跑」；第一批交回后，按它的 `sourceWave.addedToBatch` 从后面几批的清单里去掉那些状态再起下一批。
2. **它回什么**：每个状态一项：五种判定之一（一致 / 档案过期 / 进入方式过期 / 产品坏了 / 进不去）、截图比对结果、判定依据、写进 dreaming tmp 目录的文件。容差以内的状态什么都不写。
3. **判定拿来用**：只在两种情况回头：它交回 `incomplete`（环境问题，这一批没判成，写进提议表末尾的说明行，不当成产品坏了）；或它的结果文件缺项、自相矛盾。

## 五种判定怎么进提议表

| 判定 | 进哪一节、什么处置 | 证据格 | delta / evidence 里有什么 |
|---|---|---|---|
| 一致 | 不进表 | — | 什么都没有 |
| 档案过期 | `档案状态`，`替换档案`；发现以「档案过期：」开头，写差在哪，并带出自上次以来的提交（短 SHA + 标题），让人判那次改动是不是有意的 | 两张图并排：先 `prod/` 里档案的，再 `tmp/` 里 delta 的新图（`![档案里的](…prod/…) ![现在的](…tmp/…)`） | delta 里：新图、新的状态文件 |
| 进入方式过期 | `档案状态`，`改进入方式`；发现以「进入方式过期：」开头，写旧的做法与新的做法 | 改动前后的边（旧文 → 新文），已用新做法复走一遍 | delta 里：改了边或入口前置的状态文件 |
| 产品坏了 | `缺陷` 一节单列，处置只有 `开 issue`（或 `已有 #N`），档案不替换；发现以「产品坏了：」开头，现象写清楚 | 两张图并排：`prod/` 里档案的，再 `tmp/<目录名>/evidence/` 里现在的 | evidence 里：现状图；delta 里：什么都不放。同一节里附 issue 草稿（标题 + 正文：哪个状态、现在什么样、本该什么样、两张图） |
| 进不去 | 档案里原本就标了：不进表。原本没标：`档案状态`，`补进不去说明`；发现以「进不去：」开头 | 没有图，写「缺…」「试过…」 | delta 里：入边补了 `blocked` 的状态文件 |

- **分不清「档案过期」还是「产品坏了」，按产品坏了报**，在发现里写出两种解释，由人判：宁可多报一条，也不把一次回归写进档案。
- issue 草稿怎么开、怎么查重，见 [proposal-table.md](proposal-table.md) 执行段的 `缺陷` 一行。
- 容差以内的状态不重拍：档案的素材走 Git LFS，每次都重拍会让档案不停地出提交。

提议表写完过 `proposal-table-check`。

## 执行段

只执行批了的行。先收拾 delta、再校验、再归档：

1. **先删掉没批的对象**：没批的行对应的文件从 dreaming 的 tmp 目录里删掉：`替换档案` / `改进入方式` / `补进不去说明` 的状态文件与它的图（在 `delta/` 里），`改代码路径` 的对象全文；`evidence/` 不动。人回「改成…」的，按他的话改 delta 里那个文件。
2. **校验**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-check.mjs" <worktree 根> --delta dreaming-<日期> --no-used-by`。每条违规点名了文件与字段，按它改，直到通过。`删对象` 批了的行：把对象 id 一行一条写进 `delta/removed.md`（`- [[<id>]]`），还引用它的节点与边，按人说的在 delta 里改掉（改指向别的组件，或删边）；人没说清就不执行这一行。
3. **归档**：`node "${CLAUDE_PLUGIN_ROOT}/scripts/design-archive-write.mjs" <worktree 根> dreaming-<日期>`，先带 `--dry-run` 看，再去掉它跑。脚本负责覆盖、删除、重算 `usedBy` 与索引、检查 LFS、清空这个 tmp 目录；dreaming 只通过它写 `prod/`。它的提示（`.gitattributes` 没管 `prod/` 的素材、`.gitignore` 没忽略 `docs/design/tmp/`、`prod/index.md` 没定主视口 / 主题 / 语言）原样写进 PR 正文：那两个文件不是知识库文件，不在这个 PR 里改，交人处理。
4. **提交**：只提交 `docs/`、`DESIGN.md`、`GLOSSARY.md`；归档脚本写的素材（png / gif）在 `docs/design/prod/` 里，属于 `docs/`。一致的状态、没人批的档案行，不产生任何素材提交。
5. 归档之后 `docs/design/tmp/dreaming-<日期>/` 应已清空；这次没有任何要归档的档案行时 `evidence/` 还在，手动把整个目录删掉，不然它留在 `origin/<基准分支>` 上，下一次 dreaming 会把它当成漏归档。

## 边界

- 写 `prod/` 只走归档脚本；进行中需求的 `tmp/<spec-slug>/` 不碰。
- 「产品坏了」的画面只放 `evidence/`：放进 `delta/`，归档脚本会把它当档案的新真值并进去。
- 状态走不通就如实判，应用代码和开发环境的数据保持原样。
- 结论只出在提议表里；每个状态的判定来自 reviewer 这一次跑出来的证据，不凭对代码的印象。
