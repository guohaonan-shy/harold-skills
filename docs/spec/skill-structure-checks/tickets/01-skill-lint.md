# 01 — 写 skill 或 agent 定义时当场拦住超线和行内命令

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

一条新命令 `dyna spec skill-lint`，把「主体字数线 4500」和「idea-loop 里不写行内 gh / git 命令」变成写文件时就会响的检查，并让它成为字数线唯一的出处。

- **写文件时**：idea-loop 插件的 hooks 配置在 PostToolUse（Write / Edit）上多一条 `dyna spec skill-lint --hook`。它从标准输入读事件里被写的文件：在范围内且有问题就退出 2、报错写到 stderr；不在范围内、干净、读不到事件都静默退出 0。回话方式照现有的设计画布 hook（`dyna design lint --hook`）。
- **范围**：被写的文件是 `skills/**/SKILL.md` 或 `agents/*.md`（认法跟 `dyna spec skill-edit` 的同一个集合，但只取 SKILL.md 和 agent 定义，不含参考文件），且位于 (a) `dyna home` 认的 home 目录下，或 (b) 过渡期：往上能找到带 `.claude-plugin/plugin.json` 的插件根。其余静默放行。
- **字数线**：主体（去掉 frontmatter，UTF-8 字符数，量法同现有 skill-doc）超过 4500 报：`<文件> 主体 <n> 字，线 4500。调 idea-loop:writing-for-agents 精简这份文件`。报错里不写「挪进 references」之类具体修法。
- **行内命令绊线**：只对 idea-loop 插件的文件（插件根的 plugin.json 名字是 idea-loop）。正文里行内代码（反引号）以 `gh <子命令>` 或 `git <子命令>` 开头的，报 `<文件>:<行> 写了行内命令 <命令>。调 idea-loop:writing-for-agents，照它的命令归类改写；确实是坑就在同一行标「坑」`。放行：同一行带「坑」字；frontmatter 的 `allowed-tools` 行；适配层文件。适配层放行清单写在命令代码里，逐个列文件并写一句理由——以当前树为准，至少包括 issues 的 GitHub 做法参考文件、setup 的 issue-tracker / preflight-table / development 模板。判据参考现有 `no-project-leak.test.mjs`、`runtime-tripwire.test.mjs`。`dyna …` 不扫。注意 agent 定义也是插件文件，绊线同样适用；只有 SKILL.md 与 agent 定义被扫（参考文件不在 lint 范围）。
- **不带 --hook**：`dyna spec skill-lint <文件>...` 查给定文件，列完全部问题退出 1，干净退出 0。`--changed <base-ref>` 只查 `<base-ref>...HEAD` 里改到的（没删掉的）、在范围内的文件。
- **版本不对时**：照 idea-loop-cli 的约定 hook 不拦，只在 stderr 留一行（看现有 hook 命令怎么处理）。
- **线只写一处**：`dyna test skill-doc` 去掉量字数那条（`MaxBodyChars` 删掉），只留小节指针的核对；它的描述文字一起改。插件里 `*-slim-doc.test.mjs` 以及 design-archive / cover / og 等 skill-doc 文档测试里**量主体字数的断言**删掉（逐个 grep，以当前树为准），其余断言不动。
- **说法**：仓库 `AGENTS.md`（目录树注释和「要点」第一条）、`REVIEW.md`「额外要求」里的「< 5000」改成「线 4500，`dyna spec skill-lint` 在写文件时和 review 时核」；`REVIEW.md`「验证命令」表多一行 `dyna spec skill-lint --changed origin/<基准分支>`（review 每轮对这个 PR 改到的文件跑；用 `cd dyna && go run ./cmd/dyna spec skill-lint …` 或已装的 dyna，照表里其它 dyna 行的写法）。
- **命令登记表**：新命令登记，调用方标 hook（`--hook`）与 review；dyna 版本 0.0.6 → 0.0.7，存 `dyna/registry/0.0.7.json`（做法照 `DEVELOPMENT.md`「命令行 dyna」；版本守卫的基准用 `DYNA_VERSION_BASE=origin/release/idea-loop-0.2.0`）。`idea-loop/dyna-version` 的下限**不动**（新版未发布，发不发由人定）；如果 `scripts/dyna-scan.test.mjs` 因 hooks 里用到了未发布版本的命令而红，停下交回说明，不自行改下限。
- 插件 README 同步提到新 hook。

## 验收标准

- [ ] go 单元/命令测试：夹具 idea-loop 插件根里主体 4501 字的 SKILL.md，包成 PostToolUse 事件喂 `--hook` → 退出 2，stderr 含文件、4501、线 4500、`idea-loop:writing-for-agents`，不含「references」；改到 4500 字 → 静默退出 0。
- [ ] 同样 4501 字的文件放在夹具 home 下某项目的 `skills/x/SKILL.md` → 退出 2；放在 home 外、往上没有插件根的 `.claude/skills/x/SKILL.md` → 静默退出 0；agent 定义同理被认。
- [ ] 夹具 idea-loop SKILL.md 正文一行写 ``gh issue view 1 --comments`` → 退出 2，报文件和行号；同一行加「坑：…」→ 退出 0；文件是放行清单里的适配层 → 退出 0；别的插件（plugin.json 名字不是 idea-loop）里同样一行 → 不报。
- [ ] `--changed <base>`：分支只改了一份超线文件、另有一份超线但没改 → 只报改到的那份，退出 1；干净退出 0。不带 --hook 的给定文件模式列完全部问题退出 1。
- [ ] 本分支 `dyna spec skill-lint idea-loop/skills/*/*/SKILL.md idea-loop/agents/*.md` 退出 0（存量都在线内、剩下的行内命令都在适配层或标了坑）；若有不在线内或未放行的，交回列出，不改那些文件的规则内容以外的东西。
- [ ] **先在历史错误上见红**：在 #340 之前的某个提交（如 implement 主体 9589 字的版本，从 git 历史里取那份 SKILL.md）上跑 `skill-lint`，报超线；交回写出命令和输出。
- [ ] hooks 配置多一条 PostToolUse（Write|Edit）的 `dyna spec skill-lint --hook`，`hooks-config.test.mjs` 之类的现有测试跟着更新并通过。
- [ ] `dyna test skill-doc` 不再量字数；skilldoc 里不再有 `MaxBodyChars`；文档测试里量主体字数的断言已删，其余断言保留；全量（`node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'`、`cd dyna && go test ./...`、`go vet`、`gofmt -l .`）绿。
- [ ] `AGENTS.md`、`REVIEW.md` 不再出现「< 5000」，字数线说法是 4500 + `dyna spec skill-lint`；`REVIEW.md` 验证命令表有 `skill-lint --changed` 一行。
- [ ] dyna 版本 0.0.7、登记表 0.0.7.json 已存，`DYNA_VERSION_BASE=origin/release/idea-loop-0.2.0 node --test scripts/dyna-version.test.mjs` 绿。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `dyna/internal/testcmd` 的测试：skill-doc 去掉字数后，指针核对不能坏。
- `dyna/internal/design/lint` 的 hook 测试：新 hook 照它的写法，别碰坏它。
- `idea-loop/scripts/hooks-config.test.mjs`：hooks.json 多一行。
- `idea-loop/scripts/*-slim-doc.test.mjs`、`design-archive-skill-doc`、`cover-skill-doc`、`og-skill-doc`：删字数断言后其余断言仍成立。
- `scripts/dyna-version.test.mjs`、`scripts/dyna-scan.test.mjs`：版本与登记表。
