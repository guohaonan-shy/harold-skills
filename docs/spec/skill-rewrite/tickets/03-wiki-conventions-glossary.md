# 03 — glossary 并进 wiki-conventions

**Blocked by**：01
**设计冻结**：不涉及 UI

## 要建什么

`glossary` 的内容并进 `wiki-conventions`，`glossary` 整个目录删掉。

- 术语表收什么、格式、谁能写、怎么读进 `wiki-conventions` 自己的一份参考文件；主文件留一行指针，写明碰术语表（新增、改名、订正术语，给产出里的领域概念起名）时去读。
- `wiki-conventions` 的 description 加「术语表」这个触发词，其余照调用方式写。
- 术语表的格式检查（写文件后自动跑的那条）不动。
- 引用 `idea-loop:glossary` 的 4 个文件只改指针。插件 README 的 skill 清单同步。
- `wiki-conventions` 本身照重写核对表重写（现在 4752，压到 4500 内）。

改的文件：`wiki-conventions`、`glossary`（删）；引用 glossary 的 4 个文件；插件 README。

## 验收标准

- [ ] 每份改到的 SKILL.md、agent 定义主体不超过 4500 字（量法照仓库 `AGENTS.md`「标准 plugin 目录结构」的要点），交回里贴每份的改前、改后字数。
- [ ] 改到的文件里，决策历史的搜索（日期、「人定」「原话」「依据：」）没有命中；留下的每处在交回里写一行为什么留（例子里的日期、`captured:` 这类格式说明）。
- [ ] 改到的文件里，行内的 `gh` / `git` 命令只剩适配层和标了「坑」的行；能用 `dyna` 子命令的都改成了 `dyna <模块> <命令>`，命令名以插件命令行登记表（当前最低版本那份）为准，`dyna-scan` 测试绿。
- [ ] 照 `writing-for-agents` 的「重写核对表」逐条过（01 号工单写进去的那张），交回的「杠杆」一行写清每份文件对的是哪几条。
- [ ] 改到的文件对应的文档测试同步改：守硬规矩的断言跟着内容挪到新位置；钉决策历史或已删措辞的断言删掉；钉命令原文的改钉结果约束。全量测试绿。
- [ ] 不改任何流程的行为：只改写法和位置。重写中发现行为本身有问题的，在交回的 `found` 里写一行，不在这张工单里改。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `wiki-conventions-skill-doc`、`knowledge-base-landing-doc`、`project-directory-wording-doc`、`readme-project-directory-doc` 测试：wiki-conventions 的节名和措辞。
- `seo-glossary-terms-doc` 测试：SEO 术语与术语表的关系。
