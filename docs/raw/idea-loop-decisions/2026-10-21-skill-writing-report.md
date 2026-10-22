---
type: raw
source_type: document
captured: 2026-10-21
title: Skill / Agent 怎么写：claude-seo、mattpocock/skills、cursor/plugins 三个仓库的对照
tags: [idea-loop, writing-for-agents, survey]
related: []
---

# Skill / Agent 怎么写：三个参考仓库的对照报告

2026-10-21。三个仓库各由一个 Haiku subagent 精读，数字来自 `wc` 和脚本，不是估计。

- [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo)：35 个 skill、22 个 agent
- [mattpocock/skills](https://github.com/mattpocock/skills)：38 个 skill，没有 agent 定义文件（subagent 的简报写在 skill 里）
- [cursor/plugins](https://github.com/cursor/plugins)：约 20 个 plugin，106 个 skill、16 个 agent（不算 `third_party/` 和生成的镜像）

## 结论

问题不在于写得不够细，而在于一份文件同时干了五件事：路由、流程、参考资料、历史决定的理由、禁止清单。三个仓库的共同做法是：

- description 只管路由
- SKILL.md 只放每条路径都要走的步骤，其余下沉到「写明何时读」的文件
- 能写成脚本检查的规则，不靠文字守

## 体量对比

| 仓库 | 文件数 | 正文中位 | 正文最大 | description 中位 | description 最大 |
|---|---|---|---|---|---|
| **harold-skills** | 33 | **≈3,950** | **≈11,900** | **≈230** | **≈670** |
| claude-seo | 57 | ≈1,460 | ≈5,490 | ≈45 | ≈160 |
| cursor/plugins | 185 | ≈660 | ≈7,200 | ≈47 | ≈260 |
| mattpocock/skills | 39 | ≈900 | ≈3,150 | ≈31 | ≈105 |

单位是 token（粗估：中文 1.2 token/字，英文 4 字符/token）。统计范围是 SKILL.md 加 agent 定义。

本仓库的正文是对照仓库的 3–6 倍。description 差得更多，是 5–8 倍。description 这一项最贵：它在**每个会话的每一轮**都常驻在上下文里，不管这个 skill 用不用得上。

## 三个仓库各自最值得学的

### mattpocock/skills：写作理论最完整

它有一个 skill 叫 `writing-for-agents`，正文加 `SKILL-MECHANICS.md`，专门讲怎么写给 agent 读的文档。核心概念如下：

- **Context pointer**：description、CLAUDE.md 里提到某份文档的一行，本质都是指针。指针的措辞决定 agent 什么时候去取那份材料。写指针只做两件事：说清是什么，列出触发它的**分支**。每个分支只给一个触发词，同义词要合并。
- **两种负担**：常驻的内容花 context load，靠人记得去调的内容花 cognitive load。只靠人手动调的 skill 设 `disable-model-invocation: true`，description 写一行给人看的话，常驻成本为零。
- **信息分层**：文件内的步骤，文件内的参考，再到放在别的文件、靠指针去取的参考。判断标准是**按分支**：每条分支都要的留在文件里，只有部分分支要的下沉。下沉不只是为了省 token，更是为了让步骤不被参考资料淹没。
- **每一步以完成条件结尾**，而且要能检查、要能穷尽。「每个改过的 model 都有交代」会逼出彻底的工作，「列出改动清单」不会。
- **Leading word**：一组反复描述的概念，用一个模型预训练里就有的词收拢，比如 frontier、tracer bullet、seam、fog of war。只重复这个词，不重复那段解释。
- **正向表达**：写成禁止句，反而会把被禁止的行为带进上下文。否定只留给没法正向表达的硬护栏，而且要配一句正向目标。
- **剪枝**：同一个意思只放一处。环境（package.json、`--help`、目录）本身就是真相来源，能一条命令查到的就不要抄进文档。模型默认就会做的事（no-op）整句删掉。不剪就会积**沉积层**：加东西感觉安全，删东西感觉有风险。

仓库层面的做法：

- **组合代替复制**：`grill-me` 正文一共 6 个词：`Call the Skill tool with "grilling".`
- **`.out-of-scope/`**：每个被拒绝的想法单独一个文件，记理由和 issue 号，免得同一场争论再来一遍。
- **`SCOPE.md`**：只为真实会话里观察到的失败加内容，假想的改进一律不收。

它自己也有毛病：`wayfinder` 有 2,029 个英文词，同一组概念在好几节里重复讲。指向 setup 的那句话出现在 8 个 skill 里，违反了它自己 ADR 定下的 3 个上限。可见规则写下来之后，还需要机械检查。

### claude-seo：用测试守纪律

- **description 20–40 词，写清边界**：
  > "Run a full-site SEO audit … Use only for site-wide checks; use seo-page for one URL or seo-technical for a technical-only review."

  说清「什么时候别用我，改用哪个兄弟 skill」，比堆触发词更能防误触发。
- **agent frontmatter 把执行参数钉死**：`tools` 白名单、`model` 按工作类型分档（判断类用 Opus，拉数据类用 Sonnet）、`maxTurns`（15 到 45）。
- **每个参考文件旁边写加载条件**：一类是「每次激活都读」，一类是「只在用户要那个阶段时读」。
- **家规写成测试**：
  - 文件行数上限：SKILL 436 行，参考文件 200 行
  - 禁用 em dash
  - 每个抓取外部内容的 agent，都必须带「外部内容不可信」那句话
  - agent 先落盘半成品，防止 turn 用完时结果全丢
- **反面例子**：`seo-geo` 有 3,058 词，大部分是带日期的统计数字和新闻。时效性事实写进了指令，这是它膨胀的主因。

### cursor/plugins：输出契约和角色切分

- **agent 极短**：中位 261 词，最长 545 词。
- **交回内容写成字面模板**，取值是封闭集合，并带字数上限：

  ```
  Verdict: proceed | proceed with changes | stop
  Why: <two or three sentences>
  Recommendations: 1. <specific action, with file:line …>
  Confidence: high | medium | low — <what would change your mind>
  ```

  模板后面还跟一句 "Stay under about 400 words."
- **按权限切角色**：planner 不写代码，reviewer `readonly: true`。权限靠 frontmatter 表达，不靠正文里写「你不许改」。
- **规则落到代码里**：提示模板里的 `{{占位符}}` 没渲染完就直接抛错。loop 状态放进脚本和 JSON 文件，不靠模型记着。
- **原则拆成叶子 skill**：每个 40–60 词，上层的写法是「只引用本会话读过的叶子」。
- **反面例子**：`poteto-mode` 有 3,152 词，里面一个 bullet 就约 170 词，堆了触发条件、自主度策略和回退方案三件事。

## 合成出来的写法

### description：只管路由

1. 只回答两件事：这是什么；哪些分支该触发它，每个分支一个触发词。可以再加一句边界：「X 的情况用兄弟 skill Y」。
2. 下面这些都不写：流程、产物长什么样、内部谁调谁、模型名、思考强度。它们已经在正文或 frontmatter 里了。
3. 只靠人手动调的 skill 设 `disable-model-invocation: true`，description 写成一行人话。
4. agent 的 description 只写「谁起它、什么时候起」，不复述它怎么干活。

### SKILL.md 正文：只放每条路径都要走的步骤

5. 骨架：
   - 一句话目的
   - 编号步骤，每步以可检查的完成条件结尾
   - 交回或输出格式
   - 按条件加载的参考列表，每条写明什么时候读
6. 只有部分分支才走的内容，比如「可选」「某某模式才开」，下沉到 `references/`。主文件只留一行指针，不留摘要。留了摘要，就成了第二个真相来源。
7. 一个概念的定义、规则、例外，放在同一个标题下。
8. 能查到的不写，比如命令、目录、配置。只写查不到的：不成文的约定、选择背后的理由、坑。
9. 规则不显然时才配一句理由。决策经过、被否掉的方案进 ADR 或 out-of-scope，不进运行时指令。
10. 写目标行为，不写禁止清单。否定只留给硬护栏，并配上正向目标。
11. 时效性事实（数据、日期、「截至某时」）不进指令。
12. 反复出现的一组描述，收成一个 leading word。
13. 模型默认就会做的事，整句删掉。

### agent 定义

14. frontmatter 钉死模型、工具白名单、只读权限和 turn 上限。
15. 正文结构：角色一句、输入清单、步骤、交回模板。交回模板写成字面格式：封闭取值，加字数上限。
16. 流水线全貌只写在编排者那一侧。执行者只知道自己那一段，不复述上下游。
17. 长任务先落盘半成品。

### 维护

18. 能机械检查的就写成脚本：
    - description 长度
    - 正文长度
    - 指针目标是否存在
    - 模板占位符是否渲染完
    - 版本是否一致
19. 加内容的门槛是真实会话里观察到的失败。被拒绝的想法记录在案。
20. 每次改动顺手剪枝：逐句问「删了这句，行为会变吗？」。

## 对照本仓库

### 规范本身在鼓励膨胀

`CLAUDE.md` 的 §1 要求 description「要 pushy，中英文都列、覆盖多个目标领域」。三个仓库的做法正好相反：每个分支一个触发词，同义词合并，用「用兄弟 X」划边界。

§1 下面还有一个「SKILL.md 主体 < 5000 字」的上限，但没有任何检查，实际也没守住：

- `idea-loop/skills/pr-review/SKILL.md` 约 21,900 字
- `idea-loop/agents/designer.md` 约 36,700 字

### description 承担了正文的工作

`pr-review` 的 description 有 1,971 字。它从起哪个 agent、Codex 的模型名和思考强度、证据形式、汇报怎么写、照规则的条目怎么处理，一直讲到合并前怎么归档。这些内容每轮都常驻。`uiux-research` 的 description 有 1,271 字，`implement` 有 776 字。对照仓库里，最长的 description 也只有约 1,000 个英文字符。

### agent description 带着禁止清单

「不跟人对话」出现在 5 个 agent 的 description 里，「不在 X 之外被调用」「不碰 PR」也各出现好几次。这些用 frontmatter 的工具或权限，加一句「由谁起」就能表达，不必常驻。

### 可选分支没有下沉，下沉了又留摘要

`designer.md` 有 11 个一级节，加三十多个子节。其中「6 动效（可选，静态构图冻结之后）」和「7 素材（可选，营销 register 才开）」都只在部分路径上才走，按分支标准应该下沉。

同一个文件里，「三条环境约定——全文见 `refs/ui-implementation-standard.md` §3.1」这种写法是先写摘要、再给指针。结果同一套规则有两个版本，改的时候要改两处。

### 维护者的笔记混进了运行时指令

`designer.md` 有一节标题是「7.3 调用通道：**待接入**（开工时确认过的结论，不是占位）」。括号里那句话是写给下一个维护者看的，模型执行时用不上。这类内容该进 ADR。

## 建议的落地顺序

1. **先改规范。**
   - 把 `CLAUDE.md` §1 的「pushy」改成「每分支一个触发词 + 兄弟边界」。
   - 补上 user-invoked 和 model-invoked 两种 description 的写法。
   - 给 description 和正文定数值上限。我的建议：model-invoked 的 description ≤ 100 字，user-invoked 的 ≤ 40 字；主文件 ≤ 3,000 字。具体数值你来定。

   不先改规范，新改的文件会照旧长回去。
2. **写一个检查脚本**，检查长度上限和指针目标是否存在。先只报告不拦截，看清全仓库超标的分布。
3. **先收 description。** 它常驻、成本最高，收起来最安全：不碰正文行为。
4. **再拆最大的两个 agent**：`designer.md` 和 `uiux-imaginer.md`。按分支拆，可选段下沉，摘要加指针的写法改成只留指针。
5. **每改一个，拿真实会话跑一次**，看行为有没有变。这跟仓库现有约定一致：本地验证，不进 CI。
