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

再加一条 tripwire：扫插件的 skill、agent、参考和 README（不扫 `evals/`，那里的回放用例本来就取自真实会话），出现 Toeflair 或上面这几处场景词就红，指出文件和行。

## 验收标准

- [ ] 插件（`evals/` 除外）里搜 `Toeflair`、`备考`、`错题`、`练习次数`、`听力` 都是 0 处
- [ ] `to-spec` 的 User Story 示例和 `glossary` 的术语示例还在、是通用场景，形状不变
- [ ] 仓库 `AGENTS.md` 的规则写着插件里不出现任何项目的信息；「从一个真实项目（Toeflair）里通用化出来」那句还在
- [ ] tripwire 先在改前的文本上红（指出 to-spec、glossary、README），改后绿
- [ ] 全量测试绿

## 选中的存量回归

- `idea-loop/scripts/to-spec-by-deliverable-doc.test.mjs`：改 to-spec 的示例会碰到它守的节表和字数
