# 01 — magi 调度建 worktree 时按分支在哪分三种情况

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
magi 运行环境参考里「调度 · 怎么交出 issue」的第 1 步「建 worktree」，现在 issue 已有分支时一律写 `-b <那条分支> origin/<那条分支>`：本地已有同名分支（白天 triage 会话留下、只清了工作区）时 git 报「分支已存在」，这个 issue 在 magi 下每一轮都开不出会话。

改完：magi 调度照这一步做，三种情况都一次建成 worktree——本地有这条分支就直接接上（不带 `-b`），只有远端有就从远端建跟踪分支（`--track -b`），两处都没有才从基准分支新建。写法照桌面端运行环境参考（claude-desktop）同一步现有的三种情况：先说明路径和分支名怎么取，再用 `show-ref` 查本地、查远端，三种情况各一条命令；「路径已经存在、就是这条分支的 worktree：直接用」保留。这一步之外的 magi 内容（开会话、`--cap`、清理）一字不动。

同时把调度这一节的文档测试补上：照桌面端那条「已有分支的 issue 接上分支、不用 -b 新建」的测试，给 magi 加同样的一条；原来钉着 magi 旧写法整条 `-b issue/<号>-<slug>` 命令的断言改成钉新写法（只有「两处都没有」那条从基准分支建）。idea-loop 插件版本升一档 patch，README 若提到这一步就同步。

## 验收标准
- [ ] magi 参考的第 1 步有三条 `worktree add` 命令：本地有 / 只有远端有 / 两处都没有，本地有那条不带 `-b`，只有「两处都没有」那条用基准分支。
- [ ] 文档测试新加的 magi 那条先在旧文本上见红，改完见绿；全量测试 `node --test '*/scripts/*.test.mjs' 'scripts/*.test.mjs'` 全绿。
- [ ] 在临时 git 仓库里，三种情况各照新命令跑一次 `git worktree add`，都退出码 0、worktree 在对应分支上；本地已有分支的那种照旧命令跑报「already exists」。
- [ ] idea-loop `plugin.json` 的 `version` 从 main 当前版本升一档 patch。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归
- `idea-loop/scripts/dispatch-by-period-doc.test.mjs` 里 magi 的「only what to hand out changes」：钉着 magi 开会话与建 worktree 的命令，这次要改它的一条断言，其余断言必须仍绿。
- `idea-loop/scripts/runtime-skill-doc.test.mjs`：查每份运行环境参考的能力小节与清单一一对应，改 magi.md 有可能碰坏小节结构。
