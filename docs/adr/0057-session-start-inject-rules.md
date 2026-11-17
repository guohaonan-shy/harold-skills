---
type: adr
status: 生效
tags: [idea-loop, decision-rules, runtime, hooks, session-start-inject-rules]
summary: SessionStart 钩子开场注入 decision-rules、runtime 正文与当前环境 reference
related: ["[[0026-runtime]]", "[[0036-decision-rules-who-decides]]", "[[326]]", "[[313]]"]
---

# ADR-0057 — 开场注入 decision-rules 与 runtime

> 由 spec `session-start-inject-rules` 蒸馏而来，该 spec 已删除。

## 1 背景（why）

`idea-loop:decision-rules`（自己定还是问人、要人定的怎么摆成题）和 `idea-loop:runtime`（定时任务、会话管理、浏览器、向人提问这些能力在当前运行环境里怎么做）原本都是按需调用的 skill；SessionStart 钩子只往上下文里放一行「当前运行环境：X」，规则正文要会话自己去调（ADR-0026 §2 定的做法）。

#313 的回放用例 `decision-rules-scope-recommend`（2026-11-14）暴露了后果：被验会话在 issue 讨论里摆出范围题，3 次里有 1 次没读 `decision-rules`，把不影响交付的改进也推荐并进，新规则没起作用；另外两次自己调了，一次照新规则推荐，一次改前也答「是」。范围题常在自由讨论里冒出来，那一刻没有哪一步要求先调；`issue-session` 只在「边界」里写了一句「停下问人先对 `idea-loop:decision-rules`」。规则没被读到的频率只有这一组样本，会话日志里没有「该读没读」的记录，更大范围查不到。

根因：两份几乎每个会话都要用的规则挂在按需调用的指针后面，取不取由会话自己判断；钩子已经每个会话都跑，却只注入一行指针。

## 2 决策（how）

扩展已有的 SessionStart 钩子，不加新组件（人在 #313 会话的原话：「runtime 以及 决策方式在session 开始的hook 注入我觉的是可以的，不在需要其他skill 调用了」）。

- **三段分开输出，每段一条钩子命令**：`decision-rules` 正文；`runtime` 正文（第一行仍是「当前运行环境：X」）；当前运行环境那份 reference 全文。每段去掉 frontmatter，`${CLAUDE_PLUGIN_ROOT}` 换成插件的真实路径（skill 被调用时宿主会换，钩子输出不会），开头一行写明「以下是 `idea-loop:<名>` 的正文，开场注入，不必再调它」。
- **分开的理由是单个钩子输出上限 10,000 字**（Claude Code hooks 文档「JSON output」，2026-11-15 查）：超出的存成文件、上下文里只留路径和前 2,000 字预览，且不提示会话去读。现有大小：`decision-rules` 主体 1139 字、`runtime` 主体 1495 字、`claude-desktop.md` 7252 字、`magi.md` 6063 字，合成一段约 9,900 字，加头行就过线。
- **reference 注入全文，不做摘要**：摘要是同一内容的第二份来源。代价是每个会话多付约 1.0 万字上下文，人看到这个量后定了方向。
- **skill 本身留着**，是注入的唯一来源，改规则只改一处；子代理和人显式调用照旧能用。
- **钩子不写 matcher**：startup、resume、clear、compact、fork 都注入，compact 之后三段重新注入。三段各自独立：`IDEA_LOOP_RUNTIME` 写了不认识的名字时，两段 runtime 照旧报错退出，`decision-rules` 照常注入。
- **主会话里 skill 的「用 Skill 工具调 `idea-loop:decision-rules` / `idea-loop:runtime`」指针改成按名字引用**，正文已在上下文，「去取」成了重复。
- **子代理收不到 SessionStart 注入**，所以 agent 定义里开工时自己调 `idea-loop:runtime`。哪些 agent 要补，判法是机械的：agent 定义的正文，或它点名要调的 skill（连同那个 skill 的 `references/`）里出现『<能力名>』（`runtime` 能力清单第一列）。起草时粗查是 6 个（`implementer`、`ui-reviewer`、`designer`、`design-steward`、`issue-triager`、`uiux-imaginer`），落地时以判法重算，agents/ 下 9 份定义开工调 runtime，多出的是 `adr-reconciler`、`technical-auditor`、`pr-reviewer`。
- **`decision-rules` 注入头行加适用范围**：「核心」一节针对有 spec 的工作；没有 spec 的会话里，把「spec」读作人这次交代的事。不拆成两份 skill：拆是新增组件，头行一句话就消除误读。
- **规则回放的改动核对认注入**：`exercisedBy` 在改动集合含注入文件时记为用上，途径 `injected`；PR #330 第 1 轮 S1 收窄为只把被验会话所在运行环境的那一份 reference 算注入，另一个环境的不算。已知限制：不从事件流核实钩子真的跑了。
- **版本档定 patch**：0.1.19 到 0.1.20，人在合并前定（「升级为patch」）；起草时按 `REVIEW.md` 判的是 minor。

取舍（没做）：

- 没做子代理的注入：SubagentStart 钩子能带 `additionalContext`，但是否进到子代理上下文没核实，探针被权限拦下没跑。核实了可以另开 issue。
- 没给 `scripts/codex-prompt.mjs` 改：Codex 不是 Claude Code 会话，不跑插件钩子。
- 没改 `decision-rules`、`runtime` 的规则内容，也没让注入随项目定制（本机覆盖，#295）。

## 3 结果（result）

- `idea-loop/hooks/hooks.json` 的 SessionStart 有三条命令：`runtime-detect.mjs --inject decision-rules | runtime | reference`，无 matcher；`idea-loop/scripts/runtime-detect.mjs` 的 `injection()` 产出三段（去 frontmatter、换占位符、头行写「开场注入，不必再调它」）。
- `idea-loop/skills/productivity/runtime/SKILL.md`「怎么用」第 1 步改为「主会话开场已注入，子 agent 自己跑检测」；`implementer`、`pr-reviewer`、`designer`、`uiux-imaginer`、`ui-reviewer`、`design-steward`、`issue-triager`、`adr-reconciler`、`technical-auditor` 的定义里开工调 `idea-loop:runtime`；`idea-loop/evals/retro/replay.mjs` 的 `injectedFiles()` 与 `exercisedBy` 认 `injected`；`README.md` 同步。
- 合并在 PR #330（开场注入 decision-rules 与 runtime）；issue #326 已 COMPLETED 关闭；决定记录 [[326]]；触发它的回放见 [[313]]。
- 守护：`scripts/session-start-inject.test.mjs`（三段输出、每段在上限内、顺序、去 frontmatter、占位符展开、未知运行环境的行为、符号链接路径）、`scripts/session-inject-doc.test.mjs`（skills 里不再有取这两个 skill 的指针、触及能力的 agent 开工调 runtime）、`scripts/runtime-detect.test.mjs`、`scripts/retro-replay.test.mjs`。本次对账跑了前三个，19 条全过。

承接 ADR-0026：它 §2「检测」里「主会话由 SessionStart hook 注入一行、hook 不注入整份 reference」这一句被本决策改写。
