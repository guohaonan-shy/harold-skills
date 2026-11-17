# 01 — 知识库约定 skill 主体缩到 5000 字以下，由文档测试守住

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

任何 skill 或 agent 调起知识库约定 skill（`idea-loop:wiki-conventions`），读到的主体少于 5000 字（量法：去掉 frontmatter 后按 UTF-8 字符数），只含每个调用方都要的约定；只有部分调用方用到的细节——设计目录两层的生命周期、`.tmp/` 每个子目录收什么和什么时候删、各层 index.md 的格式与特例、ADR 按小节取代——各挪进这个 skill 自己的一份参考文件，主体对应那一节末尾一行指过去。

规则一条不改：路径、字段、闭集、生命周期都不动。主体现有的每个二级标题都保留（别处按「skill 名 + 节名」指过来，节名就是契约）。被挪走的内容如果有调用方专门指它（设计档案 skill 指「目录」看 `tmp/` 的生命周期、dreaming 的对账参考指「frontmatter」看 ADR 按小节取代），同一提交里改指到新参考文件里的标题。和设计档案 skill 重复的两句（`prod/` 只走归档脚本、旧 `design/<spec-slug>/` 目录只打提示）以及五种 `design-*` 类型的说明缩成一句指向设计档案 skill 的「图的实体」。

一个文档测试守住两件事：主体少于 5000 字；idea-loop 里所有写「`idea-loop:wiki-conventions` 的「X」」的地方，X 都是这个 skill 的 SKILL.md 或其参考文件里的标题。优先把设计档案 skill 已有的同类文档测试抽成按 skill 参数化、两者共用，而不是复制一份。

idea-loop 插件版本升一个 patch；插件 README 的文件树里补上新的参考文件。

## 验收标准

- [ ] 在改动前的 SKILL.md 上跑新测试，主体字数那一条红（7854 ≥ 5000）
- [ ] 改完后新测试全绿：主体 < 5000 字；所有指名的节都存在
- [ ] 已有文档测试全绿：知识库落地一节（`knowledge-base-landing-doc`）、`status` 闭集与 `issues:`（`issue-model-tripwire`）、「按风险分」「`dreaming` 只问两类」（`dreaming-autonomous-doc`）、设计档案 skill 的同类测试
- [ ] 改前改后逐句对照：每条规则在主体或参考文件里仍能找到；删掉的句子逐条写明依据（设计档案 skill 有单一事实来源，或判为空操作），交回里列出
- [ ] `plugin.json` 版本升一个 patch，README 文件树补上新参考文件

## 选中的存量回归

- `knowledge-base-landing-doc` 测试：守「知识库落地」一节的原文，挪动主体时最容易误删。
- `issue-model-tripwire` 测试：读 frontmatter 一节的 `status` 闭集表。
- `dreaming-autonomous-doc` 测试：读「人机分工」的两句原话。
- `design-archive-skill-doc` 测试：抽成共用后要确认设计档案那份照旧通过。
- `no-project-leak` 测试：新参考文件里不能出现真实项目名。
