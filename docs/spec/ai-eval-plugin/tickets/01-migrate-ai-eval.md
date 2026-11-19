# 01 — ai-eval 迁进 harold-skills 并去掉项目信息

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

任何项目都能从 harold-skills 的 marketplace 装上 `ai-eval` plugin，六个 skill 跟原来用法一样，项目的事实只从项目自己的 `EVAL.md` 读。

来源：私有仓库 Tofelair（本机 `~/projects/TOFEL-demo`，GitHub `guohaonan-shy/Tofelair`）主分支提交 `be895871` 下的 `.claude/plugins/ai-eval/`：6 个 skill、插件级参考 `judge-format` / `judge-prompt`、9 个脚本连同测试、一个 skill 级参考。只读那个仓库，不改它。用 `git show be895871:<路径>` 取文件，不用它的工作区（工作区有未提交改动）。

要做的事：
- 在仓库顶层建 `ai-eval/` plugin，内容原样迁过来；`plugin.json` 版本 `0.1.0`，description 去掉「Beta, living in-repo…」那句，改成说它住在 harold-skills。
- 去项目信息：写死的项目路径和命令（`toeflair-app/...`、`uv run python -m evals.*` 一类，约 5 处）改成「读 `EVAL.md` 对应小节」；`EVAL.md` 模板里还没有那一项的，加进 eval-setup 的模板对应小节。领域词换通用说法：「学生」→「用户」，「作文」「托福」→「样本」「用户的输入」，范例改成任何项目读得懂的。脚本测试夹具里的项目词也一起换。
- 防泄漏测试：照 idea-loop 的防泄漏测试做一份放在 `ai-eval/scripts/`，扫 `skills/`、`references/`、`scripts/`（扫脚本时排除测试文件自己）、`README.md`；提示词至少有 toeflair/tofelair/toefl、`toeflair-app`、托福、作文、学生。
- 写 `ai-eval/README.md`：介绍、安装、每个 skill 一段用法示例、「依赖」一节（PostHog 存样本和 scorer、Codex 当判官，作为声明的依赖，不抽象成可替换后端）。
- 仓库根：`marketplace.json` 加 `ai-eval` 一项（`source: ./ai-eval`）；`AGENTS.md`「当前 plugins」加一行；`AGENTS.md`「issue 分类」加父类 `ai-eval`（ai-eval plugin 的 issue）。根 README（中英两份）如有 plugin 列表也加一行。

## 验收标准
- [x] `ai-eval/` 下有 7 个文件夹里的 6 个 skill（eval-baseline、eval-judge、eval-metrics-review、eval-run、eval-samples、eval-setup）、2 份插件级参考、9 个脚本和它们的测试，`plugin.json` 版本 0.1.0
- [x] `grep -rniE 'toeflair|tofelair|toefl|托福|作文|学生' ai-eval` 只命中防泄漏测试自己的提示词表
- [x] 防泄漏测试在 `ai-eval/skills/` 某个文件里临时写进 `toeflair-app` 时变红并点名那个文件，删掉后变绿
- [x] 仓库全量测试 `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'` 全过（迁过来的 9 个脚本测试包含在内）
- [x] marketplace.json 合法 JSON、含 `ai-eval`；`AGENTS.md` 的「当前 plugins」和「issue 分类」各有 ai-eval 一行
- [x] README 有安装、每个 skill 的用法示例和「依赖」一节
- [x] PR 描述「参考」里写了迁移基准提交 `be895871`（由编排者写，执行方在交回里给出它）
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。
- [x] review 第 1 轮 S3（2026-11-20）：eval-run、eval-baseline 里不留来源项目的存储目录层级（基线产物在存储里的目录）和代码常量名（登记用户任务的常量），改成指向 EVAL.md 对应小节；防泄漏测试的提示词表加上这两样
- [x] review 第 1 轮 C1（2026-11-20）：eval-judge、eval-run、eval-metrics-review 的 description 只写它是什么和触发词（AGENTS.md「description 只做路由」：流程、产物格式、模型名不写），原有的触发说法都保留

## 选中的存量回归
- `scripts/plugin-version.test.mjs`：新 plugin 目录要被版本检查认得，不能因为 main 上没有它的 plugin.json 而误报。
- `idea-loop/scripts/no-project-leak.test.mjs`：照它新写的那份不能影响它自己的扫描范围。
