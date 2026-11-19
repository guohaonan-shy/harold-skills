# 01 — idea-loop 发的评论改用隐藏标记，不再带机器开头和署名

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

现状：idea-loop 的 issue 脚本发出的每条 GitHub issue 评论（翻状态带的评论、贴证据的评论、迁移时补的评论）都以「🤖 idea-loop：」开头，脚本也靠这个开头认出自己的评论（调度判一个 backlog issue 是不是「还要你补」）；合并时贴的 PR review 归档评论，没配 GitHub App 时每条开头多一行「🤖 由 Claude 代发（……不是本人所写）」。多个 skill、agent 定义和参考文件让 agent「读最近一条『🤖 idea-loop：』开头的评论」接上次停在哪。

做完后：

1. 脚本发的每条 issue 评论，正文最前面单独一行是 GitHub 不显示的 HTML 注释标记 `<!-- idea-loop -->`，后面直接是正文，不再拼旧前缀。传进来的文字已经以旧前缀开头的，先去掉旧前缀再加标记；已经带标记的不重复加。标记字符串在 issue 脚本里定义一处，替换原来的前缀常量，别的脚本和测试从那里引。
2. 「是不是 idea-loop 发的评论」由一个函数判断：含标记，或以旧前缀开头（旧前缀一直认，不设截止）。「还要你补」的判断改用它。
3. review 归档评论不论有没有配 GitHub App 都不再带「由 Claude 代发」那行；配了 App 的照旧由 bot 发，没配的用 gh 当前账号发。归档评论开头已有的隐藏标记 `<!-- idea-loop-archive … -->` 不动。只做署名这一件事的那个函数删掉。
4. 说明文字里所有让 agent 认「🤖 idea-loop：」开头评论的地方，改成「最近一条带 `<!-- idea-loop -->` 标记（或旧的『🤖 idea-loop：』开头）的评论」；说脚本「加前缀」的地方改成「加标记」。范围：issue-session（开场认领、triage 起草、起草参考、夜间模式参考里「在 issue 上留一条评论」那处）、issue-dispatch 的早上汇总、issues 的实体表和命令表、issues 的 GitHub 与 Linear 两份平台说明、issue-triager agent 定义、SEO 上线自查记录脚本的用法注释。Linear 上的评论（agent 用 MCP 直接发）：只去掉前缀、不加标记，Linear 说明里「以『🤖 idea-loop：』开头」改成不带开头，「读最近一条」改成读最近几条 idea-loop 写的评论接上。
5. 「不以人的身份发言」改写：
   - 根目录 `AGENTS.md` idea-loop 刻意例外第 2 条改成：「**唯一在目标仓库 PR 上发言**：只在合并时贴归档评论；配了 GitHub App 由 bot 账号发，没配就用 gh 当前账号发，不加署名（人 2026-11-18 在 #296 定）。」
   - implement、pr-review 两个 skill 里「PR 上不以人的身份发言」改成「PR 上不和人往来」（保留不在 PR 上开 thread、不替人答题的意思）。
   - pr 的 review loop 参考里「归档的评论以谁的身份发」那段，改成配了 App 用 bot、没配用 gh 当前账号、不加署名，删掉「不以人的身份说话」。
   - setup 问题清单里「GitHub App 代发评论」改成「GitHub App 发评论」。
6. 插件版本照根目录 `REVIEW.md`「额外要求」升一档。

不改：PR 描述脚本、setup 生成的评论命令模板、已经发出去的评论、ADR 里的历史描述、`idea-loop/evals/` 下的用例。

## 验收标准

- [ ] 用假 gh：带评论翻 todo、贴一条普通文字、贴一条以旧前缀开头的文字，三条发出的正文都以 `<!-- idea-loop -->` 开头、都不含「🤖 idea-loop：」、标记只出现一次；贴一条已带标记的文字，标记仍只出现一次。
- [ ] 迁移时补的评论、合并后关 issue 带的评论、先放着带的评论，正文同样以标记开头、不含旧前缀（改现有用例的断言）。
- [ ] 两个 backlog issue，最新评论分别是「带标记、含还要你补」和「旧前缀开头、含还要你补」，取 backlog 候选时两个都被认成「还要你补」并跳过；人写的、含「还要你补」但既无标记也无旧前缀的评论不算。
- [ ] 归档正文在 App 身份和 gh 当前账号两种身份下都不含「由 Claude 代发」，仍以归档隐藏标记开头。
- [ ] 插件目录下（`evals/` 除外）除「认旧前缀」的判断、它的测试和说明里「或旧的『🤖 idea-loop：』开头」这类兼容说法外，没有再写出旧前缀；全仓库没有「由 Claude 代发」和「以人的身份」（ADR、raw、spec 的历史描述除外）。
- [ ] 早上汇总的文档测试改成要求提到标记，跑过。
- [ ] `REVIEW.md` 列的验证命令全过；插件 `plugin.json` 的 `version` 升了一档。
- [ ] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [ ] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [ ] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。

## 选中的存量回归

- `issues.test.mjs` 全部：发评论、取 backlog 候选、迁移、关 issue 都在这里，前缀断言要改。
- `review-loop.test.mjs` 全部：归档正文、已贴过的条目不重贴（靠归档标记）。
- `seo-live-record.test.mjs`：自查记录从 idea-loop 评论里解析标记，评论开头变了不能影响解析。
- `dispatch-by-period-doc.test.mjs`：早上汇总的文字断言。
- `no-project-leak.test.mjs`：改说明文字不能带入项目信息。
