# 02 — evidence 并进 decision-rules，开场注入整份正文

**Blocked by**：01
**设计冻结**：不涉及 UI

## 要建什么

`evidence` 的内容并进 `decision-rules`，`evidence` 整个目录删掉，不留重定向的空 skill。

- 「证据是什么」「整体风格」「配什么图」进 `decision-rules` 正文；`evidence` 的两份参考（UI 流程图、动图）进 `decision-rules` 自己的参考文件。
- 合并后 `decision-rules` 仍可被模型调用；description 照 `writing-for-agents` 的调用方式写：每个分支一个触发词，同义词合并（要能被「写证据、截图配图、拼流程图、录动图」触发）。
- 开场注入：会话开场注入的是 `decision-rules` 的整份正文（注入命令读插件里 decision-rules 的正文，不用改命令），所以新开会话的注入里同时有「依据只认三种」和「证据是什么」两节。注入头一句说明这段是什么（现在写着「针对有 spec 的工作」那句）照新内容改。
- 全插件里引用 `idea-loop:evidence` 的文件（约 20 个：skill、参考文件、agent 定义、插件 README）只改指针，指向 `decision-rules` 的对应一节，不改别的句子。
- 插件 `README.md` 的 skill 清单去掉 evidence。
- 合并后的 `decision-rules` 本身照重写核对表重写，主体不超过 4500。

改的文件：`decision-rules`、`evidence`（删）；全插件中引用 evidence 的 skill、参考文件、agent 定义；插件 README；开场注入相关的文档测试。

## 验收标准

- [ ] 每份改到的 SKILL.md、agent 定义主体不超过 4500 字（量法照仓库 `AGENTS.md`「标准 plugin 目录结构」的要点），交回里贴每份的改前、改后字数。 ⏭ 延后 → 05（pr 4528）、07（to-spec 4717）、11（ui-reviewer 6644）：这三份这张只改了一处指针，改前就超 4500，整份重写归它们自己的工单；decision-rules 改前 1396、改后 3025，其余改到的 5 份都在线内
- [x] 改到的文件里，决策历史的搜索（日期、「人定」「原话」「依据：」）没有命中；留下的每处在交回里写一行为什么留（例子里的日期、`captured:` 这类格式说明）。
- [x] 改到的文件里，行内的 `gh` / `git` 命令只剩适配层和标了「坑」的行；能用 `dyna` 子命令的都改成了 `dyna <模块> <命令>`，命令名以插件命令行登记表（当前最低版本那份）为准，`dyna-scan` 测试绿。
- [x] 照 `writing-for-agents` 的「重写核对表」逐条过（01 号工单写进去的那张），交回的「杠杆」一行写清每份文件对的是哪几条。
- [x] 改到的文件对应的文档测试同步改：守硬规矩的断言跟着内容挪到新位置；钉决策历史或已删措辞的断言删掉；钉命令原文的改钉结果约束。全量测试绿。
- [x] 不改任何流程的行为：只改写法和位置。重写中发现行为本身有问题的，在交回的 `found` 里写一行，不在这张工单里改。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。 ⏭ 延后 → 05、07、11：同上，三份超线的正文要挪分支进参考文件，只有整份重写才做得对
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `decision-evidence-principles-doc`、`decision-rules-who-decides-doc` 测试：钉 decision-rules 与 evidence 里规矩的位置，合并后要指向新位置。
- `session-inject-doc`、`hooks-config` 测试：开场注入的内容与命令。
- `knowledge-base-landing-doc`、`project-directory-wording-doc` 测试：读 decision-rules 正文的措辞。
