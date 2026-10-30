# 02 — 调度按根出卡片，issue 会话按组走：认领整组、逐个验证、实现一律开子会话、收尾关根

**Blocked by**：01 — issue 脚本认得根 issue
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 的调度（`issue-dispatch`）和 issue 会话（`issue-session`）今天的单位是一个 issue。这张工单把单位改成「一组」：一个根 issue 加它的子 issue，或一个没被整合的 issue（自己就是一组）。改的是三份 skill 的文字，用 01 加的脚本能力（`group` 命令、对根号整组翻状态、根跟着最慢的子 issue、最后一个子 issue 关时关根）。

**调度（issue-dispatch）**

- 一个根一张卡片、一个会话、占一个位置；候选由脚本给，已经不含子 issue 和开了不到 6 小时的。
- 卡片的标题照旧「<仓库名>#<根号> <根标题>」；prompt 和 background 带上子 issue 号（`group` 查出），说明这是一组。
- 数「没有会话的 issue」时，子 issue 算在它根的会话名下：根有会话，子 issue 就不报。
- description 里的「一个 issue 一张」改成按组说。

**issue 会话（issue-session）**

- 开场用 `group` 认出这一组；认领时对根号翻「验证中」，根和子 issue 一起进验证中；会话标题用根号。
- 审核阶段：每个子 issue 调一次 `issue-verify`，一个子 issue 一份 spec，都在这一个会话里跟人 grill；没被整合的 issue 照旧一次。
- 实现阶段：不管是根还是单个 issue，都按 spec 开子会话（`start_session`），一份 spec 一个；子会话自己切工单、实现、开 PR、跑它那个 PR 的 review，人在子会话里说合并。子会话的标题不用「<仓库名>#<号>」格式（调度靠这个格式数占位的会话）。简报写清 spec 路径、PR 合到哪、issue 状态归谁翻。
- PR 合到哪：根代表一个版本（要一起发）时，子会话的 PR 合进集成分支（如 `release/<plugin>-<版本>`），最后由根的会话合回主分支、升版本；根代表一个页面或模块时，各自合进主分支，有前置依赖的按依赖顺序合。
- 换阶段：每份 spec 的 PR 合并后照旧对那份 spec 跑 advance；根的状态由脚本跟着最慢的子 issue 走。
- 收尾：最后一个子 issue 关闭时根随之关闭（脚本做），会话照旧 retro、归档。
- 停点规则（什么时候停下等人）不动：它归同根的另一份 spec（no-decision-autopilot，#131）。只改结构。

**验证（issue-verify）**

- 写明在根的会话里会被逐个子 issue 调起：每次只处理一个子 issue、交回它那份 spec 的 slug；认领已由会话整组做过，不重复认领。

## 验收标准

- [x] issue-dispatch 写明一个根一张卡片、prompt 带子 issue 号、子 issue 算在根的会话名下不报「没有会话」
- [x] issue-session 写明开场整组认领（对根号翻验证中）、审核阶段每个子 issue 一次 issue-verify、实现阶段一律按 spec 开子会话且子会话标题不用「<仓库名>#<号>」、PR 合进集成分支或主分支的两种情形、最后一个子 issue 关闭时根关闭
- [x] issue-session 的停点规则（「要人拍板的就停下等人」等）原样保留，没有被改写
- [x] issue-verify 写明在根的会话里被逐个调起、不重复认领
- [x] 三份 SKILL.md 主体都在 5000 字以内；description 只做路由
- [x] 文中用到的脚本命令（`group`、对根号 `set`）与 01 落地的行为一致

## 选中的存量回归

- `idea-loop/scripts/skill-private-references.test.mjs`：改了 skill 文本，确认没有引到别的 skill 的私有 references。
- `idea-loop/scripts/no-project-leak.test.mjs`：确认没有把本仓库或 Toeflair 写死进插件规则。
