# 05 — seo-writing 写完自动改稿到干净：写作 lint、冷读评委、最多三轮

**Blocked by**：01 — 通用写作 lint；02 — SEO.md 记下项目的写作检查配置和配图取值；03 — cover skill；04 — og skill
**设计冻结**：不涉及 UI

## 要建什么
`seo-writing` 按 brief 写完初稿后多一步改稿循环，托管时不停下：

1. 跑通用写作 lint（带上「写作」节的「lint 配置」）和「补充 lint」（项目有的话）。
2. 起一个冷读评委子代理按评分表打分；项目配了「第二评委」，它跟冷读评委一起打分。
3. 评委的 `local` 问题和 lint 问题自动改，回到第 1 步。lint 干净且评委没有 `local` 问题即完成；最多三轮，没干净的写进交回（由调用方写进 PR 描述交给 pr-review）。
4. 改稿中 title 或论点变了，调 `cover` / `og` 重出图。
5. 评委报出 `premise`（前提错了，例如论点站不住）：不自己翻论点。已写的提交，交回写明评委原话，由 issue 会话照「冒出了要人定的」把 issue 翻回 triage。

评分表写进 `seo-writing` 的参考：Toeflair 的 `readability-judge-rubric`（本机 `TOFEL-demo` 仓库 blog-publisher 的参考）13 个维度里 11 个通用的，加 2 个要配的（文章模式、中文版）写成通用说法；`local` / `premise` 分流、「低于 4 分必须给 finding」、防刷分（anti-Goodhart）照搬方法。按类别调分数线是项目取值，不进插件，由「写作」节的失败案例或类型映射指过去。

写手用 Claude，第二评委是项目可选的命令（spec「实现决策」）。不改 `seo-writing` 已有的写法规则，只加这一步。正文 5000 字上限：加完量一次（现 3616 字），细节放参考。

## 验收标准
- [x] SKILL.md 的步骤里有改稿循环：lint → 评委 → 自动改 → 回 lint，停止条件和三轮上限写明；交回格式多「lint 结果」「评委轮次」「没干净的」。
- [x] 评分表参考写了通用维度、`local` / `premise` 分流、低于 4 分必须给 finding、防刷分；不出现 Toeflair 的类别分数线。
- [x] `premise` 的去向写明：提交、交回评委原话、issue 会话翻回 triage；跟 issue-session 的「冒出了要人定的」对得上。
- [x] 第二评委、补充 lint 写 `无` 或没写时循环照常跑，有文档测试守住引用的键在 SEO.md 格式文档里存在。
- [x] title 或论点变了调 cover / og 的触发条件写明。
- [x] 调过 `writing-for-agents`，交回 `verified` 里每个改到的 skill、agent 定义、skill 参考文件一行杠杆。
- [x] 改到的 `SKILL.md` 正文按 `AGENTS.md` 的量法在上限内；超了就把只有部分运行才走到的分支挪进这个 skill 的参考文件，不删工单范围以外的句子。
- [x] 照执行方定义「改规则的工单：怎么证明 skill 真的变了」选了一种证明并做完：能机械判定的做成检查、先在历史错误上见红；要判断的写回放用例并跑过，大用例写明待跑、由编排者当场跑。只改措辞、行为没变的写「不涉及：只改措辞」。
- [x] review 第 1 轮 S1（2026-11-20）：改稿循环的交回里，lint 结果、评委轮次、没改干净的问题要能到 PR 描述：写明调用它的执行方把 lint 结果和评委轮次写成交回里的验证行、把没改干净的写成「没验成」行（这一栏本来就会进 PR 描述），有文档测试守住。

## 选中的存量回归
- `seo-outreach-doc.test.mjs`：seo-outreach 读同一个「写作」节指针，改 seo-writing 的读法不能断它。
- `seo-method-skills-no-inference-doc.test.mjs`：方法类 skill 不在运行时推项目信息。
- `seo-spec-recommend-doc.test.mjs`：托管时照推荐定的写法。
