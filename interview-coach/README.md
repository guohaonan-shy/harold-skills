# interview-coach

AI Engineer / AI Agent Engineer / Harness 方向面试陪练的 Claude Code plugin。2 个 skill:一个扮演面试官进行模拟面试,一个消费面试转录做复盘。从一场真实的面试教练录音里蒸馏出的四类问题框架和领域知识点清单驱动出题和点评。

**目标用户**:准备 AI Engineer / AI Agent Engineer / Harness 方向面试的候选人,尤其是面试经验较少、需要打磨"回答结构"和"表达"的候选人。

**默认输出语言**:跟随用户输入语言,默认中文。

---

## 2 个 skill 概览

| Skill | 角色 | 触发场景示例 | 主要产物 |
|---|---|---|---|
| **mock-interview** | AI 扮演面试官,基于简历 + 目标方向进行模拟面试 | "帮我模拟面试"、"陪我练面试"、"我要面 AI Agent 岗位了帮我练练" | `./interview-transcript-<date>.md` |
| **interview-review** | 消费一场面试转录,做复盘 | "帮我复盘这场面试"、"这是我今天面试的转写帮我看看" | `./interview-review-<date>.md` |

`mock-interview` 全程扮演面试官提问,**不给反馈**——反馈是 `interview-review` 的活,两者职责严格分离。

---

## 安装

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install interview-coach
/reload-plugins
```

安装后两个 skill 按 SKILL.md 的 frontmatter description 自动触发,也可以直接说"帮我模拟面试"这类自然语言。

---

## 典型工作流

```text
1. cd ~/job-search/ (或任意工作目录)
2. claude → "帮我模拟一场 AI Agent Engineer 的面试,这是我的简历:~/resume.pdf"
   → mock-interview 触发,先要目标方向,然后开始扮演面试官
   → 自我介绍 → 项目深挖(四类问题追问链) → 领域知识点 → 结束
   → 产出 ./interview-transcript-2026-09-04.md
3. "帮我复盘一下这场面试"
   → interview-review 触发,自动发现 cwd 下的 transcript
   → 产出 ./interview-review-2026-09-04.md:总体表现 + 逐题四维点评 + 知识点专题讲解
```

`interview-review` 也可以脱离 `mock-interview` 独立使用——直接把一场**真实面试**的录音转写贴给它(哪怕是带时间戳、多说话人、口语化,甚至混着教练实时点评的原始转写),同样能产出复盘报告。这是这个 plugin 最初的使用场景。

---

## 核心设计:面试官对项目背景"零了解"的人设

`mock-interview` 的面试官人设不会显式声明"我不懂你的领域"——这个人设完全靠**问题本身**体现:候选人如果没讲清楚"这是给谁用的""解决了什么问题",面试官会像真的不知道答案一样自然追问。这个人设不是每句话都装傻,而是体现在**第一次**遇到某个概念时的反应上;候选人解释清楚了,面试官带着这个理解继续往下问,解释得含糊,面试官后面会自然暴露出"没接住"。

配合四类问题框架(`references/question-taxonomy.md`):

| 问题类型 | 识别特征 | 该怎么答 |
|---|---|---|
| 概括类(what) | "介绍一下这个项目"、自我介绍 | 站在零背景听众视角,30-45 秒 / 1-1.5 分钟内说清场景 → 问题 → 端到端结果 |
| 选型类(why) | "为什么用这个方案" | 说清调研广度和取舍,不是只说"用了什么" |
| 实现类(how) | "这块怎么做的" | 唯一该主动展开细节的类型,但要能说清底层,接了工具却说不清实现是扣分项 |
| 延伸场景类 | "如果 XX 情况发生" | 考察未知问题的思考框架,不要求标准答案 |

面试官顺着候选人回答里冒出的名词组成一条不断变窄的**追问链**,不是四道孤立的题。

---

## 跨 skill 共享约定

`references/conventions.md` 装了两个 skill 共享的行为约定:提问方式(配置问题用 AskUserQuestion,面试问题绝不用)、文件命名与覆盖策略、输出语言、用户画像与沟通风格。

`references/question-taxonomy.md` 装四类问题框架的完整判断标准 + AI Engineer/Agent/Harness 方向知识点清单(agent 架构、skills 扩展机制、上下文工程、RAG、evaluation)——两个 skill 出题和点评时都参照它。

每个 SKILL.md 顶部 `§0 必读约定` 段指向这两份文件。

---

## 目录结构

```
interview-coach/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── references/
│   ├── conventions.md          # 跨 skill 共享约定
│   └── question-taxonomy.md    # 四类问题框架 + 领域知识点清单
└── skills/
    ├── mock-interview/
    │   └── SKILL.md
    └── interview-review/
        └── SKILL.md
```

---

## 设计要点(给后续维护者)

- **mock-interview 和 interview-review 职责严格分离**:前者只提问不点评,后者只点评不提问。这个边界是刻意设计的——真实压力测试和事后反馈混在一起,两个都做不好
- **interview-review 的知识点讲解是独立章节**,按知识点归类而不是按题目——同一个知识点在好几道题里暴露出来时只系统讲一次,报告结构上和逐题点评平级,不是附属品
- **interview-review 要能处理原始多人转写**:候选人很可能直接贴一段带时间戳、说话人标签、口语化、甚至混着教练实时点评的真实录音转写——skill 需要先识别出真实的问答轮次再点评,过滤寒暄和故障片段
- **跳过 quantitative eval**:两个 skill 输出主观性强(模拟面试的提问走向、复盘的点评措辞),用 vibe-based iteration

---

## 反馈

issue 提到 [harold-skills repo](https://github.com/guohaonan-shy/harold-skills/issues)。

**Author**: Harold
**Version**: 0.1.0
