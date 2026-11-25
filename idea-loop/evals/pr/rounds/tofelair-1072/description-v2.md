## 问题

Email 报告先由推理 AI 任务写一份推理原文（markdown，学生看不到），再由抽取转成报告。推理原文的要求覆盖每条要求一行，行首引号里的几个词叫**要求覆盖锚点**，本该照抄题目那条要求的开头。抽取按行的顺序给要求编号、不读锚点，所以锚点是唯一能发现「漏了一条、顺序乱了」的地方：一旦错位，学生看到的「第 2 条已完成」其实是第 3 条的结论。

线上的第 7 版提示词对引号里写什么前后矛盾，模型照着把学生原话写进了锚点，拿锚点去对题目要求的那条断言（下面叫**对齐断言**）几乎份份不过。学生现在看不到错（这批样本的条数和状态都对），但自 11-20 Email 全量走第 7 版起，每份 Email 报告都没有了这道检查。

| 基线 `baseline-email_report-20261120`（11-20 的线上配置，21 个样本 × 3 遍） | 结果 |
|---|---|
| 锚点以题目要求的前 3 个词开头的行 | 24 / 202 行（12%） |
| 对齐断言通过 | 3 / 78 份抽取；不过的 75 份全因锚点，没有一份是条数或状态错 |
| 例：样本《Orientation conflict》第 1 条要求 | 锚点写成学生的 "Unfortunately, I have..."，题目要求开头是 "Explain why you cannot attend..." |

出处：#1070 正文与 spec `email-coverage-anchor`，2026-11-20 的基线。

## 概要

给推理 AI 任务 `writing_email_analysis` 加第 8 版提示词：第 7 版只换要求覆盖一节的规则句和模板行两处，其余逐字不变，实验的差异才能归到这一处。

```diff
 ## Requirement Coverage（email_writing_v2.py，_get_analysis_md_system_v4）
-规则句：Each line quotes, in double quotes and **bold**, the student's own words that do or fail the requirement ...
+规则句：Each line has two parts. 引号里是这条要求的开头，从 Task Understanding 的 Requirements 照抄，不是学生的话；
+        学生原话只放破折号后的理由里。例子：for the requirement "Describe the damage to the rental bike you returned" ...
+        （例子里的要求选了评测样本和题库里都没有的一条，模型照抄例子就过不了对齐断言）
-模板行：- R1 "<the first words of the requirement, copied>...": <状态> — <the reason, quoting the student>
+模板行：- R1 "<the first words of R1 under Requirements in Task Understanding, copied>...": <状态> — <the reason, quoting the student's words ...>
```

线上切到第 8 版，第 7 版的组留着供回滚（`ai_tasks.yaml`）：

```diff
 writing_email_analysis:
-  refactor   (第 7 版)  weight: 10000
+  refactor   (第 7 版)  weight: 0
+  anchor-v8  (第 8 版)  weight: 10000   # from_experiment: email-coverage-anchor
```

## 证据

- **之前**：21 个 Email 样本各跑 3 遍推理，用第 7 版提示词（基准分支的线上配置，即基线）：锚点照抄题目要求的 24 / 202 行（12%）。
  **之后**：同 21 个样本各跑 3 遍，用第 8 版：190 / 201 行（95%）。

对齐断言本身：第 8 版 63 份抽取过 53 份，没过的 10 份里 7 份锚点只抄了 2 个词（断言要 3 个），2 份格式偏差（锚点本身对），1 个样本有 2 遍仍写成学生原话；同 63 份在第 7 版上过几份〔缺：复现，用第 7 版对同 21 个样本 × 3 遍跑一次对齐断言。基线的 3 / 78 是另一组 78 份抽取，不能拿来比〕。这些数是手动补算的：实验两段都不跑对齐断言（#1091）。

别处没变差：同一次实验里，硬性底线 8 条全部与基线持平，6 个判官的变化都在 ±0.05 以内。

```text
第 8 版提示词
  规则句写明「引号里照抄要求开头、不是学生的话；学生原话只在理由里」
  第 7 版那句「每行引号里引学生原话」第 8 版没有、第 7 版仍有
  跟第 7 版比：题目上下文相同，系统提示词只差 2 行（规则句、模板行）
  例子里那条要求的前 5 个词，跟所有评测样本的要求都不同
  推理 AI 任务登记的版本是 1 到 8，第 9 版拒收
第 1 到 7 版发给模型的请求，逐字节等于存档的原样请求（只追加了第 8 版的 7 份）
线上配置：Email 推理的全部学生落进第 8 版的组，第 7 版的组权重 0
```

全量：后端 CI 的 unit、api 两组通过；本地 1749 个测试通过。

## 合并风险

**门**：双向。撤销合并、重新部署，学生就回到第 7 版；第 7 版的组一直留在配置里，不用另改。
**影响面**：所有新生成的 Email 报告。学生读到的报告结构和内容不变（锚点不进报告）。
- 兼容：第 1 到 7 版的提示词一字不改，旧版本的请求逐字节不变。
- 刻意没做：对齐断言不放宽，抽取不改（仍按行序编号，不读锚点）。

## 要你做的事

- [ ] 合并部署后，同意花约 4.2 到 6.1 美元按新的线上配置重跑 Email 报告的基线（项目规则：全量上线后升基线），之后的实验才对得上第 8 版。回一句「同意，跑吧」，由会话来跑。

说「合并」即可。

Refs guohaonan-shy/Tofelair#1070
