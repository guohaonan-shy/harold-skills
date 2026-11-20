# 判官用到的文件格式

`eval-judge` 的脚本（`scripts/judge-*.mjs`）读写的几种文件。脚本和格式都不认识任何项目：判官是什么（角色、步骤、档位、读哪些字段）全在项目给的 scorer description 里；description 的小节怎么排，见下面「description 的结构」。所有文件 `format: 2`；脚本遇到不认识的键就当格式不合格。

```
<任务目录>/                         项目写（judge-job）
  <scorer 名>/<样本>.job.json         scorer 名带斜杠，如 review_report/annotations_correct，所以是两层目录
<结果目录>/                         judge-run 写
  <scorer 名>/<样本>.json             还原后的打分
  <scorer 名>/<样本>.input.md         这次实际交给 Codex 的完整提示
  .work/                            会话的原始文件，不是交付物
    judge-sessions.json             会话记录（项目的 stop 命令读）
    <scorer 名>/<样本>/attempt-N/     第 N 次尝试：codex.log、last.txt、scores.json
```

## 判官任务 `<样本>.job.json`（项目写）

```json
{
  "format": 2,
  "user_task": "<用户任务>",
  "scorer": "<用户任务>/<指标 id>",
  "sample": "<样本编号>",
  "description": "<scorer 的 description 原文>",
  "reads": [{"path": "report.overall_assessment", "name": "总评"}],
  "compare_with": [{"path": "report.user_text", "name": "用户的原文"}],
  "expected": {"natural_language": {"main_issues": []}},
  "reports": [{"side": "baseline", "run": 1, "document": {"report": {}}}]
}
```

- `description` 整段原样交给判官；`reads`、`compare_with` 是从它 `### 读什么` 下「报告片段」「参照」两张表取出的字段（路径加中文名，同一个任务里路径和中文名各不重复），`expected` 是 `expected_output` 里「样本期望」小节点名的部分，不读期望的 scorer 是 `null`。
- `reports` 是这个样本要判的报告：基线 3 份（基线运行存在评测 bucket 里的输出，dataset 里没有）加候选 3 份，每份带 `side` 和 `run`（第几份）；同一边的同一份不出现两次，还原靠它们找回来路。至少 1 份；只判基线时是基线的 3 份。`document` 只放 `report`，保存下来的推理稿不放进来。
- 路径从 `document` 的根写起（`report.annotations[].note`）；`[]` 展开列表，值是同样长的列表（缺的位置是 `null`，各字段的第 i 项属于同一个单元）；嵌套的 `[]` 得到嵌套列表；取不到是 `null`。

## description 的结构

判官的 description 是一份 markdown，小节按下面的顺序（项目一处生成，所有判官同一个样子）。固定提示和 `judge-job` 都靠小节标题找内容：

| 位置 | 内容 |
|---|---|
| 开头一句 | 判官是谁、打分什么；判官站在这个人的位置上判 |
| `### 步骤` | 编号的步骤，最后一步写理由 |
| 计数规则表 | 一张表：每种毛病、怎么算一处、例子；标题随判官而不同，在 `### 步骤` 和 `### 档位` 之间 |
| `### 档位` | 一张表：1.0、0.5、0 到 0.25 各一个可数的条件 |
| `### 读什么` | `#### 报告片段（打分对象）` 和 `#### 参照（…）` 两张表（字段路径、中文名、是什么），然后 `#### 样本期望`：点名用 `expected_output` 的哪几块，或写「不用。」 |

回答的格式（评分文件、编号、`scored` / `unable` / `not_applicable`）不在 description 里：只写在固定提示里。

## 判官看的完整提示 `<样本>.input.md`（`judge-pack` 的 `renderInput`）

依次是：`references/judge-prompt.md` 的固定提示；`# 评分标准`（description 原文）；`# 样本期望`（`expected` 的 JSON，或「这个评分标准不读样本期望」）；`# 报告`，每份报告一节 `## 报告 N`，下面是被点名的每个字段（`### <中文名>` 加它的 JSON 值，不写路径）。

- 报告随机打乱，只剩编号 N（1 到报告份数）；没有边、遍数、样本编号、种子。
- 没被 `reads` 或 `compare_with` 点名的字段（用户读不到的中间稿）一个字也不在里面。
- 这个文件整个存进结果目录和 bucket：它是判官看到的全部，所以不放任何只有调用方知道的东西。

## 对应关系（`judge-run` 在内存里留着，`judge-pack` 命令行写成 `mapping.json`）

```json
{"format": 2, "scorer": "...", "sample": "...", "seed": 123,
 "labels": [{"label": 1, "side": "candidate", "run": 2}], "expect": {"reports": 6}}
```

`expect` 是评分文件应有的形状，`judge-validate` 照它验。每一次尝试（包括重判）重新打乱，所以每一次有自己的映射。映射不单独存，还原后的 `<样本>.json` 里每份报告带着它的标签。

## 评分文件 `scores.json`（判官写在会话的当前目录）

```json
{"format": 2, "reports": [
  {"label": 1, "status": "scored", "score": 0.5, "reason": "「引报告原文」……"},
  {"label": 2, "status": "unable", "reason": "缺了什么"}
]}
```

每个编号恰好一格。`status`：

| status | 有 `score` | 意思 |
|---|---|---|
| `scored` | 是，0 到 1 的数 | 打了分，理由引报告原文（一到三句） |
| `unable` | 不能有 | 无法判断：信息不足，理由说缺什么，不硬给分 |
| `not_applicable` | 不能有 | 不适用：这个样本不满足评分标准说的适用条件；同一个样本的所有报告一致 |

`unable` 和 `not_applicable` 都不进平均（统计脚本把没有 `score` 的格子排除），也不会变成 0 分。

不合格（`judge-validate`）：报告编号缺 / 重 / 越界、分数不在 0 到 1、理由为空、状态不认识、`unable` / `not_applicable` 带了分数、同一个样本里一部分报告不适用一部分不是、多余的键、`format` 不是 2。不合格就当没交回。

## 结果 `<样本>.json`（`judge-run` 写）

```json
{
  "format": 2, "user_task": "...", "scorer": "...", "sample": "...",
  "unevaluated": false,
  "model": "gpt-6-luna", "effort": "high", "codex_version": "codex-cli 0.159.2",
  "duration_ms": 13342, "tokens_used": 8647, "retries": 0,
  "reports": [{"side": "baseline", "run": 1, "label": 2, "status": "scored", "score": 0.5, "reason": "..."}],
  "errors": []
}
```

- `reports` 已还原成基线 / 候选的第几份（基线在前，同一边按第几份排），`label` 是它在 `.input.md` 里的「报告 N」。
- `retries` 是重判了几次（0 或 1）；`errors` 是没被采用的那几次各自出了什么问题。`duration_ms`、`tokens_used` 是各次尝试之和，`tokens_used` 取不到是 `null`。
- 重判后仍没有合格评分：`unevaluated: true`，`reports` 是空的（没有任何分数，不是 0 分），`errors` 点名两次各自哪里不对。

## 折成统计脚本读的形状（`judge-settle --results-dir`）

```json
{"ok": false,
 "samples": {
   "<样本>": {"status": "judged",
     "baseline": [{"run": 1, "label": 2, "scores": {"<指标 id>": {"status": "scored", "score": 0.8, "reason": "..."}}}],
     "candidate": []},
   "<样本>": {"status": "unevaluated", "errors": ["<scorer>：第 1 次：…"]}},
 "retry": [], "unevaluated": ["<样本>"], "summary_unevaluated": [], "core_issues": {"new_in_candidate": [], "fixed_in_candidate": [], "both": []}}
```

指标 id 是 scorer 名的最后一段。一个样本的所有 scorer 都评出来才是 `judged`；任何一个 scorer 在这个样本上未评测，样本就是 `unevaluated`，没有任何分数，不进配对。核心问题不在这里整理，三类恒为空。

## 会话记录 `judge-sessions.json`（`judge-run` 追加）

```json
{"format": 1, "sessions": [{"pid": 4242, "pgid": 4242, "started": "Sun Oct 25 12:00:01 2026", "label": "review_report/tone/3", "model": "gpt-6-luna", "effort": "high", "cwd": "/…", "launched_at": "2026-10-28T04:00:01.000Z"}]}
```

`started` 是进程的启动时间（`ps -o lstart=`）：认进程用，防止进程号被复用后误杀别的进程。项目的 stop 命令读这个文件，整组结束还活着的会话。
