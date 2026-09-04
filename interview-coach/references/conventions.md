# 跨 skill 通用约定(interview-coach plugin)

本文件是 `mock-interview` 与 `interview-review` 共享的行为约定。两个 skill 的 SKILL.md 顶部"必读约定"段会指向本文件,也都指向同目录下的 `question-taxonomy.md`(四类问题框架 + 领域知识点清单)。

如本文件与某个 SKILL.md 内的具体说明冲突,**以 SKILL.md 为准**。

---

## 1. 提问方式:AskUserQuestion vs 自然语言 vs 纯 chat 面试对话

三种场景严格区分,不要混用:

### 配置类问题 —— 用 AskUserQuestion

启动时确定"怎么跑"的离散选项,比如目标方向(AI Engineer / AI Agent Engineer / Harness / 其他)、复盘时是否需要结合目标 JD。满足:2-4 个选项、单选、不需要复合信息。

### 复合信息 —— 用自然语言模板

简历路径、JD 内容、面试转录粘贴——这些是**内容**,不是选择题,直接用自然语言请求("把简历 PDF 路径或内容贴给我"),不要包装成 AskUserQuestion 选项。

### 面试过程本身 —— 纯 chat,不用 AskUserQuestion

`mock-interview` 扮演面试官提问时,**永远不用 AskUserQuestion**。真实面试官不会把问题包装成单选卡片,把面试问题塞进 2-4 个选项会显得荒谬,也会让候选人下意识往选项里找答案而不是自己组织语言。就直接用自然语言提问,提完问题停下来等候选人用自己的话回答。

---

## 2. 必填信息没拿到,不要猜不要默认

`mock-interview` 必须拿到:简历(文件路径或粘贴文本)+ 目标方向。`interview-review` 必须拿到:一份转录(文件路径或粘贴文本)。缺任何一项,按 §1 的方式追问,不要用占位简历/占位方向替用户开始。

例外:候选人在面试过程中答不上来某道题——这不算"缺信息",按真实面试的方式处理(见 `mock-interview` SKILL.md 里的具体指引),不要在这时候停下来问用户想怎么办。

---

## 3. 数据输入三种形态

| 输入方式 | 处理 |
|---|---|
| 简历/转录的文件路径(`.pdf` / `.md` / `.txt`) | 直接 `Read`(Read 工具原生支持 PDF) |
| 粘贴文本 | 直接使用,不需要额外解析 |
| 引用项目内已有文件(比如上一次 `mock-interview` 产物 `./interview-transcript-*.md`) | 直接 `Read`,`interview-review` 应主动检查 cwd 下是否已有这类文件,提示用户是否要用它 |

---

## 4. 输出语言

跟随用户输入语言,默认中文(候选人和面试教练场景基本都是中文求职者)。如果候选人的简历/转录是英文,或用户明确说要练英文面试,`mock-interview` 切换为全英文提问;`interview-review` 的点评仍可以用中文写(点评是给候选人看的,不是面试现场)。不混用——同一段落不要中英夹杂术语之外的完整句子。

---

## 5. 文件已存在时的覆盖策略

产物文件已存在时,不直接覆盖,用 AskUserQuestion 三选一:**覆盖** / **加时间戳后缀另存**(如 `interview-transcript-2026-09-03-2.md`)/ **另存到用户指定路径**。同一会话内问过一次就记住偏好,不重复问。

---

## 6. 跨 skill 文件名约定

| 产物 | 写者 | 读者 |
|---|---|---|
| `./interview-transcript-<YYYY-MM-DD>.md` | mock-interview | interview-review、用户自己回看 |
| `./interview-review-<YYYY-MM-DD>.md` | interview-review | 用户 |

两者都写到用户当前工作目录(cwd),不自动建 `outputs/` 子目录。日期用面试/复盘发生当天。同一天多场面试,在覆盖策略(§5)里用序号后缀区分。

---

## 7. 跨 skill 的协同顺序

自然顺序是 `mock-interview → interview-review`,但两者都要能独立工作:
- `interview-review` 的输入不一定来自 `mock-interview`——用户完全可能拿一份真实面试的录音转写直接来复盘(这正是这个 plugin 最初的使用场景)
- 如果用户直接找 `mock-interview` 且 cwd 下已有未复盘的 `interview-transcript-*.md`,提示一句"上一场还没复盘,要不要先跑 `interview-review`",不强制

---

## 8. 用户画像与沟通风格

- 候选人本身经验较浅,面试次数少,容易紧张、语言组织能力有限、表达偏口语化
- `mock-interview` 面试过程中**不评价、不纠正、不给反馈**——候选人需要的是接近真实的压力测试,面试进行中打断纠正会破坏体验也学不到东西;反馈全部留给 `interview-review`
- `interview-review` 点评时要具体到"这句话/这道题可以怎么改",不要停留在"表达再简练一点"这种空泛建议——给出改写后的示例句子
- 两个 skill 都不代替候选人做技术判断(比如不替他编造项目里没有的技术细节),`interview-review` 发现候选人对自己项目里提到的技术说不清楚时,如实指出这是扣分项,而不是帮他圆过去
