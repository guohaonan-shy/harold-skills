# 01 — 会话开场注入 decision-rules 与 runtime

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

装了 idea-loop 的项目里，每个主会话开场（startup、resume、clear、compact、fork 都算）上下文里就有三段：`idea-loop:decision-rules` 的正文、`idea-loop:runtime` 的正文、当前运行环境那一份 runtime reference 的全文。会话停下问人、用运行环境能力时，不再需要先调这两个 skill。

做法是扩展 idea-loop 已有的 SessionStart 钩子（现在它只打一行「当前运行环境：X，用到能力时照 idea-loop:runtime 做」），不加新组件：

- 三段各一条钩子命令、各自输出；每段 < 10,000 字（Claude Code 对单个钩子输出的上限，超了只剩 2,000 字预览），钩子不写 matcher。
- 每段去掉 frontmatter；正文里的 `${CLAUDE_PLUGIN_ROOT}` 换成插件的真实路径；开头一行写明「以下是 `idea-loop:<名>` 的正文，开场注入，不必再调它」。runtime 段的第一行仍是「当前运行环境：<名>」。decision-rules 段的头行再加一句适用范围：「核心」一节针对有 spec 的工作，没有 spec 的会话里把「spec」读作人这次交代的事。
- 运行环境检测规则不变；`IDEA_LOOP_RUNTIME` 是不认识的名字时，runtime 两段照旧非零退出、stdout 为空，decision-rules 段照常输出。
- 两个 skill 本身保留，是注入读的唯一来源。

随之要改的给 agent 读的文档：

- 插件 `skills/` 下（这两个 skill 自己除外），主会话的「用 Skill 工具调 `idea-loop:decision-rules`」「用 Skill 工具调 `idea-loop:runtime`，读当前运行环境的『X』」一类指针，改成按名字引用（「照 `idea-loop:decision-rules` 的「X」」「照『X』（`idea-loop:runtime`）」）。只按名字引用某一节的句子不动。
- 子代理收不到注入：会走到运行环境能力的 agent 定义，开工那一行加「用 Skill 工具调 `idea-loop:runtime`」。判法：agent 正文，或它点名要调的 skill（连同该 skill 的 references）里出现『<能力名>』（能力名取 runtime 能力清单第一列）。已在开工调 `decision-rules` 的 agent 不动。
- `runtime` SKILL.md「怎么用」第 1 步：主会话开场已注入本正文和当前运行环境的 reference，直接照做；子代理照原来的步骤自己认环境、读 reference。
- 规则回放 runner 的改动核对：改动集合含这三类被注入的文件之一时，记为用上，途径 `injected`（被验会话由 `--plugin-dir` 起，钩子每次都跑）。
- idea-loop 的 README 里钩子、检测脚本、`idea-loop:runtime` 三处说明同步；`plugin.json` 的 version 按 `REVIEW.md` 定档（spec 定的是 minor；#327 若先合，照它重定）。

## 验收标准

- [x] 照 `hooks.json` 经 shell 跑全部 SessionStart 命令（设与不设 `MAGI_SESSION_ID` 各一遍）：恰好三段输出；每段 < 10,000 字；decision-rules 段含「## 护栏」、不含 frontmatter 的 `name:` 行；runtime 段第一行是「当前运行环境：<名>」；reference 段是对应运行环境那一份；输出里没有字面的 `${CLAUDE_PLUGIN_ROOT}`。单元测试覆盖。
- [x] SessionStart 钩子没有 matcher（单元测试断言）。
- [x] `IDEA_LOOP_RUNTIME=foo`：decision-rules 段照常输出；runtime 两段非零退出、stdout 为空（单元测试）。
- [x] 改动核对：改动集合只含 decision-rules 的 SKILL.md、事件流里没有任何读或调用时，返回用上、途径 `injected`；只含别的 skill 时仍是没用上（单元测试）。
- [x] 文档测试：`skills/` 下（这两个 skill 除外）不再出现「用 Skill 工具调 `idea-loop:decision-rules`」「用 Skill 工具调 `idea-loop:runtime`」；按上面判法会走到能力的每个 agent 定义都含开工调 `idea-loop:runtime`。
- [x] 全量测试通过（`REVIEW.md` 的全量测试命令），含 tripwire 与 no-project-leak。
- [x] 探针：用这个分支的插件起一个无头会话，要它不调任何工具复述 decision-rules「护栏」第一条，答对且事件流里没有工具调用。结果写进执行记录。
- [x] 回放趋势（不作门槛）：`decision-rules-scope-recommend` 用这个分支的插件跑 3 次，改后那一遍的改动核对结果记进该用例的 annotations.md。
- [x] README 与 `plugin.json` 的 version 已同步。
- [x] review 第 1 轮 S1（2026-11-15）：规则回放的改动核对只把被验会话所在运行环境的那一份 runtime reference 算作开场注入（运行环境按起被验会话时的环境变量、照检测规则判定）；另一份运行环境的 reference 照旧要被读到或调到才算用上。例：桌面端环境下改动只含 magi 那份 reference、事件流里没有读或调用，判「没用上」；改动只含桌面端那份，判「用上了，途径 injected」。
- [ ] CI（2026-11-15）：装到用户主目录的那份规则回放 runner 能正常启动（它用到的脚本都随安装一起拷过去，包括运行环境检测脚本）；安装测试全绿。

## 选中的存量回归

- `idea-loop/scripts/runtime-detect.test.mjs`：现有「hooks.json 的命令只打一行」断言会被这次改掉，要改成新契约，检测规则那几条必须照旧绿。
- `idea-loop/scripts/runtime-tripwire.test.mjs`：改指针时容易把运行环境专有写法带进 `skills/`、`agents/`。
- `idea-loop/scripts/runtime-skill-doc.test.mjs`：守着 runtime SKILL.md 的结构，改第 1 步时可能碰到。
- `idea-loop/scripts/decision-rules-who-decides-doc.test.mjs`、`decision-evidence-principles-doc.test.mjs`：守着 decision-rules 正文，确认注入没有改它。
- `idea-loop/scripts/no-project-leak.test.mjs`：头行、指针改写不得带项目信息。
- 规则回放 runner 下 `exercisedBy` 的现有测试：新途径不能改变已有判定。
