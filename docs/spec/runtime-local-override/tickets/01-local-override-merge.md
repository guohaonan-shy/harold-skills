# 01 — 运行环境做法的本机覆盖：开场注入和按能力取做法都合进本机写的同名小节

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

一台设备的 home 里可以放一份本机覆盖：`<home>/runtime/<运行环境名>.md`（home 的位置跟项目地图注入同一条规则：`IDEA_LOOP_HOME` 有值用它，否则用户主目录下的 `home`）。之后：

- 主会话开场注入的运行环境做法（命令行 `dyna runtime inject reference` 打印的那段）里，本机覆盖写了的同名小节整段换成本机写的，其余照插件里的数据。注入最前面多一行，说明合并结果：本机覆盖文件的路径、替换了哪几节、哪几节没对上没用上。
- 子 agent 用 `dyna runtime show <能力>` 取一个能力的做法时，拿到的是合并后的那一节；那一节是本机写的，输出第一行写「本机覆盖 <路径>：这一节是本机写的」。
- 没有 home、没有本机覆盖文件：两条命令的输出跟现在逐字相同，没有那一行。

合并规则（机械的，不靠判断）：

- 本机文件里每个 `##` 或 `###` 标题开一段，到下一个同级或更高级标题为止；`##` 段里带着的 `###` 算在这段里。代码块里的 `#` 行不算标题。
- 插件数据里同级、标题文字完全相同、且只有一处的那段，被整段替换。
- 本机文件里的标题在插件数据里找不到同级同名的、或找到不止一处的，这段不用，记进头一行的「没对上」。不往末尾追加。
- 本机文件第一个 `##` / `###` 之前的内容（如一行 `# magi 本机覆盖`）不用。
- 合并后注入超过 10000 字（开场注入的上限），头一行加一句「合并后 N 字，超过开场注入上限，后面被截断；完整的某一节跑 `dyna runtime show <能力>`」，照样注入。
- 本机文件读不了（权限、不是 UTF-8 之类）：当作没有覆盖，头一行写「本机覆盖读取失败：<原因>」，命令照常成功退出，不挡开场。

另外两处随之改：

- dyna 的 `runtime` 模块说明（`dyna runtime --help` 打印的长说明）加一段讲本机覆盖：放哪、怎么合并。
- 设备地图模板（wiki-conventions 的 home 两份地图参考，setup 建 home 和 dreaming 重写设备地图都用它）的「home 里每一层放什么」多列一行 `runtime/`：「这台设备对运行环境做法的本机覆盖，`<运行环境>.md` 一份，开场已合进注入的做法，`dyna runtime show` 取到的也是合并后的，不用另读」。
- 改了 dyna 代码：照仓库的 review 要求升 dyna 版本（0.0.2 → 0.0.3）、存新版本的命令登记表。命令和参数都没变，插件要的 dyna 版本范围不动。不发版（发版由人说了才发）。

## 验收标准

- [x] 单元测试（临时目录当插件目录和 home）覆盖并通过：替换一节；`##` 段连带 `###` 一起替换；单独替换一个 `###`；标题对不上；插件里同名标题不止一处；本机文件只有 `#` 标题和前言；没有 home；home 在但没有本机文件；本机文件读取失败；合并后超过 10000 字。每种情形断言注入全文和头一行。
- [x] 没有本机覆盖时，`inject reference` 和 `show <能力>` 的输出跟改动前逐字相同（对 claude-desktop 和 magi 两份真数据各断言一次）。
- [x] `show <能力>`：被替换的能力输出第一行是「本机覆盖 <路径>：这一节是本机写的」，正文是本机那段；没被替换的能力输出跟改动前相同。
- [ ] `cd dyna && go vet ./... && gofmt -l . && go test ./...` 全过；插件侧 `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'` 全过。 ⏭ 延后 → PR 交付验收：Go 侧全过；插件侧 725/726，只剩 `scripts/plugin-version.test.mjs` 一条红（idea-loop 是 0.1.29，origin/main 已是 0.1.35），起点 SHA 上就红，要在开 PR 时按 `REVIEW.md` 从 main 的版本往上升才会绿
- [x] dyna 版本升到 0.0.3，`dyna/registry/0.0.3.json` 是新二进制 `registry --json` 的输出。
- [x] 本机实测（用本地编出的 dyna，经 `IDEA_LOOP_DYNA_BIN` 指过去）：在一个临时 home 里写 `runtime/claude-desktop.md`，含一段 `## 推送`（一句本机做法）和一段 `## 不存在的能力`；跑插件的 `bin/dyna runtime inject reference --hook` 和 `bin/dyna runtime show 推送`，输出贴进交回：头一行写替换了「推送」、「不存在的能力」没对上；「推送」一节是本机那句。删掉本机文件再跑一次，输出跟插件数据逐字相同。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `idea-loop/scripts/session-start-inject.test.mjs`：跑真 hook 命令读开场注入，断言 reference 那段跟插件数据一致、在 10000 字以内；合并逻辑改了 reference 注入的拼法，最容易在这里坏。
- `dyna/internal/runtime/runtime_test.go`：`Inject`、`Show`、`sectionOf` 的现有测试；合并会复用分节逻辑。
- `idea-loop/scripts/setup-home-doc.test.mjs`、`idea-loop/scripts/dreaming-per-project-doc.test.mjs`：钉着设备地图模板的文字；模板多一行可能碰到它们的断言。
- `idea-loop/scripts/dyna-version.test.mjs` 和 `dyna` 的登记表测试：升版本、存登记表要跟命令树一致。
