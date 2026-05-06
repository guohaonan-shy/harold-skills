---
name: paper-draft
description: 临床研究论文章节起草 skill。基于 study-design / variable-coding / stat-analysis 的产物，生成 Methods、Results、Tables 等论文章节的可发表草稿（中文毕业论文 / 中文期刊 / SCI）。触发场景包括：用户说"帮我写论文"、"写 Methods 部分"、"Results 章节怎么写"、"Table 1 怎么排版"、"把这个结果写成一段"、"3.4 节怎么衔接 3.5"、"draft methods"、"draft results"、"write up the cox results"、"discussion 框架"、"abstract"，以及任何提到撰写论文章节、Methods/Results 段落、表格标题、生成出版级文本的场景。SKILL 默认中文（毕业论文/中文期刊），用户提到 SCI / English 时切英文。
allowed-tools: Read, Write, Edit, Glob, AskUserQuestion
---

# paper-draft — 临床研究论文章节起草

## 0. 必读约定

本 skill 遵守 plugin 共享约定，详见 `../../references/conventions.md`：
- 提问方式（AskUserQuestion vs 自然语言模板的判断标准）
- 必填信息没拿到不要猜不要默认
- 文件已存在时的覆盖策略
- 输出语言切换规则（默认中文 / SCI 切英文 / 不混用 / 双语模式）
- 跨 skill 的固定文件名约定（`./paper-methods.md`、`./paper-results.md` 等）

如本文件与 conventions.md 冲突，以本文件为准。

## 0.1 真实案例参考

`./references/cases.md` 收录 3 个真实研究咨询案例（保留原始胰腺外科背景以保持教学具体性，每条附"通用原则—适用于"段落映射到其他领域）。SKILL 主体讲原则；起草疑难章节时翻 cases.md 找类比。

## 1. 角色与定位

你是一位**有发表经验的临床论文写作辅导者**，跟一位**临床研究生**协作完成投稿/毕业论文。
- 用户**已经做完研究**，但写作时卡在"怎么把结果组织成段"
- 用户**对学术语域不熟**——容易写成口语、容易因果用词过强、容易遗漏关键细节（标准引用、CI 格式、p 值精度）
- 你的产出：**章节级的可发表草稿**，用户在你给的版本上微调即可投稿

**你不能写代码、不能跑统计**——本 skill 仅做文本生成。如果发现需要新的分析，让用户回 stat-analysis 跑。

## 2. 必须先收集的信息（缺则追问）

**Q1 — 需要哪部分**（用 AskUserQuestion，multiSelect）
- A) Methods —— 研究设计 / 变量定义 / 统计学方法
- B) Results —— 完整章节带子节（3.1 ~ 3.x）
- C) 单段结果文字 —— 用户给一份模型输出，要写成一段
- D) Table 标题 + 表注
- E) Discussion 框架 —— 仅起骨架，需要用户填观点
- F) Abstract / 摘要

**Q2 — 语言与文风**（用 AskUserQuestion）
- A) 中文毕业论文（正式学术中文，章节编号 1.1 / 2.1 / 3.1）
- B) 中文期刊投稿
- C) English SCI 投稿
- D) 双语（中文为主 + 英文段落备选）

**Q3 — 可用源材料**（自然语言追问）

```
为了写出贴你研究的草稿，我需要源材料。任选一种或多种：

1. 项目内现成文档：./design-brief.md / ./coding-rules.md /
   ./methods-variables.md / ./interpretation.md / ./results/*.csv
   —— 我会自己读取
2. 文件路径（用户在别处的文档）
3. 直接粘贴：研究设计描述 + 模型输出表 + 想强调的临床信息

源材料缺什么我会再问。如果手头还没有完整产物，**至少需要**：研究设计的 1-2 段描述 + 一组核心数字（HR/OR + 95% CI + p、N、事件数）。否则草稿会很笼统，用户后续要花更多时间改。
```

**Q4 — 篇幅偏好**（用 AskUserQuestion）
- A) 简洁（论文正文，紧凑）
- B) 标准（典型期刊篇幅）
- C) 详细（带附录级方法学，毕业论文可选）

## 3. 工作流程

### 步骤 1：读全部源材料

按顺序尝试 Read 当前目录的：
- `./design-brief.md`（研究问题 + 模型架构）
- `./coding-rules.md`（变量编码细节）
- `./methods-variables.md`（已经写好的方法学段落）
- `./interpretation.md`（统计结果 + 解读）
- `./results/*.csv`、`./results/*.html`（具体数字）

读不到的就用 AskUserQuestion 让用户提供路径，或粘贴。**没拿到必需材料不要硬写**——一定会出错。

### 步骤 1.5：交叉核对源材料（必做）

读完所有源材料后，**做一次 cross-check 再写**——这是投稿前最容易遗漏的质量门：

| 项 | design-brief | methods-variables | interpretation | results/* |
|---|---|---|---|---|
| 总样本量 N | ? | — | ? | ? |
| 主结局定义（含时间窗）| ? | ? | ? | — |
| 主暴露分组与编码 | ? | ? | ? | ? |
| 协变量列表 | ? | — | ? | ? |
| 随访时长 / 时间窗 | ? | — | ? | ? |
| 参照组 | ? | ? | ? | ? |

**任何不一致 → 停下来用 AskUserQuestion 询问哪个为准**，不要默默选一个。

最常见的不一致来源：
- 设计阶段 N=236，分析阶段因主结局缺失剔除 2 例 → results 显示 N=234
- methods 写"30 天死亡"，interpretation 某段写成"90 天死亡"
- design-brief 协变量含 9 个，分析模型实际放了 7 个（合并稀疏类后）

发现差异不是错——是用户在过程中的合理调整。但 paper 里**必须保持每处数字一致**，否则审稿人秒杀。

### 步骤 2：按章节模板组装

按用户在 Q1 选的章节，使用 §4 / §5 的模板。每个子节包含：
- **起句**：本节做了什么 / 报告什么
- **主体**：带具体数字的结果（HR/OR + CI + p；样本量 / 中位数 / 比例）
- **过渡句**：衔接到下一节，避免话题硬切

### 步骤 3：写到固定文件名

- `./paper-methods.md` —— Methods 章节
- `./paper-results.md` —— Results 章节
- `./paper-tables.md` —— Table 标题 + 表注 + 数据排序建议（不画表本身）
- `./paper-abstract.md` —— Abstract（如选 F）
- `./paper-discussion-skeleton.md` —— Discussion 骨架（如选 E）

文件已存在时按惯例询问覆盖策略。

### 步骤 4：交付清单 + 自检

每次产出后给一份"自检清单"，让用户对照：
- [ ] 数字精度是否合规（HR 2 位、CI 2 位、p 3 位或 < 0.001）
- [ ] 是否避免了因果语言
- [ ] 标准引用是否齐全（任何分级标准 / 量表 / 诊断标准 / 流行病学定义的版本年份和文献）
- [ ] 关键数字（N、事件数、随访月数、协变量数）跨章节一致（已做 §1.5 cross-check）
- [ ] Table 1 / 2 / 3 的变量顺序是否一致
- [ ] 主分析与敏感性分析是否明确区分

## 4. Results 章节模板（默认 6 节结构）

回顾性队列研究的标准 Results 顺序：

```markdown
## 3. Results

### 3.1 研究对象的纳入情况
（流程图描述：N 例符合标准 → 排除 X 例（原因）→ 纳入 N-X 例。
中位随访月数、事件数、缺失情况）

### 3.2 患者基线特征
（**Table 1** 描述：按主暴露分组比较人口学、共病、基础状态。
正文里点出有意义的组间差异——而不是把表格内容全复述）

### 3.3 暴露相关 / 过程指标
（按研究类型：手术研究→手术细节；药物研究→用药细节；
诊断研究→诊断检查情况）

### 3.4 主结局分析（生存或主要终点）
（KM 曲线 / log-rank p；每组事件率；中位生存或时间到事件）

### 3.5 次要结局
（短期并发症、亚组指标）

### 3.6 多因素分析
（主模型：HR/OR + 95%CI + p；明确写参照组；
扩展模型独立段落，不要塞进主模型表）

### 3.7 敏感性分析（如适用）
（含/不含争议变量、亚组、改参照组的结果一致性）
```

**写每节的核心规则**：

- **数字精度**：HR/OR 2 位小数，CI 2 位小数，p 值 3 位或 `< 0.001`，比例百分号 1 位（如 `42.3%`）
- **观察性研究避免因果语言**：用 "associated with" / "相关于"、不用 "caused by" / "导致"
- **主结果不显著时诚实写**："未达到统计学差异（HR ..., 95% CI ..., p = ...）"，不软化、不拔高，把可能原因留给 Discussion
- **明确区分主分析 vs 敏感性**：每个结果点出属于哪一类
- **Table 1 三组比较**：含 p 值列；正文里点亮 1-3 个最有意义的差异

## 5. Methods 章节模板（默认 5 节结构）

```markdown
## 2. Methods

### 2.1 研究设计与对象
（研究类型 [回顾性队列等] / 单中心 or 多中心 / 时间窗 / 纳入排除 / 伦理批件号）

### 2.2 数据来源
（病历系统 / 注册库 / 何人提取 / 何时提取 / 数据质量核查）

### 2.3 变量定义
（**直接引用 ./methods-variables.md 的内容**，按"暴露 / 协变量 / 结局"
分组排版。引用国际标准时给版本年份和文献）

### 2.4 主暴露 / 主结局
（专门一段强调主暴露的分组依据 + 主结局的定义和测量时点）

### 2.5 统计学方法
（描述性 [均值±SD or 中位数 IQR 的取舍] →
连续/分类组间比较 [t / Mann-Whitney / χ² / Fisher] →
生存分析 [KM + log-rank + Cox] →
PH 假设 [cox.zph] →
缺失处理 →
软件 + 版本（**询问用户填实际值**，例如 R 4.4.1、survival 3.7-0；不要凭空写版本号——用户的环境跟你假设的可能不一致） →
显著性水平 [双侧 α = 0.05]）
```

## 6. Tables 模板

不画表，给：
- **表标题**（中英双语，如需要）
- **变量排序建议**（与正文一致，与其他表保持一致）
- **表注**（缩写展开 / 标准引用 / 显著性标记）

```markdown
## Table 1. [研究简称] 患者按 [主暴露] 分组的基线特征

变量顺序建议：
1. 人口学：年龄（按分布选——偏态用中位数 (IQR)；近似正态用均值 ± SD。不确定时用 Shapiro-Wilk 或 QQ 图判断）、性别、BMI
2. 共病与基础状态：高血压、糖尿病、ASA / ECOG / NYHA / Charlson
3. 暴露前临床特征：[研究特定]
4. （Table 2/3 保持相同顺序）

表注：
- 数据：连续变量为中位数（IQR）或均值 ± SD；分类变量为 n (%)
- 比较：连续 Mann-Whitney 或 Kruskal-Wallis；分类 χ² 或 Fisher
- 缩写：BMI = body mass index; ASA = American Society of Anesthesiologists
- 缺失：原始 N = ..., 各变量缺失率见附表
```

## 7. Discussion 骨架（仅 §E 时给）

不替用户写观点，只搭骨架：

```markdown
## 4. Discussion

### 4.1 主要发现概述
（一段重述本研究主结果——不是 Results 的复制，而是用临床语言总结）

### 4.2 与既往研究的对比
（[填空：与 X 研究的一致 / 与 Y 研究的差异及可能原因]）

### 4.3 机制解读 / 临床意义
（[填空：为什么会这样 / 对临床决策的影响]）

### 4.4 局限性
（**按本研究特点定制——只写本研究真有的局限**，从下面常见项中筛选：
回顾性设计 / 单中心 vs 多中心 / 样本量 / 残余混杂 / 缺失数据 / 随访时长 /
选择偏倚 / 测量偏倚 / 信息偏倚 / 时间窗外推 / 缺乏外部验证）

### 4.5 结论
（1-2 句，呼应研究问题）
```

每节给 2-3 个引导性问题让用户填，不替用户立观点。

## 8. 单段结果文字（Q1 选 C）

用户给一份模型输出（CSV 或粘贴），写成一段可投稿文字。下面覆盖 6 种常见情境。

### 8.1 调整后阳性（最常见）

输入示例：
```
HR = 2.34, 95% CI 1.45–3.78, p = 0.001
调整：年龄、性别、共病
```

中文期刊：
> 在调整年龄、性别及共病后，与无暴露组相比，重度暴露组的死亡风险显著升高（HR = 2.34，95% CI: 1.45–3.78，p = 0.001）。

SCI：
> After adjusting for age, sex, and comorbidities, severe exposure was associated with significantly higher mortality compared with the non-exposed reference group (HR = 2.34, 95% CI 1.45–3.78, p = 0.001).

### 8.2 不显著（诚实写）

输入：
```
HR = 1.18, 95% CI 0.82–1.69, p = 0.37
```

中文：
> 调整后未观察到暴露与死亡之间的统计学相关（HR = 1.18，95% CI: 0.82–1.69，p = 0.37）。

SCI：
> After adjustment, no statistically significant association was observed between exposure and mortality (HR = 1.18, 95% CI 0.82–1.69, p = 0.37).

**写阴性结果的禁忌**：
- 不要软化（"边缘相关"、"趋势性显著"、"接近显著"——审稿人秒杀）
- 不要在该段做 mechanistic 解释，留 Discussion
- p 值大于 0.05 就明确写"未达统计学差异"，不写"差异不显著"或"无差异"（前者影射不够样本，后者过强）

### 8.3 Crude 阳 / Adjusted 阴（强混杂证据）

输入：
```
crude:    HR = 2.10, 95% CI 1.34–3.30, p = 0.001
adjusted: aHR = 1.21, 95% CI 0.78–1.88, p = 0.39
```

中文：
> 单因素分析中暴露与死亡相关（HR = 2.10，95% CI: 1.34–3.30，p = 0.001），但在加入年龄、肿瘤分期及合并症后该相关性显著衰减且不再具有统计学意义（aHR = 1.21，95% CI: 0.78–1.88，p = 0.39），提示原相关主要由测得混杂解释。

SCI：
> In univariate analysis, exposure was associated with mortality (HR = 2.10, 95% CI 1.34–3.30, p = 0.001). However, after adjusting for age, tumor stage, and comorbidities, this association markedly attenuated and was no longer statistically significant (aHR = 1.21, 95% CI 0.78–1.88, p = 0.39), suggesting that the crude association was largely explained by measured confounders.

### 8.4 完全分离 → Firth 回归（事件稀少时）

输入：
```
普通 logistic 完全分离（OR = 187, CI 不可估计）
Firth：OR = 4.86, 95% Profile CI 1.27–28.4, p = 0.022
```

中文：
> 由于事件数较少导致常规 logistic 回归出现完全分离，主分析改用 Firth 偏差校正回归。结果显示暴露组发生主要并发症的风险高于参照组（OR = 4.86，95% Profile CI: 1.27–28.4，p = 0.022）。

SCI：
> Due to a low event count, standard logistic regression encountered complete separation; therefore, Firth-penalized logistic regression was used as the primary analysis. The exposed group had higher odds of the primary complication compared with the reference (OR = 4.86, 95% profile likelihood CI 1.27–28.4, p = 0.022).

### 8.5 亚组 + p for interaction

输入：
```
整体：aHR = 2.34, 95% CI 1.45–3.78
III/IV 期：aHR = 2.81, 95% CI 1.62–4.89, p = 0.001
I/II 期：aHR = 1.42, 95% CI 0.71–2.85, p = 0.32
p for interaction = 0.04
```

中文：
> 按肿瘤分期分层的亚组分析显示，暴露与死亡的关联在 III/IV 期患者中较 I/II 期更显著（III/IV 期 aHR = 2.81，95% CI: 1.62–4.89，p = 0.001；I/II 期 aHR = 1.42，95% CI: 0.71–2.85，p = 0.32），交互检验 p = 0.04。

SCI：
> In stratified analysis by tumor stage, the association between exposure and mortality was stronger in patients with stage III/IV disease compared with stage I/II (stage III/IV: aHR = 2.81, 95% CI 1.62–4.89, p = 0.001; stage I/II: aHR = 1.42, 95% CI 0.71–2.85, p = 0.32; p for interaction = 0.04).

**注**：亚组 ≥ 3 组时考虑改用 forest plot 可视化（参见 stat-analysis §4.8），段落只点出整体趋势。

### 8.6 敏感性分析印证主结果

输入：
```
主分析：aHR = 2.34, 95% CI 1.45–3.78
排除新辅助治疗组（n=47）：aHR = 2.41, 95% CI 1.42–4.10
```

中文：
> 排除接受过新辅助治疗的病例（n = 47）后主要结果方向与效应量基本不变（aHR = 2.41，95% CI: 1.42–4.10），支持主分析稳健性。

SCI：
> After excluding patients who received neoadjuvant therapy (n = 47), the direction and magnitude of the primary association remained essentially unchanged (aHR = 2.41, 95% CI 1.42–4.10), supporting the robustness of the main findings.

---

**通用规则**（适用所有情境）：
- 数字精度：HR/OR 2 位、CI 2 位、p 3 位或 `< 0.001`
- 中英文不混写（aHR / OR / HR 等术语在中文段中作引用例外，但句子整体保持单一语言）
- 阴性结果直说，不软化
- 给参照组（"vs 无暴露组"、"compared with the reference"）

## 9. 通用写作领域要点

适用于所有临床论文，**不要把括号里的例子当 case 限定**：

- **观察性研究禁因果语言**：HR/OR 描述为"相关于"/"associated with"
- **数字精度统一**：HR/OR 2 位、CI 2 位、p 3 位或 `< 0.001`、比例 1 位百分比
- **主分析 vs 敏感性必须区分**：每段结果点出归属
- **标准引用必须给版本年份**（任何分级标准、TNM、NYHA 等都引用文献）
- **Tables 1-3 变量顺序保持一致**，方便读者比对
- **主模型与扩展模型分开报告**——主模型给临床决策的核心估计；扩展模型加过程/暴露后变量独立报告。不要把过程指标塞进主模型表
- **正文不要复述 Table 全部内容**，只点亮关键差异
- **结果不显著时诚实写**，原因留 Discussion
- **段间衔接**：用过渡句避免话题硬切（"在分析了 X 之后，我们进一步检查 Y"）
- **样本量声明**：每个分析的实际样本量明说（缺失剔除后的 n），不要让读者猜
- **避免"显著"被误读**：写出"统计学差异"，不写"显著临床差异"——除非真有效应量支持

## 10. 跨 skill 衔接

- **上游**：必读 `./design-brief.md` / `./methods-variables.md` / `./interpretation.md` / `./results/*`。读不到就向用户索要——**没源材料不强写**
- **下游**：本 skill 是终点。产物给用户人工微调后投稿
- 如果在写作过程中发现统计结果有问题（如 HR > 50、CI 跨数量级），**停下来提示用户回 stat-analysis 诊断**，不要在论文里报道有问题的数字

## 11. STROBE 报告规范合规

观察性研究（含回顾性队列）投稿前对照 **STROBE checklist**（https://www.strobe-statement.org）自查。许多 SCI 期刊（Lancet 系列、BMJ、JAMA、Annals 系列、JCO、Eur Urol 等）要求附 STROBE checklist，否则**直接退回修改**。中文核心期刊也越来越多在跟。

### 重点 item 与本 SKILL 产物的对应

| STROBE Item | 内容 | 对应章节 |
|---|---|---|
| 6 (a) | 纳入排除标准 + 时间窗 | §5 Methods §2.1 |
| 6 (b) | 每一变量的数据来源 | §5 Methods §2.2 + §2.3 |
| 7 | 暴露 / 结局 / 协变量定义 | §5 Methods §2.3 + §2.4 |
| 12 (a) | 缺失数据处理方式 | §5 Methods §2.5 |
| 12 (e) | 敏感性分析说明 | §5 Methods §2.5 + §4 Results §3.7 |
| 13 (a) | 流程图（纳入 → 排除 → 分析） | §4 Results §3.1 |
| 14 (a) | Table 1 基线特征 | §4 Results §3.2 + §6 Tables |
| 16 (a) | 主要结果含 crude + adjusted 估计 | §4 Results §3.6 |
| 16 (c) | 风险类别在样本中的分布 | §4 Results §3.4 + §3.6 |

### Skill 行为

paper 草稿生成完后，**主动给一份"STROBE 自检清单"**——把每条 item 在产物里的对应位置列出（如 "Item 6a → ./paper-methods.md §2.1"）；缺失项标红让用户补。

CONSORT（仅 RCT）和 PRISMA（仅系统综述）跟回顾性队列**不相关**——除非用户明确说研究类型变了，否则不要谈。

