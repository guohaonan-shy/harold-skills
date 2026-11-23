# 01 — 命令行把固定文案写进 home、开场不再注入 decision-rules

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

一台设备跑 setup 时，`dyna home config plan` 多出第 4 项 `rules`：列出 home 的 `AGENTS.md` 里「思考与决策」「沟通」「证据」三节的改前、改后；`dyna home config apply` 把插件里那份固定文案写进这三节（人写的节一字不动，三节已是最新时不写）。插件升级、固定文案变了以后，开场的 `dyna home map --hook` 发现 home 里这三节跟插件不一致，在开场留一行「home 的固定文案落后于插件，跑 `/idea-loop:setup`」，不拦会话；一致时不出声。

同时命令行这一侧不再认 `decision-rules`：

- `dyna runtime inject` 只剩 `runtime`、`reference` 两段，给 `decision-rules` 报未知段。
- `dyna pr candidates` 的依据种类多一种「目标」：种类是「目标」的，引的文件必须是这次的 spec，引文要在 spec 里原样找得到，找不到照现在的做法丢弃。注释里指向 decision-rules 的说法改指 pr-review 的 review 标准。
- `dyna agent` 填 Codex 审查者提示词时，`decision_rules` 这个键换成 `review_standards`（指 pr-review 的 review 标准那份参考文件），另加 `user_rules` 指 `~/.claude/CLAUDE.md`；这个文件不在时填「无」，不报错。提示词模板里用到这两个键的地方同步改。
- `dyna design flow` 等注释、测试里指向 decision-rules 参考文件的路径，改到 `idea-loop:evidence` 的参考文件（那两份参考文件由 02 搬过去，路径是 evidence skill 目录下的 `references/ui-flow.md`、`gif.md`）。

固定文案原文：spec「实现决策 › 固定文案的原文」那段引文块，逐字搬进 setup 的一份新参考资料（去掉引用符号 `> `，三个 `## ` 标题照原样）。插件里只有这一份；`dyna` 从插件目录读它。把这份文件加进不许出现项目信息的那个测试的扫描范围。

文案管哪几节：三节节名「思考与决策」「沟通」「证据」加进 idea-loop 管的节（现在是「设备地图」「项目」）。搬进来的旧 `CLAUDE.md` 文字照旧放在 idea-loop 的节之前。

改了命令和参数：升命令行版本（集成分支现在是 0.0.8，本工单升到 0.0.9；落地前集成分支已被别的 PR 升过，就在那时的版本上再升一档），存新版本的登记表。插件要的命令行版本下限不动（skill 开始用新命令时才提，且要已发布）。

> 人的决定（2026-11-23）：D2「我也的可以放在沟通里面」——固定文案「沟通」在三句话框架之后、「只放对方……」之前补一句：- **要我定的事写成一道题**：选项之间差在我能感到的地方，每个选项配一个真实例子（走一遍会看到什么），给推荐和一句理由。 spec「固定文案的原文」已同步。

## 验收标准

- [x] `home config plan` 在一个没有这三节的 home 上列出第 4 项 `rules`，状态「待改」，改后是三节标题；`--only rules` 和 `--only 4` 都认。
- [x] `home config apply` 后 home 的 `AGENTS.md` 有三节、内容与插件那份逐字相同；原有的人写的节（含 `## 设备地图` 之前那段）一字不动；再 apply 一次不写文件、状态「已是」。
- [x] 插件那份改一个字后，plan 显示「待改」，apply 只替换这三节。
- [x] `home map --hook`：三节与插件不一致（或缺）时开场输出里多一行落后提醒；一致时输出与改前相同。
- [x] `runtime inject decision-rules` 报未知段；`runtime inject runtime`、`reference` 输出不变。
- [x] `pr candidates`：种类「目标」、引文在 spec 里找得到的收下；引文找不到的、文件不是这次 spec 的丢弃；原三种照旧。
- [x] `agent` 填好的提示词里有 `review_standards`、`user_rules`，没有 `decision_rules`；`~/.claude/CLAUDE.md` 不在时 `user_rules` 是「无」。
- [x] 命令行版本已升、新登记表已存，`go test ./...` 全绿；仓库根的版本与扫描测试全绿。
- [x] 不许出现项目信息的测试扫到固定文案那份文件并通过。
- [x] 人的决定（2026-11-23）：固定文案文件的「沟通」一节与 spec「固定文案的原文」逐字一致（含新补的「要我定的事写成一道题」一句）；setup 的说明里讲「沟通」有什么的地方同步；相关测试全绿。
- [ ] review 第 1 轮 C1（2026-11-23）：开场注入从三段变两段、用户级配置从三项变四项之后，所有写着旧数量的说明同步成新数量（含 idea-loop 的 README 介绍开场注入测试那一行、开场注入测试文件开头的注释、`dyna home` 模块的总说明）；依据 REVIEW.md「同一个改动里同步它自己的 README.md」。

## 选中的存量回归

- `dyna/internal/home/config_test.go`：三项的 plan / apply 行为，加第 4 项最容易改坏编号和 `--only` 解析。
- `dyna/internal/runtime/runtime_test.go`：开场注入逐字比对旧输出，去掉一段后要改钉。
- `dyna/internal/pr/loop_test.go`：候选准入，依据种类变了。
- `dyna/internal/app/app_test.go`：hook 调用清单里有 `runtime inject decision-rules --hook`。
- `scripts/dyna-version.test.mjs`、`scripts/dyna-scan.test.mjs`：升版本、登记表。
