# 04 — 插件里去掉项目信息：例子换成通用的，仓库规则同步改，加 tripwire

**Blocked by**：02 — to-spec 加诊断步骤（同改 `to-spec` 的 SKILL.md）
**设计冻结**：不涉及 UI

## 要建什么

人定的方向：idea-loop 是通用工作流，插件里「不能带有一丝项目相关的信息」。2026-10-31 核过，插件里（`evals/` 除外）还有三处：

- `idea-loop:to-spec` 的 User Story 示例「作为备考的学生，我想要重做一道错题时不扣练习次数，以便放心把错题再做一遍」
- `idea-loop:glossary` 的术语示例（「学生可以做的一条练习，属于四种题型之一」「一个错词被归到的错误发生位置，三层之一：发音、听力、表达」）
- 插件 README「Portability」一节点名 Toeflair（「There is no inherited Toeflair/Fowler baseline」）

换成任何项目都读得懂的通用例子（例子的作用不变：User Story 示例仍示范「角色 / 能力 / 收益」，术语示例仍示范「定义 + _Avoid_」）。README 那句改成不点项目名的说法。

仓库根 `AGENTS.md` 的「不硬编码 Toeflair」一条现在写「Toeflair 只作为举例出现」，改成插件里不出现任何项目的信息、例子用通用的；前一句「idea-loop 是从一个真实项目（Toeflair）里通用化出来的」是仓库自己的历史，留着。

插件 `docs/` 下的两份设计文档（`design-modeling.md`、`pr-review-loop.md`）也点名 Toeflair 和它的 App、仓库名，同样换成通用说法。

守它的检查已经有一条：插件 `scripts/` 下的 `no-project-leak` 测试，现在只扫 `skills/`，词表只有 Toeflair 等几个。扩它，不另起：范围扩到插件里所有给 agent 或人读的文本——`skills/`、`agents/`、README、插件 `docs/`、插件 `AGENTS.md`；不扫 `evals/`（回放用例本来就取自真实会话）和 `scripts/` 下测试的夹具（那是测试数据，不是给 agent 读的规则）。词表加上「备考」「错题」「练习次数」「听力」。仓库根 `REVIEW.md` 里提到这条检查的那句随之对齐。

`to-spec` 的字数：工单 02 落地后 `to-spec` 整文件 4988 字（UTF-8 字符数，`to-spec-by-deliverable-doc.test.mjs` 要求 ≤5000），而且 02 为腾字数删掉了「测试决策」里「工具用目标项目自己的。」一句，那是 agent 会读的信息，本张恢复它。所以换 User Story 示例时写得比原句短，腾出恢复这句的字数。

## 验收标准

- [x] 检查的范围内（`skills/`、`agents/`、README、插件 `docs/`、插件 `AGENTS.md`）搜 `Toeflair`、`备考`、`错题`、`练习次数`、`听力` 都是 0 处
- [x] `to-spec` 的 User Story 示例和 `glossary` 的术语示例还在、是通用场景，形状不变
- [x] `to-spec`「测试决策」那段恢复了「工具用目标项目自己的。」，整文件仍 ≤5000 UTF-8 字符
- [x] 仓库 `AGENTS.md` 的规则写着插件里不出现任何项目的信息；「从一个真实项目（Toeflair）里通用化出来」那句还在
- [x] 扩过的 `no-project-leak` 先在改前的文本上红（指出 to-spec、glossary、README、插件 docs），改后绿
- [x] 全量测试绿

## 选中的存量回归

- `idea-loop/scripts/to-spec-by-deliverable-doc.test.mjs`：改 to-spec 的示例会碰到它守的节表和字数（整文件 ≤5000 UTF-8 字符）
- `idea-loop/scripts/no-project-leak.test.mjs`：本次扩它，原有词表不能删
