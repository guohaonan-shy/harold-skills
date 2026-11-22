# 02 — 调度改成一台设备一个 dispatch-home，跨项目按整台设备的名额派

**Blocked by**：01（命令行能列出全部项目、读出整台设备的调度表）
**设计冻结**：不涉及 UI

## 要建什么

人在任何目录敲一次 `/idea-loop:issue-dispatch`，就在 home 里起好一个设备级的调度定时任务 `dispatch-home`（每 30 分钟一轮，cron `7,37 * * * *`）；每一轮对项目清单里每个搬进了 home、没写进「不调度」的项目对账、取候选，按整台设备的名额合在一起交出。改的都是给调度会话和 setup 读的文字，行为如下：

- **一轮怎么走**（调度 skill）：读 `dyna home dispatch` 和 `dyna home projects`；照「会话管理」数三个分组里标题是「<仓库名>#<号> …」的会话：triage、in-progress 各开着几个（任何仓库名都算，整台设备一个数），同号会话按仓库名分开记；逐个项目（按清单顺序，跳过不调度的）：跑不了的（不在 home、本地 clone 不存在、clone 不在默认分支、快进拉取失败）记一行进汇报跳过；对账、列没有会话的 issue、取这一状态的全部候选并去掉本项目的同号会话。这一轮能开几个 = min(每轮最多新开, 这一状态的上限 − 这一状态开着的个数)，上限「不设」就是每轮最多新开；≤ 0 不开。所有项目的候选合成一张表，按现行候选顺序（指派给本人的在前，P0 → P2 → 没有优先级，同级在这一状态停留久的在前）取前这么多个。交出的做法不变，`<主 checkout>` 换成 issue 所在项目的本地 clone，`<docs>` 是那个项目在 home 里的知识库目录。空档只对账。早上汇总读 `dispatch-home` 的上次成功运行，记录文件仍按项目分开，汇总按项目分节。汇报合成一份（时段、各状态开着几个 / 上限、交出的带仓库名、每个项目的对账和要人处理的事），推送只发一句合计。
- **前提改写**：不再要求「工作目录是主 checkout」。调度会话在 home 里只读，只在起调度时提交 `DISPATCH.md`；对各项目的 clone 只做快进拉取和建 worktree，不切分支、不改文件。
- **起调度**：在 home 建（已有就更新）`dispatch-home`，标题 `issue 调度`，prompt `/idea-loop:issue-dispatch`；home 里没有 `DISPATCH.md` 就照默认值建一份并提交到 home；已有项目的 issue 跟踪说明里有「调度」一节的，先把改前改后给人看，人同意后并进 `DISPATCH.md`，再删掉项目里那一节；列出已有的 `dispatch-<仓库名>` 任务逐个停用（只停用不删），汇报里列出停了哪几个；然后立刻做第一轮。
- **调度会话用 Sonnet、思考强度 medium**：在运行环境能钉住的地方钉住，钉不住的部分在起调度的汇报里告诉人怎么手动设（见 PR 里的决定题，以人的回答为准）。
- **运行环境文字**：桌面端和 magi 的「调度」三处、「定时任务」里「要在目标仓库的主 checkout 里建」那句，改成上面的做法：任务 id `dispatch-home`、cron `7,37 * * * *`、工作目录 home；数会话改成按状态、整台设备、同号只认本项目仓库名；分组名改从 `dyna home dispatch` 取。magi 同样一个 `dispatch-home`，`magi cron` 的工作目录是 home，`magi sessions start --cwd` 照旧是 issue 的 worktree。
- **setup**：issue 跟踪说明的两份模板删掉「调度」一节；setup 的调度一步改成「这台设备有没有 `dispatch-home`」，有就报，没有就问人建不建（建法同起调度）；汇报里的调度一行改成 `dispatch-home`。
- **插件 README** 的调度、setup 两行跟着改。

## 验收标准

- [ ] 调度 skill、桌面端和 magi 的「调度」、setup 的调度参考与 issue 跟踪模板里，不再出现 `dispatch-<仓库名>`（停用旧任务那句除外）、「工作目录是主 checkout」、「issue 跟踪说明的『调度』表」、「最近 2 小时有活动」；出现 `dispatch-home`、`DISPATCH.md`、`7,37 * * * *`、按状态的上限、同号只认本项目仓库名、`dyna home dispatch`、`dyna home projects`。文档测试（照现有调度文档测试的写法）把这些断言钉住并通过。
- [ ] 调度 skill 写明「这一轮能开几个」的算式、跨项目合成一张表按现行顺序取、跑不了的项目跳过并写进汇报、起调度时停用旧任务并合并旧「调度」节前先给人看改前改后。
- [ ] 两份 issue 跟踪模板里没有「调度」一节；`ISSUE_TRACKER.md` 的「调度」由起调度时并进 `DISPATCH.md` 的说法写在调度 skill 里。
- [ ] 调度 skill 写的每条 `dyna` 命令和参数在 01 存的新版本登记表里都有。
- [ ] `node --test idea-loop/scripts/*.test.mjs` 全过（改了旧的调度文档测试的，改动说明它对应的新规则）。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `idea-loop/scripts/dispatch-by-period-doc.test.mjs`：现行调度文字的断言，大部分要跟着新规则改，改丢一条会让旧规则悄悄留下。
- `idea-loop/scripts/runtime-data-doc.test.mjs`：断言运行环境数据里的调度三处，任务 id 改了它会红。
- `idea-loop/scripts/issue-group-skills.test.mjs`：断言调度会话读 `issues queues`。
- `idea-loop/scripts/issue-session-night-mode-doc.test.mjs`：夜间模式与调度的衔接。
