# 12 — SEO 合并：seo-brief 进 seo-writing、link-prospecting 进 seo-outreach，seo-coach 重写

**Blocked by**：08
**设计冻结**：不涉及 UI

## 要建什么

- `seo-brief` 并进 `seo-writing`（名字留 seo-writing）：写 brief 成为一个分支，进 `seo-writing` 自己的参考文件，主文件一行指针；description 加「brief」触发词。triage 起草 SEO spec 时调 `seo-writing` 的 brief 分支。`seo-brief` 目录删掉，引用它的文件改指针。新开页先读站内同主题文章、brief 出图这些行为照留。
- `link-prospecting` 并进 `seo-outreach`：找候选站点成为一个分支，进 `seo-outreach` 自己的参考文件；`link-prospecting` 目录删掉，引用它的文件改指针。
- `seo-coach` 不合，独立保留、模型可调，照重写核对表重写；发现项目没配 SEO 时让人跑 `/idea-loop:setup`（它的 SEO 模块）。
- SEO 的 README 与插件 README 的 skill 清单同步。

这张工单对下面每份文件做同一件事：照 `writing-for-agents` 的「重写核对表」逐份重写。改完，agent 读主文件只读到每次都走的步骤和每步的完成条件；只有部分运行才走到的分支在这个 skill 自己的参考文件里，主文件留一行指针写明什么条件下去读；没有日期、人的原话这类决策历史（要改变行为的理由留理由本身）；共享的规矩只指向它的归属处（`decision-rules`、`wiki-conventions`、`issues`、`pr`、`tdd`、`dyna runtime show <能力>`、`writing-for-agents`），不转述；步骤写要拿到什么，命令只写 `dyna` 和查不到的坑。每份主体不超过 4500 字，给以后加分支留出余量。skill 指向的参考文件一起量、一起剪。

改的文件：`seo-writing`、`seo-brief`（删）、`seo-outreach`、`link-prospecting`（删）、`seo-coach` 及其参考文件；引用被删 skill 的文件；SEO 的 README、插件 README。

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

- `seo-brief-angle-doc`、`seo-brief-images-doc`、`seo-writing-loop-doc`、`seo-outreach-doc`、`seo-md-writing-images`、`seo-blog-workflow-readme-doc`、`seo-skill-descriptions-route-only-doc`、`seo-method-skills-no-inference-doc`、`seo-spec-recommend-doc` 测试。
- [ ] review 第 1 轮 C2（2026-11-20）：seo-coach 讲数据来源那一步，结尾补一句完成条件（writing-for-agents：「每一步都以一个**完成条件**结尾」）
