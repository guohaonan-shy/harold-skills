---
name: eval-judge
description: 判官：给一个样本上的一个 scorer 打分。一轮实验到了判官这一步、要重判某几个 scorer 或样本、要单独重判一批报告，或要结束判官会话时用。
---

# eval-judge

判官是 numeric 的 scorer，它的 description 就是它的全部指令（开头一句的角色、步骤、计数规则、档位、读什么；结构见 `references/judge-format.md`）。每个 scorer × 样本起一次全新的 `codex exec`：判官读这个样本的候选 3 份和基线 3 份，共 6 份（编号打乱、抹掉来源；只判基线时读基线的 3 份），写一个评分文件，会话结束。松紧对每一份报告一样，分差只来自报告本身。判完由脚本按打乱时存下的对应关系还原。

脚本在 `<插件目录>/scripts/`（`judge-*.mjs`），文件格式在 `references/judge-format.md`，固定提示在 `references/judge-prompt.md`。项目的事实只从 `EVAL.md` 读。

## 词

- **判官任务**：一个 scorer 在一个样本上的全部输入：description 原文、要读的字段（路径加中文名）、期望、这个样本的报告，项目写，带着哪份是哪边。
- **打包**：`judge-pack` 把报告打乱，写出判官看的完整提示；编号对应关系只留在调用方。
- **尝试（attempt）**：首判是第 1 次；评分文件没交回或不合格，同一个任务重新打乱再判一次，是第 2 次。
- **未评测**：两次都没有合格评分的任务。它没有分数，不是 0 分，不进配对。

## 步骤

### 1. 读 EVAL.md

读「判官配置」「费用与额度」。

完成条件：你能说出模型和思考强度、同时跑几个、生成判官任务的命令、结果目录怎么存进 bucket。

### 2. 生成判官任务

用 EVAL.md 里 `judge-job` 的命令，写到一个任务目录。任务表给这个用户任务的 dataset 和 scorer（PostHog 里的定义）是它的输入：`POSTHOG_PERSONAL_API_KEY` 读不到 LLM analytics、或没有评测数据库的地址（`EVAL.md`「费用与额度」）时命令会说明缺什么，停下交回，不绕过去。

基线的报告是基线运行存在 bucket 里的输出：命令带 `--baseline <基线 id>`，每个样本读它的 3 份（`--baseline-runs` 改份数）。

完成条件：每个要判的 scorer × 样本一个 `<任务目录>/<scorer 名>/<样本>.job.json`。样本在基线里没有输出文件时命令报错：先跑基线。

### 3. 起判官

```
node <插件目录>/scripts/judge-run.mjs --jobs-dir <任务目录> --out-dir <结果目录> --concurrency 6
```

起之前先对人说规模：几个 scorer × 几个样本 = 几次会话，同时跑几个，预计多久（一次会话约十几秒到几分钟，按样本里报告的长短）；EVAL.md 写了要先问的额度，等人同意。`judge-run` 在前台等所有会话结束；用后台命令起它，用 Monitor 等，不要连续轮询，并告诉人你在等什么、大约多久。

`judge-run` 对每个任务做：打包（打乱）→ `codex exec`（模型 `gpt-6-luna`，思考强度 high，扣留 `OPENAI_API_KEY`、`CODEX_API_KEY`）→ 验评分文件 → 还原。没交回或格式不合格，这个任务重新打乱再判一次；还不行记未评测。每个会话领一个进程组，记进会话记录（默认 `<结果目录>/.work/judge-sessions.json`，要停判官时读它）。

完成条件：`judge-run` 退出。退出码 0 全部评出，1 有未评测，2 任务写错（原因在 stderr，改了再来），130 被叫停（会话被信号结束，没写的任务补跑）。

### 4. 还原，交回

```
node <插件目录>/scripts/judge-settle.mjs --results-dir <结果目录>
```

输出是统计脚本（`paired-stats`）读的形状：每个样本 `judged`（它所有 scorer 都评出来了）或 `unevaluated`（任何一个 scorer 未评测，样本就没有分数）。未评测的样本照实交给上游，不补分数、不换个样子再判一遍；样本因此不够时，上游判「样本不足」。

要存进 bucket 时（实验有 id 之后）：

```
<EVAL.md「判官配置」写的上传命令> --experiment <实验 id> --dir <结果目录>
```

完成条件：上游拿到的每个样本，要么有还原后的评分，要么在 `unevaluated` 里；结果目录的每个任务有 `.json` 和 `.input.md` 两份文件，已存进 bucket。

## 看判官判得对不对

判官的分看起来不对时，读那个任务的 `.input.md`：它是判官看到的全部，对着 description `### 读什么` 的两张表和「样本期望」核对：该给的片段给全了没有（片段标题就是表里的中文名）、不该给的有没有混进来。理由在 `.json` 里，标签对着 `.input.md` 的「报告 N」。是评分标准没说清，就改 scorer 的 description（PostHog 里），重判；是片段没给全，改 description 的 `### 读什么`。

## 结束判官会话

读会话记录，对每条还活着的会话的 `pgid` 发终止信号；记录里的进程启动时间对不上的（进程号被别的进程用了）不动。`judge-run` 发现会话被信号结束，就不再起新的，整批退出（130）。

## 单独重判

只重判某几个 scorer 或样本、或评分标准改了要重新判：重新生成任务（或沿用任务目录），`judge-run` 用 `--scorers`、`--samples` 限定，结果目录换一个新的。已经评出、只想补跑缺的：同一个结果目录加 `--skip-done`，它跳过已评出的任务。

## 两个判官判同一批报告（判官指标审核的一致性）

要比较两个判官对同一批报告的分数（`ai-eval:eval-metrics-review` 的第 4 步）：

1. 生成判官任务时只给一个实验的报告（只带 `--baseline`，任务里只有基线那一份；或只带 `--candidate`）。
2. 同一个任务目录跑两次，结果目录不同（`<A>`、`<B>`）。两次各自打乱、各自一次全新的会话，互相看不到。
3. 各转成一致性输入，喂 `judge-agreement`：

```
node <插件目录>/scripts/judge-settle.mjs --results-dir <A> --agreement A > a.json
node <插件目录>/scripts/judge-settle.mjs --results-dir <B> --agreement B > b.json
node <插件目录>/scripts/judge-agreement.mjs --a a.json --b b.json
```

完成条件：两份输入的报告集合相同。某个任务在其中一次未评测时集合对不上，`judge-agreement` 会报输入有误，不当作一致。

## 已知的限制

- 判官看不到边，靠的是提示里没有；判官的会话对整个磁盘可读，所以任务目录、映射不放在会话的工作目录里（会话的当前目录是 `<结果目录>/.work/…/attempt-N/`，只有它自己的文件）。
- 并发数是脚本参数；Codex 订阅有速率限制，调高之前先看一次的耗时和 token 数（结果的 `duration_ms`、`tokens_used`）。
