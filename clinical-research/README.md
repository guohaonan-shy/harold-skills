# clinical-research

临床医学回顾性队列研究工作流的 Claude Code plugin。覆盖**研究设计 → 变量编码 → 统计建模 → 论文起草** 四个阶段，4 个 skill 既可串联使用，也可独立调用。

**目标用户**：临床医学博士/硕士研究生、临床研究医师。**不是统计学家或程序员**——SKILL 解释贴临床心智模型，技术名词适度展开。

**默认输出语言**：中文（医学/临床场景）。用户提到 SCI / 英文期刊 / international submission 时切英文。

---

## 4 个 skill 概览

| Skill | 用途 | 触发场景示例 | 主要产物 |
|---|---|---|---|
| **study-design** | 研究问题框架化、变量分类、模型架构设计 | "我想做一个关于 X 的研究"、"哪些变量该入主模型" | `./design-brief.md` |
| **variable-coding** | 原始变量标准化编码 + 方法学定义段落 | "这个变量怎么编码"、"NYHA 怎么分级"、"自由文本怎么分类" | `./coding-rules.md` + `./methods-variables.md` + 可选 `./recode.R` |
| **stat-analysis** | 生成 R/Python 代码、跑模型、诊断异常 | "帮我写 R 代码"、"OR 怎么这么大"、"PH 假设不成立"、"forest plot" | `./analysis.R` + `./results/` + `./interpretation.md` |
| **paper-draft** | Methods / Results / Tables / Discussion 章节起草 | "帮我写论文"、"Results 怎么写"、"Table 1 怎么排版" | `./paper-methods.md` + `./paper-results.md` + `./paper-tables.md` |

每个 skill 的 SKILL.md 主体保持精简（< 5000 字），深度参考材料在各自 `references/` 子目录。

---

## 安装

本 plugin 通过 **harold-skills marketplace** 分发。在 Claude Code 中：

```text
/plugin marketplace add guohaonan-shy/harold-skills   # 加入 marketplace
/plugin install clinical-research                      # 装这一个 plugin
/reload-plugins                                        # 让 4 个 skill 生效
```

安装后 4 个 skill 自动按 SKILL.md 的 frontmatter description 触发——直接用临床语言描述需求即可，无需手动 `/skill-name` 调用。

---

## 典型工作流

### 完整路径（推荐 — 新研究项目）

```text
study-design → variable-coding → stat-analysis → paper-draft
```

每个 skill 写到当前目录固定文件名，下游通过 `Read ./<上游产物>` 衔接。详见 `references/conventions.md` §7。

```text
1. cd ~/research/my-project/
2. claude  →  "我有一批 [领域] 的回顾性数据，想做关于 [X] 的研究"
   → study-design 触发，问 4 个核心问题，产出 ./design-brief.md
3. "帮我编码 [关键变量]"
   → variable-coding 触发，产出 ./coding-rules.md + ./methods-variables.md
4. "跑 Cox 主模型 + 扩展模型 + KM 曲线"
   → stat-analysis 触发，产出 ./analysis.R + ./results/ + ./interpretation.md
5. "写中文毕业论文的 Methods 和 Results"
   → paper-draft 触发，产出 ./paper-methods.md + ./paper-results.md + ./paper-tables.md
```

### 中游进入（已有产物）

每个 skill 可独立运行，进入时**自动尝试 Read** 上游产物（如 `./design-brief.md`），读到就沿用，没读到就走自己的"必收集信息"流程。

---

## 跨 skill 共享约定

`references/conventions.md` 装了 4 个 skill 共享的行为约定，9 节涵盖：

1. 提问方式（AskUserQuestion vs 自然语言模板的判断标准）
2. 必填信息没拿到不要猜不要默认
3. 数据输入三种形态（文件路径 / 粘贴 / 项目内 Read）
4. 缺依赖时的处理（pandas / openpyxl / R 包）
5. 文件已存在时的覆盖策略
6. 输出语言切换规则
7. 跨 skill 文件名约定
8. 用户角色与沟通风格
9. 跨 skill 的协同顺序

每个 SKILL.md 顶部 `§0 必读约定` 段指向本文件。

---

## 真实案例参考

每个 skill 的 `references/cases.md` 收录了 3-4 个**真实研究咨询案例**（基于一次胰腺外科血管侵犯研究的完整对话蒸馏）。每个案例：

- 保留原始临床背景作为教学具体性
- 附"通用原则 — 适用于"段落映射到其他领域（心血管、ICU、肾内、慢病、药物流行病学）

总计 **15 个案例 / 约 1300 行**，覆盖：

- 暴露后变量怎么定位（中介 vs 协变量）、主/扩展/敏感性分层、资源指标归属、Table 1 设计
- 三层结构如何从原始字段构建、样本量 vs 编码粒度、多源信息冲突、分级标准阈值
- 不显著结果的诊断与解读、协变量"吸走"主效应、完全分离的简化模型、加变量观察主效应
- Methods 章节真实终稿、Results 6 节迭代润色（初稿 vs 终稿对照）、不显著结果在 Results 里的诚实写法

SKILL 主体讲泛化原则；遇到具体边缘情境时由 SKILL.md `§0.1 真实案例参考` 指引 Claude 回看 cases.md 找类比。

---

## 目录结构

```
clinical-research/
├── .claude-plugin/
│   └── plugin.json                   # plugin 元信息
├── README.md                          # 本文件
├── references/
│   └── conventions.md                 # 跨 skill 共享约定
└── skills/
    ├── study-design/
    │   ├── SKILL.md
    │   └── references/cases.md        # 4 案例
    ├── variable-coding/
    │   ├── SKILL.md
    │   └── references/cases.md        # 4 案例
    ├── stat-analysis/
    │   ├── SKILL.md
    │   └── references/cases.md        # 4 案例
    └── paper-draft/
        ├── SKILL.md
        └── references/cases.md        # 3 案例
```

---

## 设计要点（给后续维护者）

- **frontmatter description 写得 pushy**：每个 SKILL 列出大量触发关键词（中英文混合、跨多个临床领域），抵御 undertrigger
- **"必填没拿到不要猜不要默认"是铁律**：必收集信息每条单独追问，不替用户拍板
- **gstack 风格语义文件名**：所有产物固定语义命名写到 cwd，下游通过 Read 读取——不用 `outputs/<timestamp>/` 子目录
- **paper-draft 不开 Bash**：纯文本生成，不应该执行代码；其他 3 个 skill 都开 Bash（数据处理 + R/Python）
- **跳过 quantitative eval**：SKILL 输出主观性强（研究方案、文本、代码风格），用 vibe-based iteration

---

## 反馈

issue 提到 [harold-skills repo](https://github.com/guohaonan-shy/harold-skills/issues)。

**Author**: Harold
**Version**: 0.0.1
