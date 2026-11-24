# 03 — 插件不再带运行环境说明，setup 照模板生成；升版本

**Blocked by**：01、02
**设计冻结**：不涉及 UI

## 要建什么

插件现在自带桌面端（加它的细节文件「假麦克风」那份）和 magi 两份运行环境说明。改完以后插件的运行环境目录只剩能力清单和能力模板，每台机器的说明由 setup 照模板生成、放在人选的地方。

- **删插件里的说明**：删掉插件运行环境目录下的 `claude-desktop.md`、`claude-desktop-mic.md`、`magi.md`。
- **这台 Mac 搬进 home**：删之前，把桌面端那两份拷进 home 的 `runtime/`；桌面端说明里「会话管理」的「分组」「怎么数开着的会话」两处，读的字段改成 `states`（02 改的名）；调度记录写到的会话 id 字段改成 `sessionId`（如说明里提到）。再在 home 的 `runtime/selected` 写 `claude-desktop`（桌面端没有标记，靠它认）。用 `dyna home commit` 提交。magi 那份不进这台 Mac 的 home。
- **setup 的「运行环境」参考**（`setup/references/runtime-env.md`）：
  - 第 1 步「列出认识的环境」改读三处（项目主 checkout 的 `.idea-loop/runtime/`、home 的 `runtime/`、`~/.idea-loop/runtime/`），不再读插件；「同名是本机覆盖」的说法删掉。`selected` 写进人选的那一处的 `runtime/`（推荐 home）。
  - 第 2 步「照模板生成」的触发条件改成：三处都没有这台机器当前运行环境的说明时就做（不再只在人说要用的环境不在列表里时）。输入：AI 读能力模板，再查当前运行环境（会话里有哪些工具、有哪些环境变量、命令的 help），人给了文档就一起读；不再读插件里的说明做格式样例。生成前问人放哪（项目 / home / 用户根目录，推荐 home），逐节给人批，写进去跑格式检查。写进项目的，把 `.idea-loop/` 加进那个仓库的 `info/exclude`（说明是这台机器的，不提交）。写进 home 的用 `dyna home commit`。
  - 正文和 setup 的 `SKILL.md` 只改讲运行环境的那几句；setup 的 `SKILL.md` 正文有另一个会话（#420）在大改，这里尽量不动它，要动只动讲运行环境的一两句。
- **README 与帮助**：idea-loop 的 README 里讲「插件自带两份说明」「本机覆盖」「desktopSessionId」的地方，改成三处查找、setup 生成、`sessionId`。home 目录地图那份参考（wiki-conventions 的 `home-maps.md`）讲本机覆盖的也改。
- **读插件说明的检查**：仓库里直接读插件运行环境说明的检查脚本（开场注入、调度两份、Linear、retro 回放、运行环境数据、SEO 连接器工具、setup home 等），断言某个运行环境具体做法的断言删掉（那些内容不再归插件）；要一份说明才能跑的（开场注入）改用测试自己写的样例说明。加一条检查：插件运行环境目录下只有 `capabilities.md`。
- **目标用例**：照 `idea-loop/evals/retro/` 的用例格式，从 spec 的 User Story 5 写一个目标用例：空 home 的桌面端会话跑 setup，是否生成了一份过格式检查的说明、并问了人放哪。写好，大用例标明待跑，由编排者跑。
- **版本**：dyna 版本在集成分支当时的版本（现在 0.0.14）上升一档，用新编的二进制重存登记表 `dyna/registry/<新版本>.json`；插件的 `dyna-version` 下限提到新版本；插件 `plugin.json` 的 `version` 按 `REVIEW.md`「额外要求」的档位升。
- **给 magi 那台机器的命令**：在交回里写一条命令，从删除之前的提交取出 `magi.md` 放进那台机器 home 的 `runtime/`（编排者写进 PR 的「要你做的事」）。

## 验收标准

- [ ] 插件运行环境目录下只有 `capabilities.md`，有一条检查守着。
- [ ] 这台 Mac 的 home `runtime/` 里有 `claude-desktop.md`、`claude-desktop-mic.md`、`selected`（写 `claude-desktop`），已 `dyna home commit`；新编的 dyna 在这台 Mac 上 `dyna runtime name` 打印 `claude-desktop`，`dyna runtime check` 对 home 那份全过；那份里读的是 `states`。
- [ ] setup 的「运行环境」参考按上面改完：三处、触发条件、问放哪、`info/exclude`；没有「本机覆盖」的说法。
- [ ] README、home 目录地图参考里没有「插件自带两份说明」「本机覆盖」「desktopSessionId」。
- [ ] 仓库全部检查（`REVIEW.md` 的验证命令）全过，包括 `cd dyna && go test ./...` 和 `node --test` 那一组。
- [ ] dyna 版本升了一档，登记表已存、跟命令树一致；`dyna-version` 下限是新版本；`plugin.json` 版本已升。
- [ ] 交回里有给 magi 那台机器的取回命令。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `idea-loop/scripts/session-start-inject.test.mjs`：开场注入的端到端检查，说明来源变了，最容易坏。
- `idea-loop/scripts/runtime-data-doc.test.mjs`、`dispatch-one-per-device-doc.test.mjs`、`dispatch-by-period-doc.test.mjs`：直接读插件里的说明。
- `scripts/dyna-version.test.mjs`：守着 dyna 版本和登记表。
- `idea-loop/scripts/dyna-launcher.test.mjs`：`dyna-version` 下限提了，插件小脚本要认新版本。
