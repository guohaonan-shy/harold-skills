# 跨 skill 通用约定（clinical-research plugin）

本文件是 plugin 内全部 skill（study-design / variable-coding / stat-analysis / paper-draft）共享的行为约定。每个 skill 的 SKILL.md 顶部"必读约定"段会指向本文件。

如本文件与某个 SKILL.md 内的具体说明冲突，**以 SKILL.md 为准**——SKILL 是更具体的约束。

---

## 1. 提问方式：AskUserQuestion vs 自然语言模板

### 用 AskUserQuestion，当且仅当**全部**满足：

1. 答案是**单一离散选择**——不是粘贴、描述或文件路径
2. **2 ~ 4 个选项**就能覆盖 ≥ 90% 真实情况
3. 每个选项**一两个词**就能 label
4. 用户**不需要复合多个信息**才能回答

### 否则用自然语言模板，即满足任一：

- 答案需要**粘贴**（变量清单、原始值、模型输出等）
- 答案需要**复合信息**（如：样本量 + 事件数 + 随访 + 变量清单 一次给）
- 答案需要**自由描述**（研究问题、出错的现象）
- 答案是**文件路径或对某文档的引用**
- 真实选项 > 4 个，且合并会丢信息

### 自然语言模板的标准格式

```
为了继续，我需要先确认 X。常见情况有：

  A) [选项1] —— 适用于 [场景]
  B) [选项2] —— 适用于 [场景]
  C) [选项3] —— 适用于 [场景]
  D) 自定义 —— 用你自己的话描述

你的情况符合哪一种？（也可以直接描述）
```

**永远保留"自定义"逃逸通道**。

### 一次最多 3 个问题

不要 batch 5 个问题让用户头大。优先问"必填没拿到不能继续"的那一个。

---

## 2. 必填信息没拿到，不要猜不要默认

每个 skill 都有"必收集信息"列表。**任何一项缺失都不要替用户拍板**——按 §1 的方式追问，等用户回答再继续。

例外：**用户在某个回合明确说"你来定" / "默认即可" / "随便"**——这时按 SKILL.md 里的推荐项执行，并在产物里**显式标注**这是默认值，方便用户事后回头改。

---

## 3. 数据输入三种形态

| 输入方式 | 处理 |
|---|---|
| 文件路径（`./data.xlsx`、`./data.csv`） | Bash 跑 pandas / R 读取，**先 head() 确认**列名和前 5 行 |
| 粘贴表格文本（tab/制表符分隔） | 按行/制表符 split 解析 |
| 引用项目内已有文件 | 直接 Read |

**永远先确认有哪些列再设计后续动作**。不要假设变量名的含义——同名变量在不同研究里可能是基线特征 / 过程指标 / 结局，时点信息必须问。

---

## 4. 缺依赖时的处理

### 4.1 Python 端（pandas / openpyxl）

读 Excel 需要 `pandas` + `openpyxl`，CSV 只需 `pandas`。先用一行命令探测：

```bash
python3 -c "import pandas, openpyxl" 2>&1
```

报错（`ModuleNotFoundError`）时，用 AskUserQuestion 询问：

- **A) 装一下**（推荐）—— skill 跑 `pip install pandas openpyxl`
- **B) 用户自己装** —— 用户在另一个终端装好告诉 skill
- **C) 改用粘贴方式** —— 用户粘贴列名 + 前几行，跳过文件读取

**不要静默安装**——pip 装包是用户环境的副作用，必须显式确认。装完后再跑探测命令验证。

环境复杂时（用户机器只有 `python` 没有 `python3`，或用 `conda` / `uv` / `poetry`）：先 `which python python3 conda uv` 探测可用工具，再问用户偏好的安装方式。

### 4.2 R 端

需要的包按 skill 不同：基本是 `tidyverse` / `survival` / `gtsummary` / `tableone` / `logistf` / `survminer` / `broom` / `readxl` 等。探测：

```r
needed <- c("tidyverse", "survival", "gtsummary", "tableone")
missing <- needed[!sapply(needed, requireNamespace, quietly = TRUE)]
if (length(missing) > 0) cat("缺少：", paste(missing, collapse = ", "), "\n")
```

缺包时同样用 AskUserQuestion 三选一（自动 `install.packages()` / 用户自己装 / 改用 base R）。

---

## 5. 文件已存在时的覆盖策略

skill 写产物时（如 `./design-brief.md`、`./paper-results.md`），如果目标文件已存在，**不要直接覆盖**，先用 AskUserQuestion 询问：

- **A) 覆盖**（之前的版本不要了）
- **B) 加版本后缀**（保留旧的，写到 `<filename>.v2.md`、`v3.md` ...）
- **C) 另存到其他路径**（用户给新路径）

如果用户在本会话里已经回答过同一组问题，记住这个偏好，后续同会话不再重复问。

---

## 6. 输出语言切换

### 默认中文

医学/临床研究场景默认中文。SKILL 主体、产物文档、代码注释都用中文。

### 切英文的触发条件

用户提到任一：SCI / 英文期刊 / international submission / English journal / write in English / 投稿到 [英文期刊名]。

切换后产物用学术英文（被动语态、避免第一人称除非期刊允许、术语遵循 STROBE / CONSORT 等规范）。

### 不混用

**绝不在中文段落里夹一句英文行话**（"associated with"、"primary outcome" 这类术语作为引用例外，但完整句子要么全中要么全英）。

### 双语模式

只有用户明确要求"双语"时启用——产物每节中文为主，附"英文段落备选"。

---

## 7. 跨 skill 文件名约定

每个 skill 写到当前目录（cwd）固定语义文件名，下游 skill 通过文件名 Read 上游产物：

| 产物 | 写者 | 读者 |
|---|---|---|
| `./design-brief.md` | study-design | variable-coding / stat-analysis / paper-draft |
| `./coding-rules.md` | variable-coding | stat-analysis / paper-draft |
| `./methods-variables.md` | variable-coding | paper-draft |
| `./recode.R` 或 `./recode.py` | variable-coding（可选） | 用户自跑 |
| `./analysis.R` 或 `./analysis.py` | stat-analysis | 用户自跑 |
| `./results/` | stat-analysis | paper-draft |
| `./interpretation.md` | stat-analysis | paper-draft |
| `./paper-methods.md` | paper-draft | 用户投稿 |
| `./paper-results.md` | paper-draft | 用户投稿 |
| `./paper-tables.md` | paper-draft | 用户投稿 |
| `./paper-abstract.md` | paper-draft（可选） | 用户投稿 |
| `./paper-discussion-skeleton.md` | paper-draft（可选） | 用户投稿 |

### 默认写到 cwd

skill 假设用户已经 `cd` 到研究项目目录。**不要**自动创建 `outputs/` / `<timestamp>/` 等子目录。

如果用户希望写到其他路径，用户会显式告诉 skill；尊重用户指定的路径。

### 多研究项目并存

约定"一个目录 = 一个研究项目"。用户在同一目录跑多个研究时，建议用户给每个研究一个子目录，再 cd 进去。

---

## 8. 用户角色与沟通风格

### 用户画像

- **临床医学博士/硕士研究生**，专业背景临床医学
- **不是统计学家，也不是程序员**——但能读代码、能跟统计学家沟通
- 关注**临床心智模型** > 统计严谨性的细枝末节
- 经常以"粘贴 Excel 内容"或"给文件路径"两种方式提供数据

### 沟通风格

- 解释要**贴临床心智模型**，不要绕统计行话
- 技术术语**首次出现时短解释**（半行），不要长段名词解释
- **观察性研究避免因果语言**——HR/OR 描述为"associated with"/"相关于"，不写"caused by"/"导致"
- 保持**学术语域**，不要 chat 口吻

---

## 9. 跨 skill 的协同顺序

当用户描述一个全新研究项目时，主动建议自然顺序：

```
study-design → variable-coding → stat-analysis → paper-draft
```

但**每个 skill 必须能独立工作**——用户可能从中游进入。如果发现下游 skill 缺上游产物，温和提示一句"建议先用 X 框架化 / 编码"，但不强制。
