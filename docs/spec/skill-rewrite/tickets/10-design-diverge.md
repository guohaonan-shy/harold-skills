# 10 — 设计发散与调研逐份重写

**Blocked by**：02、03
**设计冻结**：不涉及 UI

## 要建什么

这张工单对下面每份文件做同一件事：照 `writing-for-agents` 的「重写核对表」逐份重写。改完，agent 读主文件只读到每次都走的步骤和每步的完成条件；只有部分运行才走到的分支在这个 skill 自己的参考文件里，主文件留一行指针写明什么条件下去读；没有日期、人的原话这类决策历史（要改变行为的理由留理由本身）；共享的规矩只指向它的归属处（`decision-rules`、`wiki-conventions`、`issues`、`pr`、`tdd`、`dyna runtime show <能力>`、`writing-for-agents`），不转述；步骤写要拿到什么，命令只写 `dyna` 和查不到的坑。每份主体不超过 4500 字，给以后加分支留出余量。skill 指向的参考文件一起量、一起剪。

设计收敛由人定、评委是顾问这些行为照留。

改的文件：`uiux-imagine`、`uiux-refine`、`uiux-research`、`design-change-sync` 四个 skill 及其参考文件；uiux-imaginer、designer、uiux-researcher、ui-master、results-analyst 五份 agent 定义。

## 验收标准

- [x] 每份改到的 SKILL.md、agent 定义主体不超过 4500 字（量法照仓库 `AGENTS.md`「标准 plugin 目录结构」的要点），交回里贴每份的改前、改后字数。
- [x] 改到的文件里，决策历史的搜索（日期、「人定」「原话」「依据：」）没有命中；留下的每处在交回里写一行为什么留（例子里的日期、`captured:` 这类格式说明）。
- [x] 改到的文件里，行内的 `gh` / `git` 命令只剩适配层和标了「坑」的行；能用 `dyna` 子命令的都改成了 `dyna <模块> <命令>`，命令名以插件命令行登记表（当前最低版本那份）为准，`dyna-scan` 测试绿。
- [x] 照 `writing-for-agents` 的「重写核对表」逐条过（01 号工单写进去的那张），交回的「杠杆」一行写清每份文件对的是哪几条。
- [x] 改到的文件对应的文档测试同步改：守硬规矩的断言跟着内容挪到新位置；钉决策历史或已删措辞的断言删掉；钉命令原文的改钉结果约束。全量测试绿。
- [x] 不改任何流程的行为：只改写法和位置。重写中发现行为本身有问题的，在交回的 `found` 里写一行，不在这张工单里改。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `refine-round-flow-doc`、`after-freeze-exit-doc`、`research-light-doc`、`research-baseline`、`ui-master-doc`、`design-change-final-version-doc`、`pending-design-doc`、`seo-results-report-doc`、`skill-private-references` 测试。
