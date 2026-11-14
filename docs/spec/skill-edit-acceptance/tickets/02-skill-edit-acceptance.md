# 02 — 改 skill 的工单自带三格，落地时脚本核对交回

**Blocked by**：01 — 预重构：implement 主文件压回 5000 字以内
**设计冻结**：不涉及 UI

## 要建什么

改 skill、agent 定义或 skill 参考文件的工单，从切票到落地多一道关：

- **「这类文件」的判据**（脚本和切票共用这一条）：路径以 `SKILL.md` 结尾；或在某个 `skills/` 目录下、以 `.md` 结尾；或是某个 `agents/` 目录下直接的 `.md` 文件（含 `.claude/agents/`）。工单文件（`docs/spec/*/tickets/`）不算。
- **切票**（`idea-loop:to-ticket`）：工单要改这类文件的，验收末尾固定带三格，原文照 spec「实现决策」的「三格的原文」（就是本工单下面验收末尾那三格）。
- **执行方**（`idea-loop:implementer` 定义）：「开工前」第 5 步直接点名：工单改 skill、agent 定义、skill 参考文件，用 Skill 工具调 `idea-loop:writing-for-agents`，读完再动手，不再要先经 `CODING_STANDARDS.md` 的链接转一跳（其余写法规范照旧读）。交回格式的 `verified` 多一种行：每个改到的这类文件一行 `杠杆 | <文件> | <对的哪条杠杆，用 writing-for-agents 里的叫法>`；「读了哪几份写法规范」那一行调了的写「调」。
- **机械检查**：`ticket-ledger.mjs` 加一个子命令（名字自定，spec 里暂叫 `skill-edit`），输入提交号和一个装着交回原文的文件：提交改到了这类文件、而写法规范那一行的方式不含「调」或名单里没有 `writing-for-agents`，或有改到的文件没有杠杆行（第三栏为空也算没有），就以非零退出码退出并逐条列出原因；没改到这类文件、或都齐了，退出码 0。
- **编排者**（`idea-loop:implement` 的「核对与落地」）：`landed` 的核对里加一项：把交回原文存进 `.tmp/implement/<spec-slug>/` 下的文件，跑这个子命令，不过跟现有核对不过一样处理。
- **插件 `README.md`**：讲 to-ticket、implement、implementer 的地方，有写到验收或核对的，同步一句。
- **版本**：idea-loop 的 `plugin.json` `0.1.14` → `0.1.15`（主分支上 #174 的改动还没发版，跟这次一起发）。

## 验收标准

- [x] 子命令的纯函数部分单测（照 `ticket-ledger.test.mjs`）：#304 的提交 2be5d8e 改的文件列表加它的交回原文（取自 spec「问题陈述」2 引的那行；交回全文在本机 #303 会话记录里，搜 `2be5d8e147cc` 能找到）→ 不过，原因是方式只有「读」、pr-review 的 `SKILL.md` 没有杠杆行；同一提交、交回改成「调 · writing-for-agents」并带杠杆行 → 过；只改了脚本和工单文件的提交 → 过；agent 定义、skill 参考文件、`.claude/agents/` 下的文件都被认成这类文件，`docs/spec/*/tickets/` 下的不算。先见红再见绿
- [x] 子命令在真仓库上跑：对 2be5d8e 和那份交回原文退出码非零并列出两条原因（写进交回）
- [x] 文档检查（照 `implementer-standards-doc.test.mjs`），先对着改前文字见红：to-ticket 写了「这类文件」的判据和三格原文；implementer 第 5 步直接点名用 Skill 工具调 `idea-loop:writing-for-agents`，交回格式有杠杆行；implement「核对与落地」的 landed 核对调这个子命令
- [x] implement 的 `SKILL.md` 正文加完仍 < 5000 字（工单 01 的检查绿）
- [x] 插件 `README.md` 同步；idea-loop 版本是 `0.1.15`
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」
- [ ] review 第 2 轮 C2（2026-11-14）：版本按主分支新加的三档规则升（仓库 REVIEW.md「额外要求」）：这次改了落地流程的行为、老用法照样能用，算 minor，从主分支当前的 0.1.15 升到 0.2.0；钉版本的检查跟着改；档位和理由写进交回（编排者写进 PR 描述的「参考」）

## 选中的存量回归

- `idea-loop/scripts/ticket-ledger.test.mjs`：同一个脚本，`landed`、`of` 两个子命令不能被改坏。
- `idea-loop/scripts/implementer-standards-doc.test.mjs`：钉着执行方第 5 步「先读写法规范」的说法，这次改的正是那一步。
- `idea-loop/scripts/no-project-leak.test.mjs`：规则文字和例子不能带项目名；单测的 2be5d8e 交回原文放测试里，要过这个检查（必要时把项目名换成通用说法）。
- `idea-loop/scripts/skill-private-references.test.mjs`：如果新内容放进参考文件。
